const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, dependencies = {}) {
 const module = { exports: {} }; vm.runInNewContext(compile(fs.readFileSync(path.resolve(__dirname, '../mobile-app/' + file), 'utf8')),
 { module, exports: module.exports, require: name => dependencies[name], Error }); return module.exports;
}
const paragraphs = load('src/lib/chapter-content.ts');
test('reader chapter positions resolve one-based and sparse server orders for reads and edits', async () => {
 const calls = []; let orders = [9, 1, 4];
 const api = {
  get: async (url, options) => { calls.push({ url, options }); return { data: url.includes('metadata') ? { chapters: orders.map(order => ({ order })) } : { content: ['Fresh content'] } }; },
  patch: async (url, body) => { calls.push({ url, body }); return { data: {} }; },
 };
 const { bookService } = load('src/services/book.service.ts', { '../lib/api-client': { api }, '../lib/book-progress': {} });
 await bookService.getChapterContent('book', '0'); await bookService.getChapterContent('book', '1');
 await bookService.updateChapterContent('book', '2', 'Edited');
 assert.deepEqual(calls.map(call => call.url), ['/books/book?chapters=metadata', '/books/book/chapters/1', '/books/book/chapters/4', '/books/book/chapters/9']);
 orders = [2, 7]; await bookService.getChapterContent('book', '0', true);
 assert.equal(calls.at(-1).url, '/books/book/chapters/2'); assert.equal(calls.at(-1).options.headers['Cache-Control'], 'no-cache');
 assert.ok(calls.at(-1).options.params._refresh);
});
test('position-keyed caches keep one-based chapters distinct and migrate legacy files using metadata', async () => {
 const files = new Map(), prefs = new Map();
 const cacheService = { getObject: key => prefs.get(key), setObject: (key, value) => prefs.set(key, value), delete: key => prefs.delete(key) };
 const { offlineService } = load('src/services/offline.service.ts', {
  '@/src/lib/storage': { cacheService }, '../lib/chapter-content': paragraphs,
  'expo-file-system/legacy': { cacheDirectory: 'file:///cache/',
   getInfoAsync: async uri => ({ exists: uri.endsWith('/books/') || files.has(uri) }), makeDirectoryAsync: async () => {},
   readAsStringAsync: async uri => files.get(uri), writeAsStringAsync: async (uri, value) => files.set(uri, value), deleteAsync: async uri => files.delete(uri) },
 });
 prefs.set('book_meta_legacy', { chapters: [{ order: 1 }, { order: 3 }] });
 files.set('file:///cache/books/legacy_1.json', JSON.stringify({ content: 'First chapter' }));
 files.set('file:///cache/books/legacy_3.json', JSON.stringify({ content: 'Second chapter' }));
 assert.equal(await offlineService.getChapter('legacy', '0'), 'First chapter');
 assert.equal(await offlineService.getChapter('legacy', '1'), 'Second chapter');
 await offlineService.saveAllChapters('new', [{ order: 1, content: ['First'] }, { order: 3, content: ['Second'] }]);
 assert.equal(await offlineService.getChapter('new', '0'), 'First'); assert.equal(await offlineService.getChapter('new', '1'), 'Second');
 await offlineService.saveChapter('legacy', '0', 'Refreshed'); assert.equal(await offlineService.getChapter('legacy', '0'), 'Refreshed');
 assert.equal(await offlineService.getChapter('legacy', '1'), 'Second chapter');
});
const source = fs.readFileSync(path.resolve(__dirname, '../mobile-app/app/reader/[id].tsx'), 'utf8');
const ast = ts.createSourceFile('reader.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let loadChapter;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadChapterFromCache') loadChapter = node.initializer.arguments[0].getText(ast); ts.forEachChild(node, visit); } visit(ast);
function reader(fetchChapter) {
 const writes = [], saves = [], state = { module: { exports: {} }, readerSelectionRef: { current: { bookId: 'book', chapterId: '0' } }, chapterLoadRef: { current: 0 },
  console: { warn() {}, error() {} }, toStr: value => paragraphs.chapterContentParagraphs(value).join('\n'),
  bookService: { getChapterContent: fetchChapter }, offlineService: { getChapter: async () => 'Old cached text', saveChapter: async (...args) => saves.push(args) },
 };
 for (const name of ['Loading','LoadError','CacheNotice','RawContent','LoadedChapterTitle']) state['set'+name] = value => writes.push([name, value]);
 state.exports = state.module.exports; vm.runInNewContext(compile('module.exports = ' + loadChapter), state);
 return { state, writes, saves, load: state.module.exports };
}
test('Refresh cached chapter bypasses old text, normalizes rich text and replaces only that cache entry', async () => {
 const calls = [], app = reader(async (...args) => { calls.push(args); return { title: 'Opening', content: [{ type: 'paragraph', children: [{ text: 'Fresh chapter.' }] }] }; });
 await app.load('book', '0', true);
 assert.deepEqual(calls, [['book','0',true]]); assert.deepEqual(app.saves, [['book','0','Fresh chapter.']]);
 assert.equal(app.writes.filter(([key]) => key === 'RawContent').at(-1)[1], 'Fresh chapter.');
 assert.equal(app.writes.filter(([key]) => key === 'CacheNotice').at(-1)[1], 'Chapter cache refreshed.');
});
test('failed refresh retains old text and cache, and late responses cannot replace a newly selected chapter', async () => {
 const failed = reader(async () => { throw new Error('Offline'); }); await failed.load('book','0',true);
 assert.equal(failed.saves.length, 0); assert.equal(failed.writes.some(([key]) => key === 'RawContent'), false);
 assert.match(failed.writes.filter(([key]) => key === 'LoadError').at(-1)[1], /Offline/);
 let resolve; const app = reader(() => new Promise(done => { resolve = done; }));
 const pending = app.load('book','0',true); app.state.readerSelectionRef.current.chapterId = '1'; resolve({ content: ['Late'] }); await pending;
 assert.equal(app.saves.length, 0); assert.equal(app.writes.some(([key]) => key === 'RawContent'), false);
});
