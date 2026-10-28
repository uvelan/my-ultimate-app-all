const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../mobile-app/' + file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, Error, Date, Math, console, require(name) {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  } });
  return module.exports;
}
const content = load('src/lib/chapter-content.ts');
const narration = load('src/lib/chapter-narration.ts');
const pure = load('src/lib/listen-audio.ts');
const timing = load('src/lib/narration-sync.ts', { './chapter-content': content });
const text = load('src/lib/kokoro-text.ts', { './chapter-content': content, './chapter-narration': narration });
function harness(native, platform = 'android') {
  const callbacks = new Set(), removed = [];
  const service = load('src/services/kokoro.service.ts', {
    'react-native': { Platform: { OS: platform }, NativeModules: { KokoroTts: native },
      NativeEventEmitter: class { addListener(_, callback) { callbacks.add(callback); return { remove: () => callbacks.delete(callback) }; } } },
    'expo-file-system/legacy': { deleteAsync: async uri => removed.push(uri) },
    './listen-resume.service': { listenResumeService: { isPinned: () => false } },
    '../lib/offline-audio-budget': load('src/lib/offline-audio-budget.ts'),
    '../lib/audio-diagnostics': { audioDiagnostics: { record() {} } },
    '../lib/listen-audio': pure, '../lib/kokoro-text': text, '../lib/narration-sync': timing,
  }).kokoroService;
  return { service, callbacks, removed };
}
const identity = { userId: 'one', bookId: 'book', chapterId: 'chapter', title: 'Chapter 1',
  content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shi Hao raised his halberd.' }] }] },
  provider: 'kokoro', voice: 'af_heart', grammarModel: 'OFF' };

test('offline input extracts rich text, announces title once and bounds long chunks without losing text', () => {
  const input = text.kokoroNarration(identity.content, identity.title);
  assert.equal(input.chunks.join(' '), 'Chapter 1. Shi Hao raised his halberd.');
  const withTitle = text.kokoroNarration(['Chapter 1.', 'The moon rose.'], 'Chapter 1');
  assert.equal(withTitle.chunks.join(' '), 'Chapter 1. The moon rose.');
  const long = 'The cultivator crossed the mountains. '.repeat(100) + '😀'.repeat(500);
  const chunks = text.kokoroNarration([long], '').chunks;
  assert.ok(chunks.every(chunk => chunk.length <= text.MAX_KOKORO_CHUNK && !/[\uD800-\uDBFF]$/.test(chunk)));
  assert.equal(chunks.join(' ').replace(/\s/g, ''), long.replace(/\s/g, ''));
  assert.throws(() => text.kokoroNarration({ metadata: 'not chapter text' }, 'Chapter'), /no text/);
});

test('native bridge filters progress by request, returns measured cues and removes listeners', async () => {
  let app;
  app = harness({ async generate(id, chunks, voice) {
    assert.equal(voice, 'af_heart'); assert.equal(chunks.join(' '), 'Chapter 1. Shi Hao raised his halberd.');
    for (const callback of app.callbacks) {
      callback({ requestId: 'other', phase: 'generate', progress: 0.1 });
      callback({ requestId: id, phase: 'generate', progress: 0.5 });
    }
    return { uri: 'file:///cache/voice.wav', bytes: 240044, segments: chunks.map((text, i) => ({ text, start: i, end: i + 1 })) };
  }, cancel() {} });
  const updates = [];
  const result = await app.service.generate(identity, new AbortController().signal, event => updates.push(event.progress));
  assert.deepEqual(updates, [0.5]); assert.equal(result.sync.paragraphs[0], 'Shi Hao raised his halberd.');
  assert.equal(result.sync.segments[0].start, 0); assert.equal(app.callbacks.size, 0);
});

test('cancellation reaches native worker and a late result is deleted instead of cached', async () => {
  const control = new AbortController(); const cancelled = []; let resolve, request;
  const app = harness({ generate(id) { request = id; return new Promise(done => { resolve = done; }); }, cancel(id) { cancelled.push(id); } });
  const pending = app.service.generate(identity, control.signal);
  control.abort();
  resolve({ uri: 'file:///cache/late.wav', bytes: 100, segments: [{ text: 'Text', start: 0, end: 1 }] });
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(cancelled, [request]); assert.deepEqual(app.removed, ['file:///cache/late.wav']); assert.equal(app.callbacks.size, 0);
});

test('offline bridge refuses unavailable builds, empty audio and cloud grammar without exporting chapter text', async () => {
  await assert.rejects(harness(undefined).service.generate(identity, new AbortController().signal), /latest Android APK/);
  let calls = 0;
  const app = harness({ async generate() { calls++; return { uri: 'file:///cache/empty.wav', bytes: 44, segments: [] }; } });
  await assert.rejects(app.service.generate({ ...identity, grammarModel: 'gpt-4o-mini' }, new AbortController().signal), /Disable cloud grammar/);
  assert.equal(calls, 0);
  await assert.rejects(app.service.generate(identity, new AbortController().signal), /incomplete audio/);
  assert.equal(calls, 1); assert.deepEqual(app.removed, ['file:///cache/empty.wav']); assert.equal(app.callbacks.size, 0);
});

