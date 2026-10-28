const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
    return module.exports;
}
function progress() {
    const values = new Map();
    return load('mobile-app/src/lib/book-progress.ts', { './storage': { cacheService: {
        getObject: key => values.get(key), setObject: (key, value) => values.set(key, value),
    } } }).bookProgress;
}
test('reader and listener share the latest selection including backwards navigation and book isolation', () => {
    const shared = progress();
    assert.equal(shared.getChapter('book', 3), 3);
    shared.saveChapter('book', 8);
    assert.equal(shared.getChapter('book'), 8);
    shared.saveChapter('book', 2);
    assert.equal(shared.getChapter('book', 8), 2);
    assert.equal(shared.getChapter('other', 4), 4);
    for (const invalid of [-1, 1.5, NaN]) shared.saveChapter('book', invalid);
    assert.equal(shared.getChapter('book'), 2);
});
test('rapid chapter changes serialize server writes and skip obsolete queued selections', async () => {
    const shared = progress();
    let release;
    const gate = new Promise(resolve => release = resolve);
    const writes = [];
    const { bookService } = load('mobile-app/src/services/book.service.ts', {
        '../lib/book-progress': { bookProgress: shared }, '../lib/api-client': { api: {
            patch: async (_, body) => { writes.push(body.chapterId); if (writes.length === 1) await gate; return { data: body }; },
        } },
    });
    const first = bookService.updateProgress('book', 7);
    await new Promise(resolve => setImmediate(resolve));
    const second = bookService.updateProgress('book', 4);
    const last = bookService.updateProgress('book', 1);
    assert.equal(shared.getChapter('book'), 1, 'switching screens reads progress immediately');
    release(); await Promise.all([first, second, last]);
    assert.deepEqual(writes, [7, 1]);
});
test('both screens restore the shared chapter when they regain focus', async () => {
    const shared = progress();
    for (const screen of ['reader', 'listen']) {
        const file = 'mobile-app/app/' + screen + '/[id].tsx';
        const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        let callback;
        function visit(node) {
            if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') { const candidate = node.arguments[0].arguments[0].getText(ast); if (candidate.includes('bookService.syncProgress')) callback = candidate; }
            ts.forEachChild(node, visit);
        }
        visit(ast); assert.ok(callback);
        let selected;
        const context = { nativeReconcile: { current: async () => false }, alive: { current: true }, AppState: { addEventListener: () => ({ remove() {} }) }, isSpeakingRef: { current: false }, playIntent: { current: false }, bookProgress: shared, setProgressReady() {}, bookService: { syncProgress: async id => shared.getChapter(id) }, id: 'book', book: { id: 'book', chapters: Array(10) },
            readerSelectionRef: { current: { chapterId: '0' } }, indexRef: { current: 0 },
            setChapterId: value => selected = Number(value), setCurrentChapterIndex: value => selected = value };
        shared.saveChapter('book', 6); vm.runInNewContext('(' + callback + ')()', context); await new Promise(resolve => setImmediate(resolve)); assert.equal(selected, 6);
        shared.saveChapter('book', 2); vm.runInNewContext('(' + callback + ')()', context); await new Promise(resolve => setImmediate(resolve)); assert.equal(selected, 2);
    }
});


test('fresh web progress overrides an older Android chapter, including moving backwards', async () => {
    const shared = progress(); shared.saveChapter('book', 8);
    const { bookService } = load('mobile-app/src/services/book.service.ts', {
        '../lib/book-progress': { bookProgress: shared }, '../lib/api-client': { api: {
            get: async url => { assert.equal(url, '/books/book?progress=1&chapters=metadata'); return { data: { chapterId: 2 } }; },
        } },
    });
    assert.equal(await bookService.syncProgress('book'), 2);
    assert.equal(shared.getChapter('book'), 2);
});

test('an in-flight server read cannot undo a newer local selection, even after a round trip', async () => {
    const shared = progress(); shared.saveChapter('book', 8);
    let respond;
    const pending = new Promise(resolve => respond = resolve);
    const { bookService } = load('mobile-app/src/services/book.service.ts', {
        '../lib/book-progress': { bookProgress: shared }, '../lib/api-client': { api: { get: async () => pending } },
    });
    const sync = bookService.syncProgress('book');
    await new Promise(resolve => setImmediate(resolve));
    shared.saveChapter('book', 9); shared.saveChapter('book', 8);
    respond({ data: { chapterId: 2 } });
    assert.equal(await sync, 8); assert.equal(shared.getChapter('book'), 8);
});

test('server reads wait for queued Android progress writes', async () => {
    const shared = progress();
    let release; const gate = new Promise(resolve => release = resolve);
    const requests = [];
    const { bookService } = load('mobile-app/src/services/book.service.ts', {
        '../lib/book-progress': { bookProgress: shared }, '../lib/api-client': { api: {
            patch: async () => { requests.push('write'); await gate; return { data: {} }; },
            get: async () => { requests.push('read'); return { data: { chapterId: 4 } }; },
        } },
    });
    const write = bookService.updateProgress('book', 4);
    const sync = bookService.syncProgress('book');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, ['write']); release();
    await write; assert.equal(await sync, 4); assert.deepEqual(requests, ['write', 'read']);
});


test('restoring a cached or synchronized chapter does not write it back over another device', async () => {
    const shared = progress(); shared.saveChapter('book', 4);
    const { bookService } = load('mobile-app/src/services/book.service.ts', {
        '../lib/book-progress': { bookProgress: shared }, '../lib/api-client': { api: {
            patch: async () => assert.fail('restoring progress must not send a chapter update'),
        } },
    });
    await bookService.updateProgress('book', 4);
});

test('restored native playback publishes its chapter even if the local cache already has that index', async () => {
 const shared=progress();shared.saveChapter('book',3);const writes=[];
 const {bookService}=load('mobile-app/src/services/book.service.ts',{
  '../lib/book-progress':{bookProgress:shared},'../lib/api-client':{api:{patch:async (_,body)=>{writes.push(body.chapterId);return{data:body}}}}
 });
 await bookService.updateProgress('book',3);assert.deepEqual(writes,[]);
 await bookService.updateProgress('book',3,0,true);assert.deepEqual(writes,[3]);
});
