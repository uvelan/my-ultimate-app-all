const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function helper(intl = Intl) {
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/lib/reader-metadata.ts'), 'utf8')),
    { module, exports: module.exports, Intl: intl });
  return module.exports;
}
const metadata = helper();
test('reader voice labels translate Android language identifiers and preserve exact selection IDs', () => {
  const voices = [
    { identifier: 'en-us-x-tpf-local', name: 'en-us-x-tpf-local', language: 'en-US' },
    { identifier: 'id-id-x-idd-local', name: 'id-id-x-idd-local', language: 'id-ID' },
    { identifier: 'ur-pk-x-cfn-network', name: 'ur-pk-x-cfn-network', language: 'ur-PK' },
  ];
  for (const formatter of [metadata, helper({})]) {
    const labels = formatter.readableReaderVoices(voices);
    assert.deepEqual(Array.from(labels, voice => voice.label), ['English (US)', 'Indonesian (Indonesia)', 'Urdu (Pakistan)']);
    assert.deepEqual(Array.from(labels, voice => voice.identifier), voices.map(voice => voice.identifier));
    assert.equal(labels.some(voice => voice.label.includes('-x-')), false);
  }
});
test('reader voice labels retain human names and distinguish duplicate voices without displaying technical IDs', () => {
  const voices = [
    { identifier: 'en-us-x-a-local', name: 'en-us-x-a-local', language: 'en-US' },
    { identifier: 'en-us-x-b-local', name: 'en-us-x-b-local', language: 'en-US' },
    { identifier: 'en-us-x-c-network', name: 'en-us-x-c-network', language: 'en-US' },
    { identifier: 'com.apple.voice.compact.en-US.Samantha', name: 'Samantha', language: 'en-US' },
  ];
  assert.deepEqual(Array.from(metadata.readableReaderVoices(voices), voice => voice.label), [
    'English (US) — On-device — Voice 1', 'English (US) — On-device — Voice 2',
    'English (US) — Online', 'English (US) — Samantha',
  ]);
});
test('reader metadata never replaces a real book title with absent, blank or Unknown Book placeholders', () => {
  const previous = { title: 'The River', chapters: [{ order: 0, title: 'Opening' }], custom: 'preserved' };
  for (const title of [undefined, '', '   ', 'Unknown Book', ' unknown  book ']) {
    const result = metadata.mergeReaderBookMetadata(previous, { title, chapters: [{ order: 0, title: 'New opening' }] });
    assert.equal(result.title, 'The River'); assert.equal(result.custom, 'preserved');
    assert.equal(result.chapters[0].title, 'New opening');
  }
  assert.equal(metadata.mergeReaderBookMetadata({ title: 'Unknown Book' }, { title: ' Actual title ' }).title, 'Actual title');
  assert.equal(metadata.mergeReaderBookMetadata({ title: 'Unknown Book' }, {}).title, undefined);
});

