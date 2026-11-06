const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../mobile-app', file), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, console, AbortController, require: name => {
  if (!(name in dependencies)) throw Error(name); return dependencies[name];
 } });
 return module.exports;
}
const clean = load('src/lib/chapter-narration.ts');
const content = load('src/lib/chapter-content.ts');
const narration = load('src/lib/kokoro-text.ts', { './chapter-content': content, './chapter-narration': clean });
const sync = load('src/lib/narration-sync.ts', { './chapter-content': content });
const drive = load('src/lib/drive-audio.ts', { './chapter-narration': clean, './narration-sync': sync });
const key = 'a'.repeat(64);
const record = { identity: key, title: 'Chapter 435', chapterIndex: 438, voice: 'af_bella', format: 'wav', audioFile: `chapters/${key}.wav`, manifestFile: `chapters/${key}.json` };
const catalog = { schema: 'ultimate-drive-audio', schemaVersion: 1, bookId: 'epub-' + 'b'.repeat(64), chapters: [], recordings: { [key]: record } };
const manifest = { voice: 'af_bella', format: 'wav', model: 'kokoro-v1.0', sampleRate: 24000,
 sync: { version: 1, title: 'Chapter 435', paragraphs: ['Chapter 435', 'Actual prose.'], segments: [{ text: 'Actual prose.', start: 0, end: 1 }] } };

test('phone conversion keeps generating after its screen unsubscribes and reports the result when reopened', async () => {
 const calls = [];
 let generation;
 const ready = new Promise(resolve => { generation = resolve; });
 let finishAudio;
 const audio = new Promise(resolve => { finishAudio = resolve; });
 const { phoneConversion } = load('src/services/phone-chapter.service.ts', {
  'react-native': {
   NativeModules: { LocalChapterSync: {
    startPhoneConversion: async () => { calls.push('foreground started'); },
    stopPhoneConversion: async () => { calls.push('foreground stopped'); },
    savePhoneChapter: async () => { calls.push('audio saved'); },
   } },
   DeviceEventEmitter: { addListener: () => ({ remove() {} }) },
  },
  'expo-file-system/legacy': { deleteAsync: async () => {} },
  '../lib/listen-audio': { audioIdentityKey: () => 'key', assertAudioActive: signal => signal.throwIfAborted() },
  './book.service': {},
  './local-sync.service': { localSyncService: { get: async () => null, refresh: async () => {} } },
  './kokoro.service': { kokoroService: { generate: async (_, signal, progress) => {
   progress({ phase: 'generate', progress: .5 });
   generation(signal);
   return audio;
  } } },
 });
 const chapter = { id: 'chapter', title: 'Chapter', content: 'Prose' };
 const unmount = phoneConversion.subscribe(() => {});
 const work = phoneConversion.start({ id: 'book', chapters: [chapter] }, [chapter], 'user', 'af_bella', 1000, false);
 const signal = await ready;
 unmount();
 assert.equal(signal.aborted, false);
 assert.equal(phoneConversion.snapshot().percent, 50);
 finishAudio({ uri: 'file:///chapter.wav', bytes: 100, sync: {} });
 await work;
 assert.equal(phoneConversion.snapshot().running, false);
 assert.match(phoneConversion.snapshot().message, /1 saved/);
 assert.deepEqual(calls, ['foreground started', 'audio saved', 'foreground stopped']);
});

test('Drive matching ignores EPUB index offsets but requires actual prose equality', () => {
 assert.equal(drive.driveManifestMatches(manifest, ['Actual prose.'], 'Chapter 435'), true);
 assert.equal(drive.driveManifestMatches(manifest, ['Different prose.'], 'Chapter 435'), false);
 assert.equal(drive.driveManifestMatches({ ...manifest, format: 'mp3' }, ['Actual prose.'], 'Chapter 435'), false);
 assert.throws(() => drive.driveRecordings({ ...catalog, recordings: { [key]: { ...record, audioFile: '../outside.wav' } } }));
 assert.throws(() => drive.driveRecordings({ ...catalog, schemaVersion: 2 }));
 assert.equal(drive.driveCandidates([{ ...record, title: 'Chapter 435 — Celestial Race', chapterIndex: 438 }], 'Chapter 435 - Celestial Race', 434).length, 1);
 assert.equal(drive.driveCandidates([{ ...record, title: 'Chapter 435', chapterIndex: 410 }], 'Chapter 411', 410).length, 0);
});