test('streaming emits measured pieces before completion and cleans them on chapter cancellation', async () => {
  let app, finish;
  app = harness({ generate(id, chunks) {
    for (const callback of app.callbacks) {
      callback({ requestId: 'other', phase: 'generate', progress: 1, chunk: { index: 0, text: chunks[0], uri: 'file:///wrong.wav', bytes: 100, start: 0, end: 1 } });
      callback({ requestId: id, phase: 'generate', progress: 0.5, chunk: { index: 0, text: chunks[0], uri: 'file:///piece.wav', bytes: 100, start: 0, end: 1 } });
      callback({ requestId: id, phase: 'generate', progress: 0.5, chunk: { index: 0, text: chunks[0], uri: 'file:///duplicate.wav', bytes: 100, start: 0, end: 1 } });
    }
    return new Promise(resolve => { finish = () => resolve({ uri: 'file:///merged.wav', bytes: 100,
      segments: chunks.map((text, index) => ({ text, start: index, end: index + 1 })) }); });
  }, cancel() {} });
  const control = new AbortController(), pieces = [];
  const pending = app.service.generate(identity, control.signal, undefined, (piece, sync) => pieces.push({ piece, sync }));
  assert.equal(pieces.length, 1, 'first playable piece does not wait for the merged promise');
  assert.equal(pieces[0].sync.segments[0].end, 1);
  finish(); await pending;
  assert.equal(app.removed.length, 0, 'pieces remain usable after merge');
  control.abort(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(app.removed, ['file:///piece.wav']);
});

test('measured chunk offsets keep text highlighting on the spoken passage as the buffer grows', () => {
  const segments = [{ text: 'Chapter One.', start: 0, end: 2 }, { text: 'Shi Hao raised his halberd.', start: 2, end: 9 }];
  const sync = { version: 1, title: 'Chapter One', paragraphs: ['Shi Hao raised his halberd.'], segments };
  const cues = timing.buildNarrationCues('', '', sync);
  assert.equal(cues[timing.activeNarrationCue(cues, 1, 9)].text, 'Chapter One.');
  assert.equal(cues[timing.activeNarrationCue(cues, 2 + 3, 9)].text, 'Shi Hao raised his halberd.');
  const grown = timing.buildNarrationCues('', '', { ...sync, segments: [...segments, { text: 'The moon rose.', start: 9, end: 12 }] });
  assert.equal(grown[timing.activeNarrationCue(grown, 2 + 3, 12)].text, 'Shi Hao raised his halberd.');
});

test('short paragraphs share average-sized narration chunks without losing text or duplicating the title', () => {
  const paragraphs = Array.from({ length: 70 }, (_, i) => 'Passage ' + (i + 1) + ': Shi Hao crossed the mountain beneath the moon.');
  const narration = text.kokoroNarration(paragraphs, 'Chapter 3');
  assert.ok(narration.chunks.length < paragraphs.length / 4);
  assert.ok(narration.chunks[0].includes(paragraphs[0]) && narration.chunks[0].includes(paragraphs[1]));
  assert.equal(narration.chunks.join(' '), 'Chapter 3. ' + paragraphs.join(' '));
  assert.equal(narration.paragraphs.length, paragraphs.length);
  assert.ok(narration.chunks.every(chunk => chunk.length <= text.MAX_KOKORO_CHUNK));
  const average = narration.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / narration.chunks.length;
  assert.ok(average >= 800 && average <= 1000, 'average chunk size: ' + average);
  const cues = timing.buildNarrationCues('', '', { version: 1, title: narration.title, paragraphs: narration.paragraphs,
    segments: narration.chunks.map((text, index) => ({ text, start: index * 10, end: (index + 1) * 10 })) });
  assert.equal(cues[timing.activeNarrationCue(cues, 10.01, narration.chunks.length * 10)].text,
    timing.buildNarrationCues(narration.chunks[1])[0].text);
});

test('offline demand starts idle, limits lookahead and pauses without discarding generated chunks', async () => {
  let finish; const limits = []; let initial;
  const app = harness({ generate(id, chunks, voice, limit) {
    initial = limit; return new Promise(resolve => { finish = () => resolve({ uri: 'file:///done.wav', bytes: 100,
      segments: chunks.map((text, i) => ({ text, start: i, end: i + 1 })) }); });
  }, setGenerationLimit(id, limit) { limits.push(limit); }, cancel() {} });
  const key = pure.audioIdentityKey(identity);
  const pending = app.service.generate(identity, new AbortController().signal, undefined, () => {});
  assert.equal(initial, 0, 'opening Listen does not start inference');
  app.service.setDemand(key, true, -1); app.service.setDemand(key, true, 0); app.service.setDemand(key, false, 0);
  assert.deepEqual(limits, [2, 3, 0]); finish(); await pending;
});
test('voice handoff checkpoints the spoken prefix and generates only the remaining text with absolute timing', async () => {
  const selected = { ...identity, title: '', content: Array.from({ length: 30 }, (_, i) => 'Passage ' + i + ': The cultivator crossed the mountain beneath the moon.') };
  const narration = text.kokoroNarration(selected.content, selected.title), runs = [], checkpoints = [];
  let app;
  app = harness({ generate(id, chunks, voice, limit, options) {
    return new Promise(resolve => runs.push({ id, chunks, voice, options, resolve }));
  }, checkpoint(id, samples) { checkpoints.push([id, samples]); }, setGenerationLimit() {}, cancel() {} });
  const received = [], control = new AbortController(), key = pure.audioIdentityKey(selected);
  app.service.setDemand(key, true, 0);
  const pending = app.service.generate(selected, control.signal, undefined, (piece, sync) => received.push({ piece, sync }));
  const emit = (run, index, start, end) => {
    for (const callback of app.callbacks) callback({ requestId: run.id, phase: 'generate', progress: 0.2,
      chunk: { index, text: narration.chunks[index], uri: 'file:///kokoro-piece-' + run.voice + index + '.wav', bytes: 100, start, end } });
  };
  emit(runs[0], 0, 0, 2); emit(runs[0], 1, 2, 5);
  assert.equal(app.service.changeVoice(key, 'af_bella', 1, 2), true);
  assert.equal(checkpoints[0][1], 48000);
  runs[0].resolve({ uri: 'file:///kokoro-prefix.wav', bytes: 100, checkpoint: true, segments: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runs.length, 2); assert.equal(runs[1].voice, 'af_bella');
  assert.equal(runs[1].chunks.join(' '), narration.chunks.slice(1).join(' '));
  assert.equal(runs[1].options.prefixSeconds, 2); assert.equal(runs[1].options.startIndex, 1);
  for (let index = 1; index < narration.chunks.length; index++) emit(runs[1], index, 2 + (index - 1) * 3, 2 + index * 3);
  runs[1].resolve({ uri: 'file:///kokoro-mixed.wav', bytes: 200, segments: narration.chunks.slice(1).map((text, i) => ({ text, start: 2 + i * 3, end: 5 + i * 3 })) });
  const result = await pending;
  assert.equal(result.mixedVoice, true); assert.equal(result.sync.segments.length, narration.chunks.length);
  assert.equal(result.sync.segments[0].end, 2); assert.equal(result.sync.segments[1].start, 2);
  assert.equal(received.at(-1).sync.segments[1].start, 2);
  control.abort(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(app.removed.includes('file:///kokoro-mixed.wav'));
});

test('configurable targets preserve whole paragraphs, complete long paragraphs and valid Unicode', () => {
  assert.equal(text.normalizeChunkTarget('600'), 600);
  for (const invalid of [0, -1, 199, 2001, 400.5, 'bad', null, Infinity]) assert.equal(text.normalizeChunkTarget(invalid), 1000);
  const paragraphs = Array.from({ length: 40 }, (_, i) => 'Paragraph ' + i + ': The moon rose above the mountain.');
  const small = text.kokoroNarration(paragraphs, 'Chapter 1', 400);
  const large = text.kokoroNarration(paragraphs, 'Chapter 1', 1500);
  assert.ok(small.chunks.length > large.chunks.length);
  for (const paragraph of paragraphs) assert.ok(small.chunks.some(chunk => chunk.includes(paragraph)), 'ordinary paragraphs are not split');
  assert.equal(small.chunks.join(' '), large.chunks.join(' '));
  const longParagraph = 'The cultivator watched the sea. '.repeat(45).trim();
  const intact = text.kokoroNarration([longParagraph], '', 400);
  assert.equal(intact.chunks.length, 1); assert.equal(intact.chunks[0], longParagraph);
  const oversized = 'Shi Hao crossed the mountain. '.repeat(500) + '😀'.repeat(2500);
  const continued = text.kokoroNarration([oversized], '', 600);
  assert.equal(continued.chunks.join(' ').replace(/\s/g, ''), oversized.replace(/\s/g, ''));
  assert.ok(continued.chunks.every(chunk => chunk.length <= text.MAX_KOKORO_CHUNK && !/[\uD800-\uDBFF]$/.test(chunk)));
});
test('chunk target isolates Kokoro caches while leaving online voice identity unchanged', () => {
  assert.notEqual(pure.audioIdentityKey({ ...identity, chunkTarget: 400 }), pure.audioIdentityKey({ ...identity, chunkTarget: 1500 }));
  assert.equal(pure.audioIdentityKey(identity), pure.audioIdentityKey({ ...identity, chunkTarget: 1000 }));
  assert.equal(pure.audioIdentityKey({ ...identity, provider: 'google', voice: 'en', chunkTarget: 400 }), pure.audioIdentityKey({ ...identity, provider: 'google', voice: 'en', chunkTarget: 1500 }));
});
