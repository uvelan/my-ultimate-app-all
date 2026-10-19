const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../mobile-app/' + file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Uint8Array, ArrayBuffer, Error, TypeError, URL,
    setTimeout, clearTimeout, console, require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name);
      return dependencies[name];
    } });
  return module.exports;
}
const pure = load('src/lib/listen-audio.ts');
const narration = load('src/lib/narration-sync.ts');
const identity = { userId: 'user-a', bookId: 'book', chapterId: 'chapter-0', title: 'Chapter Zero',
  content: ['Text'], provider: 'gemini', voice: 'Kore', grammarModel: 'OFF' };
function serviceHarness(respond) {
  const files = new Map(); const preferences = new Map(); const requests = [];
  const storage = { getObject: key => preferences.get(key) || null, setObject: (key, value) => preferences.set(key, value) };
  const fileSystem = {
    cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/', EncodingType: { Base64: 'base64' },
    makeDirectoryAsync: async () => {},
    writeAsStringAsync: async (uri, data) => { files.set(uri, Buffer.from(data, 'base64')); },
    deleteAsync: async uri => { files.delete(uri); },
    getInfoAsync: async uri => files.has(uri) ? { exists: true, size: files.get(uri).length } : { exists: false },
  };
  const api = { get: async (url, options) => { requests.push({ url, options }); return respond(url, options, requests.length); } };
  const helper = load('src/services/listen-audio.service.ts', {
    'expo-file-system/legacy': fileSystem, '../lib/api-client': { api }, '../lib/storage': { cacheService: storage },
    '../lib/listen-audio': { ...pure, retryNativeAudio: (operation, signal) => pure.retryNativeAudio(operation, signal, [0, 0]) },
    '../lib/narration-sync': narration,
  });
  return { service: helper.listenAudioService, files, preferences, requests };
}
function audioResponse(text = 'compressed mp3 bytes', headers = {}) {
  const bytes = Buffer.from(text);
  return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), headers: {
    'content-type': 'audio/mpeg', 'content-length': String(bytes.length), 'x-tts-provider': 'gemini',
    'x-tts-voice': 'Kore', 'x-tts-cache': 'database', ...headers,
  } };
}

test('native identity isolates chapter title/content/user/settings and centered windows match web', () => {
  const original = pure.audioIdentityKey(identity);
  for (const change of [{ title: 'Renamed' }, { content: ['Edited'] }, { userId: 'other' },
    { provider: 'xiaomi' }, { voice: 'Puck' }, { grammarModel: 'gpt-4o-mini' }]) {
    assert.notEqual(pure.audioIdentityKey({ ...identity, ...change }), original);
  }
  let start = null, previous = null; const starts = [];
  for (let current = 0; current < 6; current++) {
    start = pure.nextAudioWindowStart(start, previous, current); previous = current; starts.push(start);
  }
  assert.deepEqual(starts, [0, 0, 2, 2, 4, 4]);
  assert.equal(pure.nextAudioWindowStart(2, 3, 1), 1);
});

test('native base64 file encoding round-trips arbitrary binary across chunk boundaries', () => {
  for (const length of [0, 1, 2, 3, 12287, 12288, 12289, 24580]) {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 256);
    assert.deepEqual(Buffer.from(pure.bytesToBase64(bytes), 'base64'), Buffer.from(bytes));
  }
});

test('reader title prefix is spoken once without duplicating an existing opening title', () => {
  assert.equal(pure.readerTitlePrefix(' Chapter One ', 'The story begins.'), 'Chapter One');
  assert.equal(pure.readerTitlePrefix('Chapter One', 'chapter one. The story begins.'), '');
  assert.equal(pure.readerTitlePrefix('', 'Story'), '');
});

test('native lock-screen artwork only accepts absolute HTTP(S) cover URLs', () => {
  for (const cover of [undefined, '', 'data:image/png;base64,aGVsbG8=', '/cover.jpg', 'images/cover.jpg',
    '//example.com/cover.jpg', 'https://', 'file:///cache/cover.png', 'content://media/cover', 'not a URL']) {
    assert.equal(pure.nativeLockScreenArtwork(cover), undefined);
  }
  assert.equal(pure.nativeLockScreenArtwork('https://example.com/cover.jpg'), 'https://example.com/cover.jpg');
  assert.equal(pure.nativeLockScreenArtwork('http://example.com/cover.jpg'), 'http://example.com/cover.jpg');
});

