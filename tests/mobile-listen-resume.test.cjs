const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../mobile-app');
function load(file, dependencies) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, Date, console, require(name) { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
 return module.exports;
}
const audio = load('src/lib/listen-audio.ts', {});
const identity = { userId: 'u', bookId: 'book', chapterId: 'one', title: 'One', content: ['First.', 'Next.'], provider: 'kokoro', voice: 'af_heart', grammarModel: 'OFF', chunkTarget: 1000 };
const piece = index => ({ index, uri: 'file:///documents/listen-audio-parts/kokoro-piece-' + index + '.wav', bytes: 100, text: index ? 'Next.' : 'First.', start: index * 5, end: index * 5 + 5 });
const sync = { version: 1, title: 'One', paragraphs: ['First.', 'Next.'], segments: [piece(0), piece(1)] };
function harness() {
 const preferences = new Map(), files = new Map(), deleted = [];
 const storage = { getObject: key => preferences.has(key) ? JSON.parse(preferences.get(key)) : null,
  setObject: (key, value) => preferences.set(key, JSON.stringify(value)), delete: key => preferences.delete(key) };
 const fileSystem = { getInfoAsync: async uri => files.has(uri) ? { exists: true, size: files.get(uri) } : { exists: false },
  deleteAsync: async uri => { deleted.push(uri); files.delete(uri); } };
 const reload = () => load('src/services/listen-resume.service.ts', { 'expo-file-system/legacy': fileSystem, '../lib/storage': { cacheService: storage }, '../lib/listen-audio': audio }).listenResumeService;
 return { reload, preferences, files, deleted };
}
test('played chunks and cursor survive a new service instance and remain scoped to user/book/content', async () => {
 const h = harness(), service = h.reload();
 for (let i = 0; i < 2; i++) { h.files.set(piece(i).uri, 100); service.savePiece(identity, piece(i), { ...sync, segments: sync.segments.slice(0, i + 1) }, ['First.', 'Next.']); }
 service.savePosition(identity, 7.25, 1, true);
 const restarted = h.reload(), saved = await restarted.restore(identity);
 assert.equal(saved.position, 7.25); assert.equal(saved.index, 1); assert.equal(saved.pieces.length, 2);
 assert.equal(restarted.isPinned(piece(1).uri), true);
 assert.equal(restarted.get({ ...identity, userId: 'another' }), null);
 assert.equal(restarted.get({ ...identity, content: ['Edited chapter.'] }), null);
 assert.equal(restarted.get({ ...identity, chunkTarget: 400 }).position, 7.25, 'chunk preferences do not invalidate a saved plan');
});
test('missing/corrupt saved audio never becomes a playable resume source', async () => {
 const h = harness(), service = h.reload();
 service.savePiece(identity, piece(0), { ...sync, segments: [piece(0)] }, ['First.', 'Next.']);
 service.savePosition(identity, 2, 0, true);
 assert.equal((await service.restore(identity)).pieces.length, 0);
 h.files.set(piece(0).uri, 99); assert.equal((await service.restore(identity)).pieces.length, 0);
});
test('completed chapter compaction retains the final file and cursor while releasing temporary pieces', async () => {
 const h = harness(), service = h.reload();
 h.files.set(piece(0).uri, 100); service.savePiece(identity, piece(0), sync, ['First.', 'Next.']);
 const file = { uri: 'file:///documents/listen-audio-parts/kokoro-final.wav', bytes: 200, sync };
 h.files.set(file.uri, 200); service.saveFile(identity, file); service.savePosition(identity, 6, 1, true); service.compact(identity);
 const restored = await h.reload().restore(identity);
 assert.equal(restored.file.uri, file.uri); assert.equal(restored.position, 6); assert.equal(restored.pieces.length, 0);
 assert.ok(h.deleted.includes(piece(0).uri)); assert.equal(service.isPinned(file.uri), true);
});
test('voice handoff keeps the spoken chunk, drops future chunks, and preserves its position', () => {
 const h = harness(), service = h.reload();
 for (let i = 0; i < 2; i++) { h.files.set(piece(i).uri, 100); service.savePiece(identity, piece(i), { ...sync, segments: sync.segments.slice(0, i + 1) }, ['First.', 'Next.']); }
 service.savePosition(identity, 3, 0, true); service.voiceChange(identity, 'af_bella', 0);
 const saved = service.get({ ...identity, voice: 'af_bella' });
 assert.equal(saved.voice, 'af_bella'); assert.equal(saved.position, 3); assert.equal(saved.pieces.length, 1);
 assert.equal(service.isPinned(piece(0).uri), true); assert.equal(service.isPinned(piece(1).uri), false);
});
test('resume history is bounded to five books and an explicit re-cache clears the cursor', () => {
 const h = harness(), service = h.reload();
 for (let i = 0; i < 8; i++) service.savePiece({ ...identity, bookId: 'book-' + i }, { ...piece(0), uri: piece(0).uri + i }, { ...sync, segments: [piece(0)] }, ['First.']);
 assert.equal(JSON.parse(h.preferences.get('listen-resume-v1')).length, 5);
 assert.equal(service.get({ ...identity, bookId: 'book-0' }), null);
 const current = { ...identity, bookId: 'book-7' }; service.savePosition(current, 2, 0, true); service.clear(current);
 assert.equal(service.get(current), null);
});

test('PC chapter replacement preserves text-relative playback position and native library ownership', async () => {
 const h = harness(), service = h.reload();
 h.files.set(piece(0).uri, 100); service.savePiece(identity, piece(0), sync, ['First.', 'Next.']);
 service.savePosition(identity, 7.5, 1, true);
 const file = { uri: 'file:///documents/local-pc-audio/chapter.wav', bytes: 300, sync: { ...sync, segments: [{ text: 'First.', start: 0, end: 10 }, { text: 'Next.', start: 10, end: 30 }] } };
 h.files.set(file.uri, 300); service.replaceFile(identity, file);
 const restored = await service.restore(identity);
 assert.equal(restored.position, 20); assert.equal(restored.index, 1);
 service.clear(identity); assert.equal(h.deleted.includes(file.uri), false);
});