function harness({ mismatch = false, existing = false, cancel = false, failure = false } = {}) {
 const imports = [], closed = [], messages = [];
 const bridge = {
  openDrivePackage: async () => JSON.stringify({ token: 'token', catalog }),
  driveManifest: async () => JSON.stringify(manifest),
  importDriveChapter: async (token, request) => { if (failure) throw Error('Checksum failed'); imports.push(JSON.parse(request)); },
  closeDrivePackage: async token => { closed.push(token); },
 };
 const service = load('src/services/drive-audio.service.ts', {
  'react-native': { NativeModules: { LocalChapterSync: bridge } },
  'expo-document-picker': { getDocumentAsync: async () => ({ canceled: cancel, assets: [{ name: 'audio.zip', uri: 'content://drive/package' }] }) },
  '../lib/drive-audio': drive, '../lib/listen-audio': { audioIdentityKey: () => 'c'.repeat(16) }, '../lib/kokoro-text': narration,
  './book.service': {}, './local-sync.service': { localSyncService: { get: async () => existing ? {} : null, refresh: async () => {} } },
  '../lib/storage': { cacheService: {} },
 });
 const book = { id: 'mobile-book', title: 'Book', chapters: [{ id: 'mobile-chapter', title: 'Chapter 435', content: [mismatch ? 'Wrong.' : 'Actual prose.'] }] };
 return { imports, closed, messages, run: () => service.importDriveAudio(book, 'current-user', 0, 1, text => messages.push(text), () => false) };
}
test('Drive import assigns current account/mobile chapter IDs after text matching', async () => {
 const h = harness(); await h.run();
 assert.equal(h.imports.length, 1); assert.equal(h.imports[0].userId, 'current-user');
 assert.equal(h.imports[0].bookId, 'mobile-book'); assert.equal(h.imports[0].chapterId, 'mobile-chapter');
 assert.equal(h.imports[0].chapterIndex, 0); assert.equal(h.imports[0].expectedText, 'Actual prose.');
 assert.deepEqual(h.closed, ['token']);
});
test('Drive mismatches, already-saved audio and cancellation do not publish audio', async () => {
 for (const options of [{ mismatch: true }, { existing: true }, { cancel: true }]) {
  const h = harness(options); await h.run(); assert.equal(h.imports.length, 0);
 }
});
test('failed native validation closes and removes the cached Drive package', async () => {
 const h = harness({ failure: true }); await assert.rejects(h.run(), /Checksum failed/);
 assert.deepEqual(h.closed, ['token']);
});