test('native chapter preparation preserves playback and paused intent when lock-screen metadata fails', () => {
  for (const cover of ['data:image/png;base64,aGVsbG8=', '/cover.jpg', 'https://example.com/cover.jpg']) {
    for (const failMetadata of [false, true]) {
      for (const shouldPlay of [false, true]) {
        const calls = [];
        const player = {
          replace: source => calls.push(['replace', source.uri]),
          setPlaybackRate: rate => calls.push(['rate', rate]),
          setActiveForLockScreen: (active, metadata) => {
            calls.push(['metadata', active, metadata]);
            if (failMetadata) throw new Error('Cannot cast artworkUrl to java.net.URL');
          },
          play: () => calls.push(['play']),
        };
        pure.prepareNativeChapterPlayback(player, 'file:///cache/chapter.mp3', 1.5,
          { title: 'Chapter 3', artist: 'Book', albumTitle: 'Book', artworkUrl: cover }, shouldPlay);
        assert.deepEqual(calls.slice(0, 2), [['replace', 'file:///cache/chapter.mp3'], ['rate', 1.5]]);
        assert.equal(calls[2][2].title, 'Chapter 3');
        assert.equal(calls[2][2].artworkUrl, cover.startsWith('https:') ? cover : undefined);
        if (!cover.startsWith('https:')) assert.equal(Object.hasOwn(calls[2][2], 'artworkUrl'), false);
        assert.equal(calls.filter(call => call[0] === 'play').length, shouldPlay ? 1 : 0);
        if (shouldPlay) assert.equal(calls.at(-1)[0], 'play', 'optional metadata cannot interrupt the handoff');
      }
    }
  }
});

test('native audio uses authenticated API and persists compressed files with actual fallback metadata', async () => {
  const harness = serviceHarness(() => audioResponse('fallback audio', {
    'x-tts-provider': 'xiaomi', 'x-tts-voice': 'Mia', 'x-tts-fallback': 'gemini',
  }));
  await harness.service.retain([identity], identity.chapterId);
  const controller = new AbortController();
  const result = await harness.service.load(identity, () => identity.chapterId, controller.signal);
  assert.equal(result.provider, 'xiaomi'); assert.equal(result.voice, 'Mia');
  assert.equal(result.contentType, 'audio/mpeg'); assert.match(result.uri, /\.mp3$/);
  assert.equal(harness.files.get(result.uri).toString(), 'fallback audio');
  assert.equal(harness.requests[0].options.responseType, 'arraybuffer');
  assert.strictEqual(harness.requests[0].options.signal, controller.signal);
  assert.equal(harness.requests[0].options.params.windowStart, identity.chapterId);
  assert.equal((await harness.service.get(identity)).source, 'device');
  const actual = { ...identity, provider: 'xiaomi', voice: 'Mia' };
  await harness.service.retain([actual], identity.chapterId);
  assert.equal((await harness.service.get(actual)).uri, result.uri);
  assert.equal(harness.requests.length, 1, 'fallback synchronization does not download or bill again');
});

test('native file window retains five, slides, and a title edit removes stale audio', async () => {
  const harness = serviceHarness(() => audioResponse());
  const chapters = Array.from({ length: 7 }, (_, index) => ({ ...identity, chapterId: `chapter-${index}`, title: `Chapter ${index}` }));
  await harness.service.retain(chapters.slice(0, 5), chapters[0].chapterId, chapters[1].chapterId);
  for (const chapter of chapters.slice(0, 5)) await harness.service.load(chapter, () => chapters[0].chapterId, new AbortController().signal, true);
  assert.equal(harness.files.size, 5);
  await harness.service.retain(chapters.slice(2, 7), chapters[2].chapterId, chapters[3].chapterId);
  assert.equal(await harness.service.get(chapters[0]), null);
  for (const chapter of chapters.slice(5, 7)) await harness.service.load(chapter, () => chapters[2].chapterId, new AbortController().signal, true);
  assert.equal(harness.files.size, 5);
  const renamed = { ...chapters[2], title: 'Renamed chapter' };
  await harness.service.retain([renamed], renamed.chapterId);
  assert.equal(await harness.service.get(renamed), null);
  assert.equal(harness.files.size, 0);
});

