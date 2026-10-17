const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// A compare-and-swap database double: reads return snapshots, and writes only
// succeed against the revision/window they actually observed. No Prisma import.
function harness() {
  const memory = { state: null, chunks: new Map(), conflicts: 0, failedCas: 0, failChunk: -1, beforeChunk: null, legacyClears: 0 };
  const chapters = ['book-a', 'book-b'].flatMap(bookId => Array.from({ length: 9 }, (_, order) => ({ id: `${bookId}-${order}`, bookId, order })));
  const clone = value => value == null ? value : structuredClone(value);
  const prisma = {
    chapter: { async findMany({ where, take }) {
      return chapters.filter(chapter => chapter.bookId === where.bookId && chapter.order >= where.order.gte)
        .sort((a, b) => a.order - b.order).slice(0, take).map(({ id }) => ({ id }));
    } },
    chapterAudio: { async deleteMany() { memory.legacyClears++; return { count: 0 }; } },
    ttsAudioCacheState: {
      async findUnique() { return clone(memory.state); },
      async create({ data }) {
        if (memory.state) throw Object.assign(new Error('Duplicate state'), { code: 'P2002' });
        memory.state = clone(data);
        return clone(memory.state);
      },
      async updateMany({ where, data }) {
        if (memory.conflicts-- > 0 || !memory.state || memory.state.revision !== where.revision ||
            (where.windowToken && memory.state.windowToken !== where.windowToken)) {
          memory.failedCas++;
          return { count: 0 };
        }
        Object.assign(memory.state, clone(data));
        return { count: 1 };
      },
    },
    ttsAudioCacheChunk: {
      async create({ data }) {
        if (memory.beforeChunk) await memory.beforeChunk(data);
        if (data.index === memory.failChunk) throw new Error('Chunk storage unavailable');
        const chunk = { ...data, audio: Buffer.from(data.audio), createdAt: new Date() };
        memory.chunks.set(`${data.audioId}:${data.index}`, chunk);
        return chunk;
      },
      async findMany({ where }) {
        return [...memory.chunks.values()].filter(chunk => chunk.audioId === where.audioId).sort((a, b) => a.index - b.index);
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [key, chunk] of memory.chunks) {
          const selected = where.audioId.in ? where.audioId.in.includes(chunk.audioId)
            : !where.audioId.notIn.includes(chunk.audioId) && chunk.createdAt < where.createdAt.lt;
          if (selected) { memory.chunks.delete(key); count++; }
        }
        return { count };
      },
    },
  };
  const filename = path.resolve(__dirname, '../src/lib/server-audio-cache.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({
    module, exports: module.exports, Buffer, Uint8Array, Date,
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === '@/lib/prisma') return { prisma };
      throw new Error(`Unexpected cache dependency: ${name}`);
    },
  });
  return { ...module.exports, memory };
}