function directHarness({ cancelled = false, existing = false, missing = false, mismatch = false, incremental = false } = {}) {
 const calls = [], selections = new Map(), progress = [], messages = []; let progressListener;
 const bridge = {
  authorize: async user => { calls.push(['authorize', user]); return true; },
  listBooks: async () => JSON.stringify([{ id: 'drive-folder', name: 'Book' }]),
  catalog: async () => { calls.push(['catalog']); return JSON.stringify(missing ? { ...catalog, recordings: {} } : catalog); },
  manifest: async () => { calls.push(['manifest']); return JSON.stringify(mismatch ? { ...manifest, sync: { ...manifest.sync, paragraphs: ['Wrong text.'] } } : manifest); },
  importChapter: async (user, folder, raw) => { calls.push(['import', JSON.parse(raw)]); progressListener?.(JSON.stringify({ userId: user, downloadedBytes: 5, totalBytes: 10 })); return '{}'; },
  cancel: async () => true, disconnect: async () => true,
 };
 const service = load('src/services/drive-audio.service.ts', {
  'react-native': { NativeModules: { GoogleDriveAudio: bridge }, DeviceEventEmitter: { addListener: (name, listener) => { progressListener = listener; return { remove() { calls.push(['unsubscribe']); } }; } } },
  'expo-document-picker': {}, '../lib/drive-audio': drive, '../lib/listen-audio': { audioIdentityKey: () => 'c'.repeat(16) }, '../lib/kokoro-text': narration,
  './book.service': {}, './local-sync.service': { localSyncService: { get: async () => existing ? {} : null, refresh: async () => {}, cachedChapterIds: async () => existing ? ['mobile-chapter'] : [] } },
  '../lib/storage': { cacheService: { getObject: key => selections.get(key), setObject: (key, value) => selections.set(key, value), delete: key => selections.delete(key) } },
 }).directDriveService;
 const book = { id: 'mobile-book', title: 'Book', chapters: [{ id: 'mobile-chapter', title: 'Chapter 435', content: ['Actual prose.'] }] };
 return { service, calls, bridge, progress, messages, run: () => service.sync(book, 'u', { id: 'drive-folder', name: 'Book' }, 0, 1, text => messages.push(text), () => cancelled, value => progress.push(value), incremental ? 'af_bella' : undefined) };
}
test('Drive progress distinguishes checking, bytes, saved chapters and missing/text mismatch results', async () => {
 const success = directHarness(); await success.run();
 assert.equal(success.progress.at(-1).saved, 1); assert.equal(success.progress.at(-1).checked, 1);
 assert.equal(success.progress.at(-1).phase, 'finished');
 assert.ok(success.progress.some(value => value.phase === 'downloading' && value.downloadedBytes === 5));
 const absent = directHarness({ missing: true }); await absent.run();
 assert.equal(absent.progress.at(-1).total, 0); assert.equal(absent.progress.at(-1).saved, 0);
 assert.match(absent.messages.at(-1), /No matching Drive chapters available/);
 const mismatch = directHarness({ mismatch: true }); await mismatch.run();
 assert.equal(mismatch.progress.at(-1).issues[0].section, 1);
 assert.equal(mismatch.progress.at(-1).issues[0].title, 'Chapter 435');
 assert.match(mismatch.progress.at(-1).issues[0].reason, /text differs/);
 const alreadySaved = directHarness({ existing: true, mismatch: true }); await alreadySaved.run();
 assert.equal(alreadySaved.progress.at(-1).skipped, 1);
 assert.equal(alreadySaved.progress.at(-1).mismatched, 0);
 assert.equal(alreadySaved.calls.some(c => c[0] === 'manifest'), false);
 assert.equal(mismatch.progress.at(-1).mismatched, 1); assert.equal(mismatch.calls.filter(c => c[0] === 'import').length, 0);
});
test('direct Drive downloads matching chapters without opening a ZIP or exposing a token', async () => {
 const h = directHarness(); await h.run();
 assert.equal(h.calls.filter(c => c[0] === 'import').length, 1);
 assert.equal(h.calls[0][0], 'authorize');
 assert.equal(h.calls.find(c => c[0] === 'import')[1].userId, 'u');
 assert.equal(h.calls.at(-1)[0], 'unsubscribe');
 await h.run(); assert.equal(h.calls.filter(c => c[0] === 'catalog').length, 2);
});
test('cloud sync crosses missing gaps and downloads every available chapter beyond the old 15 cap', async () => {
 const rows = {}, manifests = {}, imported = [], progress = [];
 for (let number = 433; number <= 456; number++) {
  const identity = number.toString(16).padStart(64, '0');
  rows[identity] = { ...record, identity, title: `Chapter ${number}`, chapterIndex: number - 1,
   audioFile: `chapters/${identity}.wav`, manifestFile: `chapters/${identity}.json` };
  manifests[identity] = { ...manifest, sync: { version: 1, title: `Chapter ${number}`, paragraphs: [`Text ${number}.`], segments: [{ text: `Text ${number}.`, start: 0, end: 1 }] } };
 }
 const service = load('src/services/drive-audio.service.ts', {
  'react-native': { NativeModules: { GoogleDriveAudio: {
   authorize: async () => true, catalog: async () => JSON.stringify({ ...catalog, recordings: rows }),
   manifest: async (u, f, id) => JSON.stringify(manifests[id]),
   importChapter: async (u, f, raw) => { imported.push(JSON.parse(raw)); return '{}'; },
  } }, DeviceEventEmitter: { addListener: () => ({ remove() {} }) } },
  'expo-document-picker': {}, '../lib/drive-audio': drive, '../lib/listen-audio': { audioIdentityKey: () => 'c'.repeat(16) }, '../lib/kokoro-text': narration,
  './book.service': {}, './local-sync.service': { localSyncService: { get: async identity => identity.chapterId === 'c433' ? {} : null, refresh: async () => {} } },
  '../lib/storage': { cacheService: {} },
 }).directDriveService;
 const book = { id: 'book', title: 'Book', chapters: Array.from({ length: 500 }, (_, i) => ({ id: `c${i+1}`, title: `Chapter ${i+1}`, content: [`Text ${i+1}.`] })) };
 await service.sync(book, 'u', { id: 'folder', name: 'Book' }, 410, 15, () => {}, () => false, value => progress.push(value));
 assert.equal(imported.length, 23);
 assert.equal(imported[0].chapterId, 'c434'); assert.equal(imported.at(-1).chapterId, 'c456');
 assert.equal(progress.at(-1).total, 24); assert.equal(progress.at(-1).skipped, 1);
});
test('direct Drive account/book folder mappings are isolated and disconnect keeps other mappings', async () => {
 const h = directHarness(); const folder = { id: 'drive-folder', name: 'Book' };
 h.service.select('u', 'b', folder);
 assert.equal(h.service.selected('u', 'b'), folder);
 assert.equal(h.service.selected('other', 'b'), undefined);
 h.service.select('u', 'other-book', folder);
 await h.service.disconnect('u', 'b');
 assert.equal(h.service.selected('u', 'b'), undefined);
 assert.equal(h.service.selected('u', 'other-book'), folder);
});
test('direct Drive cancellation and already saved audio never trigger audio download', async () => {
 for (const options of [{ cancelled: true }, { existing: true }]) {
  const h = directHarness(options); await h.run(); assert.equal(h.calls.filter(c => c[0] === 'import').length, 0);
 }
});
test('direct Drive single-flight rejects a second sync and releases the guard on failure', async () => {
 const h = directHarness(); let fail;
 h.bridge.catalog = () => new Promise((resolve, reject) => { fail = reject; });
 const pending = h.run(); await new Promise(resolve => setImmediate(resolve));
 await assert.rejects(h.run(), /already running/);
 fail(Error('Disconnected')); await assert.rejects(pending, /Disconnected/);
 h.bridge.catalog = async () => JSON.stringify(catalog);
 await h.run(); assert.equal(h.calls.filter(c => c[0] === 'import').length, 1);
});


