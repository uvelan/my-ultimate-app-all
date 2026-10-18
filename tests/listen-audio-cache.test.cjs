const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { test } = require('node:test');
const ts = require('typescript');

const DAY = 24 * 60 * 60 * 1000;
const identity = {
  userId: 'reader-1', chapterId: 'chapter-1', title: 'The first chapter', content: ['Chapter text.'],
  provider: 'google', voice: 'en', grammarModel: 'OFF',
};

// Models the browser CacheStorage API while retaining entries across fresh module
// instances. Response clones enforce the same one-use body rules as a browser.
function memoryStorage() {
  const stores = new Map();
  const failures = {};
  const calls = [];
  const key = request => typeof request === 'string' ? request : request.url;
  function check(method) {
    calls.push(method);
    if (failures[method]) throw new Error(`${method} unavailable`);
  }
  return {
    failures, calls, stores,
    async open(name) {
      check('open');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { check('match'); return entries.get(key(request))?.clone(); },
        async put(request, response) { check('put'); entries.set(key(request), response.clone()); },
        async delete(request) { check('delete'); return entries.delete(key(request)); },
        async keys() { check('keys'); return [...entries.keys()].map(url => new Request(url)); },
      };
    },
    async keys() { check('storageKeys'); return [...stores.keys()]; },
    async delete(name) { check('storageDelete'); return stores.delete(name); },
  };
}

function loadCache({ storage = memoryStorage(), clock = { now: 1_800_000_000_000 }, crypto = webcrypto, browserNavigator } = {}) {
  const filename = path.resolve(__dirname, '../src/lib/listen-audio-cache.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const context = vm.createContext({
    module, exports: module.exports,
    require(name) { throw new Error(`Unexpected cache helper dependency: ${name}`); },
    caches: storage, crypto, navigator: browserNavigator, location: { origin: 'https://reader.test' },
    URL, Request, Response, Headers, Blob, TextEncoder, TextDecoder,
    Uint8Array, ArrayBuffer, Date: ClockDate,
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
  });
  new vm.Script(source, { filename }).runInContext(context);
  return { ...module.exports, storage, clock };
}

test('audio survives a new cache helper instance and retains its MIME type', async () => {
  const storage = memoryStorage();
  const firstPage = loadCache({ storage });
  const audio = new Blob(['persistent audio bytes'], { type: 'audio/wav' });
  await firstPage.cacheChapterAudio(identity, audio);
  const reloadedPage = loadCache({ storage });
  const cached = await reloadedPage.getCachedChapterAudio(identity);
  assert.ok(cached instanceof Blob);
  assert.equal(cached.type, 'audio/wav');
  assert.equal(await cached.text(), 'persistent audio bytes');
  assert.equal(await (await reloadedPage.getCachedChapterAudio(identity)).text(), 'persistent audio bytes', 'reads do not consume the stored response');
  assert.ok(storage.stores.has('listen-audio-v3'));
  for (const url of storage.stores.get('listen-audio-v3').keys()) {
    assert.match(url, /^https:\/\/reader\.test\/__listen_audio_cache__\/[a-f0-9]+$/i);
    assert.ok(!url.includes('reader-1'), 'cache keys do not expose reader/content identifiers');
  }
});

test('audio identities separate users, chapters, titles, source content, providers, voices, and grammar', async () => {
  const cache = loadCache();
  await cache.cacheChapterAudio(identity, new Blob(['original'], { type: 'audio/mpeg' }));
  const variants = [
    { userId: 'reader-2' }, { chapterId: 'chapter-2' }, { title: 'Renamed chapter' }, { content: ['Edited chapter text.'] },
    { provider: 'xiaomi' }, { voice: 'Mia' }, { grammarModel: 'gpt-4o-mini' },
  ];
  for (const change of variants) {
    const changedIdentity = { ...identity, ...change };
    assert.equal(await cache.getCachedChapterAudio(changedIdentity), null, `must miss after changing ${Object.keys(change)[0]}`);
  }
  assert.equal(await (await cache.getCachedChapterAudio(identity)).text(), 'original');
});