function audio(bytes = Buffer.from('audio'), overrides = {}) {
  return { audio: bytes, contentType: 'audio/wav', provider: 'gemini', voice: 'Kore', fallback: [], ...overrides };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('the server keeps only the current chapter and four successors, dropping previous audio on advance', async () => {
  const cache = harness();
  const window = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  assert.deepEqual(Array.from(window.chapterIds), ['book-a-0', 'book-a-1', 'book-a-2', 'book-a-3', 'book-a-4']);
  for (let index = 0; index <= 5; index++) await cache.writeServerAudio(window, `book-a-${index}`, `key-${index}`, `key-${index}`, audio());
  assert.equal(cache.memory.state.entries.length, 5);
  assert.equal(cache.memory.chunks.size, 5, 'out-of-window sixth chapter is not stored');
  const advanced = await cache.activateAudioCacheWindow('book-a', 'book-a-2', 2);
  assert.deepEqual(Array.from(advanced.chapterIds), ['book-a-2', 'book-a-3', 'book-a-4', 'book-a-5', 'book-a-6']);
  assert.equal(cache.memory.state.entries.length, 3);
  assert.equal(await cache.readServerAudio(advanced, 'book-a-0', 'key-0'), null);
  assert.ok(await cache.readServerAudio(advanced, 'book-a-2', 'key-2'));
  assert.equal(cache.memory.chunks.size, 3);
});

test('changing books leaves one global active book and removes old book audio', async () => {
  const cache = harness();
  const first = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  await cache.writeServerAudio(first, 'book-a-0', 'key', 'key', audio());
  const second = await cache.activateAudioCacheWindow('book-b', 'book-b-0', 0);
  assert.equal(cache.memory.state.bookId, 'book-b');
  assert.equal(cache.memory.state.entries.length, 0);
  assert.equal(cache.memory.chunks.size, 0);
  assert.equal(await cache.getAudioCacheWindow('book-a', 'book-a-0'), null);
  assert.ok(await cache.getAudioCacheWindow('book-b', 'book-b-0'));
  assert.equal(await cache.readServerAudio(first, 'book-a-0', 'key'), null);
  assert.equal(second.chapterIds.length, 5);
  assert.ok(cache.memory.legacyClears > 0);
});

test('reusing the middle anchor keeps its five chapters and backward windows reuse retained audio', async () => {
  const cache = harness();
  const initial = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  for (let index = 0; index < 5; index++) {
    await cache.writeServerAudio(initial, `book-a-${index}`, `key-${index}`, `key-${index}`, audio(Buffer.from(`chapter-${index}`)));
  }
  // Chapter 2 sends the same chapter 1 anchor; no window replacement is needed.
  const middle = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  assert.equal(middle.windowToken, initial.windowToken);
  assert.equal(cache.memory.state.entries.length, 5);
  assert.equal(cache.memory.chunks.size, 5);
  // Chapter 3 moves the anchor, producing chapters 3..7.
  const advanced = await cache.activateAudioCacheWindow('book-a', 'book-a-2', 2);
  for (const index of [5, 6]) {
    await cache.writeServerAudio(advanced, `book-a-${index}`, `key-${index}`, `key-${index}`, audio(Buffer.from(`chapter-${index}`)));
  }
  assert.deepEqual(Array.from(advanced.chapterIds), ['book-a-2', 'book-a-3', 'book-a-4', 'book-a-5', 'book-a-6']);
  assert.equal(cache.memory.state.entries.length, 5);
  // Jumping backward to chapter 2 keeps the already generated chapters 3..6.
  const backward = await cache.activateAudioCacheWindow('book-a', 'book-a-1', 1);
  assert.deepEqual(Array.from(backward.chapterIds), ['book-a-1', 'book-a-2', 'book-a-3', 'book-a-4', 'book-a-5']);
  for (let index = 2; index <= 5; index++) {
    assert.equal((await cache.readServerAudio(backward, `book-a-${index}`, `key-${index}`)).audio.toString(), `chapter-${index}`);
  }
  assert.equal(await cache.readServerAudio(backward, 'book-a-6', 'key-6'), null);
  assert.equal(cache.memory.state.entries.length, 4);
  assert.equal(cache.memory.chunks.size, 4);
});

test('fallback audio is reusable under requested and actual identities but changed text or settings miss', async () => {
  const cache = harness();
  const window = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  const content = ['Source chapter.'];
  const requested = cache.serverAudioCacheKey(content, 'gemini', 'Kore', 'OFF');
  const actual = cache.serverAudioCacheKey(content, 'xiaomi', 'Mia', 'OFF');
  await cache.writeServerAudio(window, 'book-a-0', requested, actual, audio(undefined, { provider: 'xiaomi', voice: 'Mia', fallback: ['gemini'] }));
  for (const key of [requested, actual]) {
    const result = await cache.readServerAudio(window, 'book-a-0', key);
    assert.equal(result.provider, 'xiaomi');
    assert.equal(result.voice, 'Mia');
    assert.deepEqual(Array.from(result.fallback), ['gemini']);
  }
  for (const variant of [
    [['Edited text.'], 'gemini', 'Kore', 'OFF'], [content, 'gemini', 'Puck', 'OFF'],
    [content, 'gemini', 'Kore', 'gpt-4o-mini'], [content, 'google', 'en', 'OFF'],
  ]) assert.equal(await cache.readServerAudio(window, 'book-a-0', cache.serverAudioCacheKey(...variant)), null);
});

test('audio larger than a MongoDB document is chunked and read back without loss', async () => {
  const cache = harness();
  const window = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  const bytes = Buffer.alloc(17 * 1024 * 1024 + 5, 7);
  bytes[6 * 1024 * 1024] = 9;
  bytes[12 * 1024 * 1024] = 11;
  await cache.writeServerAudio(window, 'book-a-0', 'key', 'key', audio(bytes));
  assert.ok(cache.memory.chunks.size > 1);
  assert.ok([...cache.memory.chunks.values()].every(chunk => chunk.audio.length < 16 * 1024 * 1024));
  const result = await cache.readServerAudio(window, 'book-a-0', 'key');
  assert.equal(result.audio.length, bytes.length);
  assert.equal(crypto.createHash('sha256').update(result.audio).digest('hex'), crypto.createHash('sha256').update(bytes).digest('hex'));
  const missingKey = [...cache.memory.chunks.keys()][1];
  cache.memory.chunks.delete(missingKey);
  assert.equal(await cache.readServerAudio(window, 'book-a-0', 'key'), null, 'partial audio is never returned as a complete chapter');
});

test('late writes from an old book window cannot publish or retain their temporary chunks', async () => {
  const cache = harness();
  const first = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  const started = deferred();
  const finish = deferred();
  cache.memory.beforeChunk = async () => { started.resolve(); await finish.promise; };
  const pending = cache.writeServerAudio(first, 'book-a-0', 'key', 'key', audio());
  await started.promise;
  await cache.activateAudioCacheWindow('book-b', 'book-b-0', 0);
  finish.resolve();
  await pending;
  assert.equal(cache.memory.state.bookId, 'book-b');
  assert.equal(cache.memory.state.entries.length, 0);
  assert.equal(cache.memory.chunks.size, 0);
});

test('retained in-flight audio may finish after a same-book anchor shift while removed chapters stay excluded', async () => {
  const cache = harness();
  const first = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  const started = deferred();
  const finish = deferred();
  cache.memory.beforeChunk = async () => { started.resolve(); await finish.promise; };
  const pending = cache.writeServerAudio(first, 'book-a-2', 'key-2', 'key-2', audio(Buffer.from('prepared chapter 3')));
  await started.promise;
  const shifted = await cache.activateAudioCacheWindow('book-a', 'book-a-2', 2);
  assert.equal(shifted.windowToken, first.windowToken, 'same-book retained requests keep their ownership token');
  finish.resolve();
  await pending;
  assert.equal((await cache.readServerAudio(shifted, 'book-a-2', 'key-2')).audio.toString(), 'prepared chapter 3');
  await cache.writeServerAudio(first, 'book-a-0', 'key-0', 'key-0', audio());
  assert.equal(await cache.readServerAudio(shifted, 'book-a-0', 'key-0'), null);
  assert.equal(cache.memory.chunks.size, 1, 'old chapters outside the shifted window are still rejected');
});

test('concurrent chapter publications retry compare-and-swap conflicts without losing entries', async () => {
  const cache = harness();
  const window = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  cache.memory.conflicts = 1;
  await Promise.all([0, 1, 2].map(index => cache.writeServerAudio(window, `book-a-${index}`, `key-${index}`, `key-${index}`, audio())));
  assert.equal(cache.memory.state.entries.length, 3);
  assert.equal(cache.memory.chunks.size, 3);
  assert.ok(cache.memory.failedCas > 0);
  for (let index = 0; index < 3; index++) assert.ok(await cache.readServerAudio(window, `book-a-${index}`, `key-${index}`));
});

test('an interrupted chunk write preserves the last published audio and removes unpublished bytes', async () => {
  const cache = harness();
  const window = await cache.activateAudioCacheWindow('book-a', 'book-a-0', 0);
  await cache.writeServerAudio(window, 'book-a-0', 'old-key', 'old-key', audio(Buffer.from('published')));
  cache.memory.failChunk = 1;
  await assert.rejects(cache.writeServerAudio(window, 'book-a-0', 'new-key', 'new-key', audio(Buffer.alloc(7 * 1024 * 1024))), /storage unavailable/);
  assert.equal((await cache.readServerAudio(window, 'book-a-0', 'old-key')).audio.toString(), 'published');
  assert.equal(await cache.readServerAudio(window, 'book-a-0', 'new-key'), null);
  assert.equal(cache.memory.chunks.size, 1);
});