test('native transfer retries incomplete bodies, and cancelled requests cannot publish files', async () => {
  let calls = 0;
  const harness = serviceHarness(() => ++calls === 1 ? audioResponse('short', { 'content-length': '999' }) : audioResponse());
  await harness.service.retain([identity], identity.chapterId);
  await harness.service.load(identity, () => identity.chapterId, new AbortController().signal);
  assert.equal(calls, 2);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(harness.service.load({ ...identity, title: 'Other title' }, () => identity.chapterId, cancelled.signal));
  assert.equal(harness.files.size, 1);
});

const timedNarration = { version: 1, title: 'Chapter Zero', paragraphs: ['Text.'],
  segments: [{ text: 'Chapter Zero.', start: 0, end: 2 }, { text: 'Text.', start: 2, end: 5 }] };
const flushMetadata = () => new Promise(resolve => setImmediate(resolve));

test('native timing loads after audio startup and persists only for the matching audio bytes', async () => {
  let resolveSync;
  const pending = new Promise(resolve => { resolveSync = resolve; });
  const harness = serviceHarness((url, options) => options.params.sync ? pending : audioResponse('audio', {
    'x-tts-audio-id': 'audio-hash', 'x-tts-provider': 'xiaomi', 'x-tts-voice': 'Mia',
  }));
  await harness.service.retain([identity], identity.chapterId);
  const updates = []; harness.service.subscribeSync(file => updates.push(file));
  const result = await Promise.race([
    harness.service.load(identity, () => identity.chapterId, new AbortController().signal),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timing blocked playback')), 250)),
  ]);
  assert.equal(result.audioId, 'audio-hash'); assert.equal(result.sync, undefined);
  assert.equal(harness.requests[1].options.params.provider, 'xiaomi');
  assert.equal(harness.requests[1].options.params.voice, 'Mia');
  resolveSync({ data: { sync: timedNarration, audioId: 'audio-hash' } });
  await flushMetadata();
  assert.equal(updates.length, 1); assert.equal(updates[0].uri, result.uri);
  const cached = await harness.service.load(identity, () => identity.chapterId, new AbortController().signal);
  assert.deepEqual(cached.sync, timedNarration);
  assert.equal(harness.requests.length, 2, 'cached audio and timing are reused together');
});

test('native metadata for regenerated or invalid audio cannot describe an existing file', async () => {
  for (const metadata of [{ sync: timedNarration, audioId: 'different-hash' },
    { sync: { version: 1, segments: [] }, audioId: 'audio-hash' }]) {
    const harness = serviceHarness((url, options) => options.params.sync ? { data: metadata }
      : audioResponse('audio', { 'x-tts-audio-id': 'audio-hash' }));
    await harness.service.retain([identity], identity.chapterId);
    const updates = []; harness.service.subscribeSync(file => updates.push(file));
    await harness.service.load(identity, () => identity.chapterId, new AbortController().signal);
    await flushMetadata();
    assert.equal((await harness.service.get(identity)).sync, undefined);
    assert.equal(updates.length, 0);
  }
});

test('native delayed metadata cannot publish after cancellation or a chapter window change', async () => {
  for (const obsolete of ['abort', 'window']) {
    let resolveSync;
    const harness = serviceHarness((url, options) => options.params.sync ? new Promise(resolve => { resolveSync = resolve; })
      : audioResponse('audio', { 'x-tts-audio-id': 'audio-hash' }));
    await harness.service.retain([identity], identity.chapterId);
    const controller = new AbortController(); const updates = [];
    harness.service.subscribeSync(file => updates.push(file));
    await harness.service.load(identity, () => identity.chapterId, controller.signal);
    if (obsolete === 'abort') controller.abort();
    else await harness.service.retain([{ ...identity, chapterId: 'other' }], 'other');
    resolveSync({ data: { sync: timedNarration, audioId: 'audio-hash' } });
    await flushMetadata();
    assert.equal(updates.length, 0);
    assert.equal((await harness.service.get(identity))?.sync, undefined);
  }
});