test('a title-only edit misses persisted narration without changing chapter content', async () => {
  const storage = memoryStorage();
  const firstPage = loadCache({ storage });
  await firstPage.cacheChapterAudio(identity, new Blob(['old title and chapter audio'], { type: 'audio/mpeg' }));
  const reloadedPage = loadCache({ storage });
  const renamed = { ...identity, title: 'A new chapter title' };
  assert.equal(await reloadedPage.getCachedChapterAudio(renamed), null);
  await reloadedPage.cacheChapterAudio(renamed, new Blob(['new title and chapter audio'], { type: 'audio/mpeg' }));
  assert.equal(await (await reloadedPage.getCachedChapterAudio(renamed)).text(), 'new title and chapter audio');
  assert.equal(await (await reloadedPage.getCachedChapterAudio(identity)).text(), 'old title and chapter audio');
});

test('entries remain usable within seven days and stale audio is removed', async () => {
  const cache = loadCache();
  await cache.cacheChapterAudio(identity, new Blob(['fresh'], { type: 'audio/mpeg' }));
  cache.clock.now += 6 * DAY;
  assert.equal(await (await cache.getCachedChapterAudio(identity)).text(), 'fresh');
  cache.clock.now += 2 * DAY;
  assert.equal(await cache.getCachedChapterAudio(identity), null);
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 0, 'expired bytes are removed from storage');
});

test('cache capacity evicts least recently used audio and stays below 100 MB', async () => {
  const cache = loadCache();
  const audio = new Blob([new Uint8Array(36 * 1024 * 1024)], { type: 'audio/wav' });
  for (let index = 0; index < 2; index++) {
    await cache.cacheChapterAudio({ ...identity, chapterId: `chapter-${index}` }, audio);
    cache.clock.now += 1000;
  }
  assert.equal((await cache.getCachedChapterAudio({ ...identity, chapterId: 'chapter-0' })).size, audio.size);
  cache.clock.now += 1000;
  await cache.cacheChapterAudio({ ...identity, chapterId: 'chapter-2' }, audio);
  assert.equal(await cache.getCachedChapterAudio({ ...identity, chapterId: 'chapter-1' }), null, 'recently replaying the first chapter protects it from eviction');
  assert.equal((await cache.getCachedChapterAudio({ ...identity, chapterId: 'chapter-0' })).size, audio.size);
  assert.equal((await cache.getCachedChapterAudio({ ...identity, chapterId: 'chapter-2' })).size, audio.size);
  const entries = cache.storage.stores.get('listen-audio-v3');
  let total = 0;
  for (const response of entries.values()) total += (await response.clone().blob()).size;
  assert.ok(total <= 100 * 1024 * 1024, 'stored audio fits the browser cache budget');
});

test('only current and next survive advancing the chapter window', async () => {
  const cache = loadCache();
  const current = identity;
  const next = { ...identity, chapterId: 'chapter-2' };
  const nextAfterThat = { ...identity, chapterId: 'chapter-3' };
  const audio = new Blob(['audio'], { type: 'audio/mpeg' });
  await cache.retainChapterAudioWindow([current, next]);
  await cache.cacheChapterAudio(current, audio);
  await cache.cacheChapterAudio(next, audio);
  await cache.retainChapterAudioWindow([next, nextAfterThat]);
  assert.equal(await cache.getCachedChapterAudio(current), null, 'the previous chapter is removed immediately');
  assert.equal(await (await cache.getCachedChapterAudio(next)).text(), 'audio', 'the ready next chapter becomes current without regeneration');
  await cache.cacheChapterAudio(nextAfterThat, audio);
  await cache.cacheChapterAudio(current, audio);
  assert.equal(await cache.getCachedChapterAudio(current), null, 'a late previous-chapter result cannot return to the cache');
  assert.equal(await (await cache.getCachedChapterAudio(nextAfterThat)).text(), 'audio');
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 2);
});