const readerPath = path.resolve(__dirname, '../mobile-app/app/reader/[id].tsx');
const ast = ts.createSourceFile(readerPath, fs.readFileSync(readerPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let bulk, titleExpression, loadTitle, notify;
function inspect(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'bulkFetchAndCache') bulk = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'bookTitleCache') titleExpression = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const body = node.arguments[0].getText(ast);
    if (body.includes('bookService.getBook(id)')) loadTitle = body;
    if (body.includes('playbackNotificationService.showNotification(title, chapter')) notify = body;
  }
  ts.forEachChild(node, inspect);
}
inspect(ast); assert.ok(bulk && titleExpression && loadTitle && notify);
const callbacks = compile(`const bulk = ${bulk}; module.exports = {bulk, loadTitle: ${loadTitle}, notify: ${notify}, title: () => (${titleExpression})};`);
const flush = () => new Promise(resolve => setImmediate(resolve));
function readerHarness(previous, options = {}) {
  const cache = new Map([['book_meta_book', previous]]), titles = [], notifications = [], requests = [];
  let resolveBook;
  const bookPromise = new Promise(resolve => { resolveBook = resolve; });
  const state = { ...metadata, module: { exports: {} }, useCallback: callback => callback,
    id: 'book', chapterId: '0', currentChapterNum: 0, chapterList: [{ order: 0, title: 'Opening' }, { order: 1, title: 'Next' }],
    bookMetadataTitle: null, readerSelectionRef: { current: { bookId: 'book', chapterId: '0' } },
    isSpeaking: true, isPaused: false, rate: 1, console: { warn() {}, error() {} },
    cacheService: { getObject: key => cache.get(key), setObject: (key, value) => cache.set(key, value) },
    bookService: {
      getBook: id => { requests.push(['book', id]); return options.offline ? Promise.reject(new Error('offline')) : bookPromise; },
      getAllChapters: async id => { requests.push(['chapters', id]); return { chapters: [{ order: 0, title: 'Opening', content: ['Text'] }] }; },
    },
    offlineService: { getCachedChapterIds: () => options.cached ? ['0'] : [], saveAllChapters: async () => {} },
    setBookMetadataTitle: value => { state.bookMetadataTitle = value; titles.push(value); },
    setChapterList: value => { state.chapterList = value; }, setTotalChapters() {}, setBulkLoading() {}, setIsOffline() {},
    setPlayerState() {}, clearPlayerState() {},
    playbackNotificationService: { showNotification: async (...args) => { notifications.push(args); }, stopNotification: async () => {} },
  };
  state.exports = state.module.exports;
  vm.runInNewContext(callbacks, state);
  const functions = state.module.exports;
  return { state, functions, cache, titles, requests, notifications, resolveBook,
    notify() { state.bookTitleCache = functions.title(); functions.notify(); } };
}
test('reader independently repairs Unknown Book metadata even when cached chapters skip the bulk API', async () => {
  const reader = readerHarness({ title: 'Unknown Book', chapters: [{ order: 0, title: 'Opening' }, { order: 1, title: 'Next' }] }, { cached: true });
  reader.functions.loadTitle(); await reader.functions.bulk('book');
  assert.deepEqual(reader.requests, [['book', 'book']]);
  reader.resolveBook({ title: 'The River' }); await flush();
  reader.notify(); assert.deepEqual(reader.notifications.at(-1), ['The River', 'Opening', true, 'tts', 1]);
  reader.state.chapterId = '1'; reader.state.currentChapterNum = 1; reader.notify();
  assert.deepEqual(reader.notifications.at(-1), ['The River', 'Next', true, 'tts', 1]);
});
test('reader concurrent book and chapter responses merge without erasing either the real title or chapter index', async () => {
  for (const bookFirst of [true, false]) {
    const reader = readerHarness({ title: 'Unknown Book' });
    reader.functions.loadTitle();
    if (bookFirst) { reader.resolveBook({ title: 'The River' }); await flush(); }
    await reader.functions.bulk('book');
    if (!bookFirst) { reader.resolveBook({ title: 'The River' }); await flush(); }
    assert.equal(reader.cache.get('book_meta_book').title, 'The River');
    assert.equal(reader.cache.get('book_meta_book').chapters[0].title, 'Opening');
    reader.notify(); assert.equal(reader.notifications.at(-1)[0], 'The River');
  }
});
test('reader offline metadata preserves cached title and late previous-book responses cannot change the active title', async () => {
  const offline = readerHarness({ title: 'Saved Book' }, { offline: true });
  offline.functions.loadTitle(); await flush(); offline.notify();
  assert.equal(offline.notifications.at(-1)[0], 'Saved Book');
  const reader = readerHarness({ title: 'Previous' });
  const stop = reader.functions.loadTitle(); const changes = reader.titles.length;
  stop(); reader.state.readerSelectionRef.current.bookId = 'different';
  reader.resolveBook({ title: 'Late previous book' }); await flush();
  assert.equal(reader.titles.length, changes, 'stale metadata cannot update active reader state');
  assert.equal(reader.cache.get('book_meta_book').title, 'Late previous book', 'metadata stays scoped to its own cached book');
});