test('reader grammar and replacement calls match the authenticated web API contracts', async () => {
  const calls = [];
  const chapterId = 'a'.repeat(24);
  const api = {
    get: async (url, options) => { calls.push({ method: 'GET', url, options }); return { data: { id: chapterId } }; },
    post: async (url, body) => { calls.push({ method: 'POST', url, body }); return { data: { correctedContent: ['Corrected paragraph.'] } }; },
    delete: async (url, options) => { calls.push({ method: 'DELETE', url, options }); },
  };
  const { bookService } = load('src/services/book.service.ts', { '../lib/api-client': { api } });
  const proposal = await bookService.proposeGrammarCorrection('book', '3', 'gpt-4o-mini');
  assert.equal(proposal.correctedContent[0], 'Corrected paragraph.');
  assert.equal(calls[0].url, '/books/book/chapters/3');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].body)), { chapterId, modelId: 'gpt-4o-mini' });
  await bookService.deleteReplacementRule('rule-1');
  assert.equal(calls[2].url, '/replacements');
  assert.equal(calls[2].options.params.id, 'rule-1');
});

test('reader native voice selection applies to speech without changing title/body callbacks', async () => {
  const calls = [];
  const voice = { identifier: 'voice-1', name: 'English', language: 'en-IN' };
  const { ttsService } = load('src/services/tts.service.ts', { 'expo-speech': {
    stop: async () => {}, speak: (text, options) => calls.push({ text, options }), getAvailableVoicesAsync: async () => [voice],
  } });
  ttsService.selectVoice(voice.identifier);
  let done = 0;
  await ttsService.queue([{ text: 'Chapter title', chapterId: '0', sentenceIndex: 0, isTitle: true }], 1.25, { onDone: () => done++ });
  assert.equal(calls[0].options.voice, 'voice-1');
  assert.equal(calls[0].options.rate, 1.25);
  calls[0].options.onDone();
  assert.equal(done, 1);
});

test('offline chapters use Expo legacy file APIs, preserve paragraphs and treat corrupt files as cache misses', async () => {
  const files = new Map(); const values = new Map();
  const cacheService = { getObject: key => values.get(key) || null, setObject: (key, value) => values.set(key, value),
    delete: key => values.delete(key) };
  const legacy = {
    cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/',
    getInfoAsync: async uri => ({ exists: uri.endsWith('/books/') || files.has(uri) }),
    makeDirectoryAsync: async () => {}, writeAsStringAsync: async (uri, value) => files.set(uri, value),
    readAsStringAsync: async uri => files.get(uri), deleteAsync: async uri => files.delete(uri),
  };
  const { offlineService } = load('src/services/offline.service.ts', {
    'expo-file-system/legacy': legacy, '@/src/lib/storage': { cacheService },
  });
  await offlineService.saveAllChapters('book', [{ id: 'chapter', order: 0, title: 'Opening', content: ['First paragraph.', 'Second paragraph.'] }]);
  assert.equal(await offlineService.getChapter('book', '0'), 'First paragraph.\nSecond paragraph.');
  assert.equal(offlineService.hasCachedChapters('book'), true);
  files.set('file:///cache/books/book_0.json', '{broken json');
  assert.equal(await offlineService.getChapter('book', '0'), null);
  assert.equal(files.has('file:///cache/books/book_0.json'), false);
  await offlineService.saveChapter('book', '0', 'Downloaded again.');
  assert.equal(await offlineService.getChapter('book', '0'), 'Downloaded again.');
  await offlineService.clearBookCache('book');
  assert.equal(offlineService.hasCachedChapters('book'), false);
  assert.equal(files.size, 0);
});