test('jumping chapters removes the old pair and rejects late prefetch completions', async () => {
  const cache = loadCache();
  const oldNext = { ...identity, chapterId: 'chapter-2' };
  const jumpedCurrent = { ...identity, chapterId: 'chapter-20' };
  const jumpedNext = { ...identity, chapterId: 'chapter-21' };
  const audio = new Blob(['audio'], { type: 'audio/wav' });
  await cache.retainChapterAudioWindow([identity, oldNext]);
  await cache.cacheChapterAudio(identity, audio);
  await cache.cacheChapterAudio(oldNext, audio);
  await cache.retainChapterAudioWindow([jumpedCurrent, jumpedNext]);
  await cache.cacheChapterAudio(oldNext, audio);
  assert.equal(await cache.getCachedChapterAudio(identity), null);
  assert.equal(await cache.getCachedChapterAudio(oldNext), null);
  await cache.cacheChapterAudio(jumpedCurrent, audio);
  await cache.cacheChapterAudio(jumpedNext, audio);
  assert.equal(await (await cache.getCachedChapterAudio(jumpedCurrent)).text(), 'audio');
  assert.equal(await (await cache.getCachedChapterAudio(jumpedNext)).text(), 'audio');
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 2);
});

test('a window change in another tab rejects old in-flight prefetch results', async () => {
  const storage = memoryStorage();
  const firstTab = loadCache({ storage });
  const secondTab = loadCache({ storage });
  const oldNext = { ...identity, chapterId: 'chapter-2' };
  const jumpedCurrent = { ...identity, chapterId: 'chapter-10' };
  const jumpedNext = { ...identity, chapterId: 'chapter-11' };
  const audio = new Blob(['audio'], { type: 'audio/wav' });
  await firstTab.retainChapterAudioWindow([identity, oldNext]);
  await firstTab.cacheChapterAudio(identity, audio);
  await secondTab.retainChapterAudioWindow([jumpedCurrent, jumpedNext]);
  await firstTab.cacheChapterAudio(oldNext, audio);
  assert.equal(await firstTab.getCachedChapterAudio(identity), null);
  assert.equal(await firstTab.getCachedChapterAudio(oldNext), null);
  await secondTab.cacheChapterAudio(jumpedCurrent, audio);
  assert.equal(await (await secondTab.getCachedChapterAudio(jumpedCurrent)).text(), 'audio');
  assert.equal(storage.stores.get('listen-audio-v3').size, 1);
});

test('changing provider or narration settings purges the old pair and rejects its late audio', async t => {
  for (const change of [{ provider: 'xiaomi', voice: 'Mia' }, { voice: 'en-GB' }, { grammarModel: 'gpt-4o-mini' }, { title: 'Revised chapter title' }, { content: ['Revised chapter.'] }]) {
    await t.test(Object.keys(change).join('/'), async () => {
      const cache = loadCache();
      const oldNext = { ...identity, chapterId: 'chapter-2' };
      const updated = { ...identity, ...change };
      const updatedNext = { ...updated, chapterId: 'chapter-2' };
      const audio = new Blob(['audio'], { type: 'audio/wav' });
      await cache.retainChapterAudioWindow([identity, oldNext]);
      await cache.cacheChapterAudio(identity, audio);
      await cache.cacheChapterAudio(oldNext, audio);
      await cache.retainChapterAudioWindow([updated, updatedNext]);
      await cache.cacheChapterAudio(identity, audio);
      await cache.cacheChapterAudio(oldNext, audio);
      assert.equal(await cache.getCachedChapterAudio(identity), null);
      assert.equal(await cache.getCachedChapterAudio(oldNext), null);
      await cache.cacheChapterAudio(updated, audio);
      assert.equal(await (await cache.getCachedChapterAudio(updated)).text(), 'audio');
      assert.equal(cache.storage.stores.get('listen-audio-v3').size, 1);
    });
  }
});