test('Drive prose accepts typography and layout variants but still rejects wrong or incomplete narration', () => {
 const title = 'Chapter 556 - Small Luck';
 const expected = 'Chapter 556: Small Luck. “It’s a long journey,” he said.';
 const recording = 'CHAPTER ５５６ — Small Luck\nIT\'S a long journey ... he said!';
 assert.equal(drive.driveTextMatches(recording, title, expected, title), true);
 assert.equal(drive.driveTextMatches(recording.replace('long', 'short'), title, expected, title), false);
 assert.equal(drive.driveTextMatches(recording.replace('he said!', ''), title, expected, title), false);
});


test('incremental Drive sync remembers unchanged mismatches and can explicitly retry them', async () => {
 const h = directHarness({ mismatch: true, incremental: true });
 await h.run();
 await h.run();
 assert.equal(h.calls.filter(call => call[0] === 'manifest').length, 1);
 assert.equal(h.progress.at(-1).total, 0);
 assert.equal(h.progress.at(-1).issues[0].title, 'Chapter 435');
 h.service.resetChecks('u', 'mobile-book', 'drive-folder', 'af_bella');
 await h.run();
 assert.equal(h.calls.filter(call => call[0] === 'manifest').length, 2);
 const saved = directHarness({ existing: true, incremental: true });
 await saved.run();
 assert.equal(saved.progress.at(-1).skipped, 1);
 assert.equal(saved.progress.at(-1).total, 0);
});