test('the final chapter retains only current audio and an empty window clears storage', async () => {
  const cache = loadCache();
  const next = { ...identity, chapterId: 'chapter-2' };
  const audio = new Blob(['audio'], { type: 'audio/mpeg' });
  await cache.retainChapterAudioWindow([identity, next]);
  await cache.cacheChapterAudio(identity, audio);
  await cache.cacheChapterAudio(next, audio);
  await cache.retainChapterAudioWindow([next]);
  assert.equal(await cache.getCachedChapterAudio(identity), null);
  assert.equal(await (await cache.getCachedChapterAudio(next)).text(), 'audio');
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 1);
  await cache.retainChapterAudioWindow([]);
  await cache.cacheChapterAudio(next, audio);
  assert.equal(await cache.getCachedChapterAudio(next), null, 'late results cannot repopulate a cleared window');
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 0);
});

test('even tiny audio is limited to five cached chapters', async () => {
  const cache = loadCache();
  const audio = new Blob(['small audio'], { type: 'audio/mpeg' });
  await Promise.all([0, 1, 2, 3, 4, 5, 6].map(index => cache.cacheChapterAudio({ ...identity, chapterId: `small-${index}` }, audio)));
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 5, 'chapter count is bounded independently of byte size');
});

test('the five-chapter window slides without retaining previous or sixth-ahead audio', async () => {
  const cache = loadCache();
  const chapters = Array.from({ length: 7 }, (_, index) => ({ ...identity, chapterId: `window-${index}` }));
  const audio = new Blob(['ready narration'], { type: 'audio/wav' });
  await cache.retainChapterAudioWindow(chapters.slice(0, 5));
  for (const chapter of chapters) await cache.cacheChapterAudio(chapter, audio);
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 5);
  assert.equal(await cache.getCachedChapterAudio(chapters[5]), null);
  await cache.retainChapterAudioWindow(chapters.slice(1, 6));
  await cache.cacheChapterAudio(chapters[0], audio);
  await cache.cacheChapterAudio(chapters[5], audio);
  assert.equal(await cache.getCachedChapterAudio(chapters[0]), null);
  for (const chapter of chapters.slice(1, 6)) assert.ok(await cache.getCachedChapterAudio(chapter));
  assert.equal(cache.storage.stores.get('listen-audio-v3').size, 5);
});

test('oversized audio cannot crowd out an existing useful chapter', async () => {
  const cache = loadCache();
  await cache.cacheChapterAudio(identity, new Blob(['useful audio'], { type: 'audio/mpeg' }));
  await cache.cacheChapterAudio({ ...identity, chapterId: 'oversized' }, new Blob([new Uint8Array(101 * 1024 * 1024)], { type: 'audio/wav' }));
  assert.equal(await cache.getCachedChapterAudio({ ...identity, chapterId: 'oversized' }), null);
  assert.equal(await (await cache.getCachedChapterAudio(identity)).text(), 'useful audio');
});

test('anonymous users, empty audio, and non-audio payloads are not cached', async () => {
  const cache = loadCache();
  for (const [entryIdentity, audio] of [
    [{ ...identity, userId: '' }, new Blob(['audio'], { type: 'audio/wav' })],
    [identity, new Blob([], { type: 'audio/wav' })],
    [identity, new Blob(['error response'], { type: 'application/json' })],
  ]) {
    await cache.cacheChapterAudio(entryIdentity, audio);
    assert.equal(await cache.getCachedChapterAudio(entryIdentity), null);
  }
  assert.equal([...cache.storage.stores.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
});

test('failed access-time refresh still returns already cached audio', async () => {
  const cache = loadCache();
  await cache.cacheChapterAudio(identity, new Blob(['playable audio'], { type: 'audio/wav' }));
  cache.storage.failures.put = true;
  assert.equal(await (await cache.getCachedChapterAudio(identity)).text(), 'playable audio');
});

test('unavailable browser storage or crypto leaves normal generation usable', async t => {
  for (const options of [{ storage: null }, { crypto: null }]) {
    await t.test(options.storage === null ? 'storage unavailable' : 'crypto unavailable', async () => {
      const cache = loadCache(options);
      assert.equal(await cache.getCachedChapterAudio(identity), null);
      await assert.doesNotReject(cache.cacheChapterAudio(identity, new Blob(['audio'], { type: 'audio/mpeg' })));
      await assert.doesNotReject(cache.retainChapterAudioWindow([identity]));
    });
  }
});

test('storage read, write, and eviction failures never escape to playback', async t => {
  for (const method of ['open', 'match', 'put', 'keys', 'delete']) {
    await t.test(method, async () => {
      const cache = loadCache();
      await cache.cacheChapterAudio(identity, new Blob(['audio'], { type: 'audio/mpeg' }));
      cache.clock.now += 8 * DAY;
      cache.storage.failures[method] = true;
      await assert.doesNotReject(cache.getCachedChapterAudio(identity));
      await assert.doesNotReject(cache.cacheChapterAudio({ ...identity, chapterId: 'next' }, new Blob(['next audio'], { type: 'audio/mpeg' })));
      await assert.doesNotReject(cache.retainChapterAudioWindow([identity]));
    });
  }
});


test('concurrent chapter writes cannot race past the storage budget', async () => {
  const cache = loadCache();
  const audio = new Blob([new Uint8Array(36 * 1024 * 1024)], { type: 'audio/wav' });
  await Promise.all([0, 1, 2].map(index => cache.cacheChapterAudio({ ...identity, chapterId: 'parallel-' + index }, audio)));
  const entries = cache.storage.stores.get('listen-audio-v3');
  let bytes = 0;
  for (const response of entries.values()) bytes += Number(response.headers.get('X-Audio-Bytes'));
  assert.equal(entries.size, 2);
  assert.ok(bytes <= 100 * 1024 * 1024);
});

test('cache operations use shared Web Locks when supported across tabs', async () => {
  const storage = memoryStorage();
  let queue = Promise.resolve();
  const lockNames = [];
  const browserNavigator = { locks: { request(name, operation) {
    lockNames.push(name);
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  } } };
  const first = loadCache({ storage, browserNavigator });
  const second = loadCache({ storage, browserNavigator });
  const audio = new Blob(['shared audio'], { type: 'audio/mpeg' });
  await Promise.all([first.cacheChapterAudio(identity, audio), second.cacheChapterAudio({ ...identity, chapterId: 'other' }, audio)]);
  assert.equal(await (await second.getCachedChapterAudio(identity)).text(), 'shared audio');
  assert.equal(lockNames.length, 3);
  assert.ok(lockNames.every(name => name === 'listen-audio-v3'));
});

test('title narration removes owned v1/v2 audio and window caches while preserving current and unrelated caches', async () => {
  const storage = memoryStorage();
  await storage.open('listen-audio-v1');
  await storage.open('listen-audio-window-v1');
  await storage.open('listen-audio-v2');
  await storage.open('listen-audio-window-v2');
  await storage.open('listen-audio-v3');
  await storage.open('listen-audio-window-v3');
  await storage.open('listen-audio-v2-unrelated');
  await storage.open('unrelated-assets');
  const cache = loadCache({ storage });
  await cache.getCachedChapterAudio(identity);
  assert.equal(storage.stores.has('listen-audio-v1'), false);
  assert.equal(storage.stores.has('listen-audio-window-v1'), false);
  assert.equal(storage.stores.has('listen-audio-v2'), false);
  assert.equal(storage.stores.has('listen-audio-window-v2'), false);
  assert.equal(storage.stores.has('listen-audio-v3'), true);
  assert.equal(storage.stores.has('listen-audio-window-v3'), true);
  assert.equal(storage.stores.has('listen-audio-v2-unrelated'), true);
  assert.equal(storage.stores.has('unrelated-assets'), true);
});
