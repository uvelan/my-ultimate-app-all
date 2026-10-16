const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Transpile the real server code, but never import Next, Prisma, or API SDKs.
// Every test gets its own globals, environment, and module state.
const root = path.resolve(__dirname, '..');
function loadTs(relativePath, { mocks = {}, env = {}, fetch } = {}) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'node:buffer' || name === 'buffer') return { Buffer };
      throw new Error(`Unmocked import: ${name}`);
    },
    Buffer, Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder,
    URL, Request, Response, Headers, ReadableStream, AbortController, AbortSignal,
    process: { env: { ...env } },
    fetch: fetch || (() => { throw new Error('Unexpected network request'); }),
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout,
  });
  new vm.Script(source, { filename }).runInContext(context);
  return module.exports;
}

function riffChunk(id, bytes) {
  const header = Buffer.alloc(8);
  header.write(id);
  header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, bytes.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function wav(dataParts = [Buffer.from([1, 0, 2, 0])], { sampleRate = 24000, channels = 1, junk = false } = {}) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0); // PCM
  format.writeUInt16LE(channels, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * channels * 2, 8);
  format.writeUInt16LE(channels * 2, 12);
  format.writeUInt16LE(16, 14);
  const chunks = [riffChunk('fmt ', format)];
  if (junk) chunks.push(riffChunk('JUNK', Buffer.from([9, 8, 7])));
  chunks.push(...dataParts.map(data => riffChunk('data', data)));
  const body = Buffer.concat([Buffer.from('WAVE'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function readWav(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buffer.readUInt32LE(4), buffer.length - 8, 'RIFF size must describe the entire result');
  const data = [];
  let format;
  for (let offset = 12; offset < buffer.length;) {
    assert.ok(offset + 8 <= buffer.length, 'complete chunk header');
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= buffer.length, 'complete chunk payload');
    const bytes = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') format = bytes;
    if (id === 'data') data.push(bytes);
    offset += 8 + size + (size % 2);
  }
  assert.ok(format, 'format is retained');
  assert.ok(data.length, 'data header is retained');
  return { data: Buffer.concat(data), sampleRate: format.readUInt32LE(4), channels: format.readUInt16LE(2) };
}

function audioResponse(bytes = wav()) {
  return Response.json({ choices: [{ message: { audio: { data: bytes.toString('base64') } } }] });
}

function helper(options = {}) {
  return loadTs('src/lib/mimo-tts.ts', { ...options, env: { MIMO_API_KEY: 'test-key', ...options.env } });
}

function routeHarness({ env = { MIMO_API_KEY: 'test-key' }, content = ['Hello world.'], cached = null, cacheRows = [], fetch, authenticated = true } = {}) {
  const calls = { chapter: [], question: [], cacheRead: [], cacheWrite: [], cachePrune: [], cacheDelete: [], cacheBackground: [], google: [] };
  const db = {
    chapter: {
      async findUnique(args) { calls.chapter.push(args); return { id: 'chapter-1', bookId: 'book-1', order: 2, content }; },
      async findMany(args) { calls.cacheBackground.push(args); return []; },
    },
    interviewQuestion: {
      async findUnique(args) { calls.question.push(args); return { answer: content.join(' ') }; },
    },
    chapterAudio: {
      async findUnique(args) { calls.cacheRead.push(args); return cached ? { audio: cached } : null; },
      async upsert(args) { calls.cacheWrite.push(args); },
      async findMany(args) { calls.cachePrune.push(args); return cacheRows; },
      async deleteMany(args) { calls.cacheDelete.push(args); },
      async create() { throw new Error('Unexpected background cache generation'); },
    },
  };
  class NextResponse extends Response {
    static json(body, init) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json' } }); }
  }
  const mimo = loadTs('src/lib/mimo-tts.ts', { env, fetch });
  const route = loadTs('src/app/api/tts/route.ts', {
    env, fetch,
    mocks: {
      '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: authenticated, user: { id: 'user-1' } }) },
      'next/server': { NextResponse },
      '@/lib/prisma': { prisma: db },
      '@/lib/mimo-tts': mimo,
      'google-tts-api': { getAllAudioUrls(text, options) { calls.google.push({ text, options }); return [{ url: 'https://google.test/audio' }]; } },
      '@google/generative-ai': { GoogleGenerativeAI: class { constructor() { throw new Error('Unexpected Gemini call'); } } },
      openai: class { constructor() { throw new Error('Unexpected OpenAI call'); } },
    },
  });
  return { calls, get: (query = '') => route.GET(new Request(`https://app.test/api/tts?${query}`)) };
}

test('MiMo exposes the supported voice choices', () => {
  assert.deepEqual(Array.from(helper().MIMO_VOICES), ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean']);
});

test('MiMo sends narration as an assistant message with WAV output and the chosen voice', async () => {
  const requests = [];
  const controller = new AbortController();
  const signal = controller.signal;
  const { generateMimoAudio } = helper({
    fetch: async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return audioResponse(); },
  });
  const output = await generateMimoAudio('Read this exact sentence.', 'Mia', signal);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.xiaomimimo.com/v1/chat/completions');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(new Headers(requests[0].options.headers).get('api-key'), 'test-key');
  assert.equal(requests[0].body.model, 'mimo-v2.5-tts');
  assert.equal(requests[0].body.audio.format, 'wav');
  assert.equal(requests[0].body.audio.voice, 'Mia');
  assert.ok(requests[0].body.messages.some(message => message.role === 'assistant' && message.content === 'Read this exact sentence.'));
  assert.equal(requests[0].options.signal.aborted, false);
  controller.abort();
  assert.equal(requests[0].options.signal.aborted, true, 'upstream request inherits caller cancellation');
  assert.deepEqual(readWav(output).data, Buffer.from([1, 0, 2, 0]));
});

test('MiMo splits long Unicode narration without losing text and joins every WAV data chunk in order', async () => {
  const sentence = 'A reader says café, नमस्ते, and hello 😀. ';
  const text = sentence.repeat(120).trim();
  const spoken = [];
  const expectedAudio = [];
  const { generateMimoAudio } = helper({ fetch: async (_url, options) => {
    const body = JSON.parse(options.body);
    spoken.push(body.messages.find(message => message.role === 'assistant').content);
    const index = spoken.length;
    const first = Buffer.from([index, 0]);
    const second = Buffer.from([index + 100, 0]);
    expectedAudio.push(first, second);
    await new Promise(resolve => setTimeout(resolve, index === 1 ? 15 : 0));
    return audioResponse(wav([first, second], { junk: true }));
  } });
  const result = readWav(await generateMimoAudio(text, 'mimo_default'));
  assert.ok(spoken.length > 1, 'long narration needs multiple upstream calls');
  assert.equal(spoken.join(' ').replace(/\s+/g, ' ').trim(), text);
  for (const chunk of spoken) {
    assert.ok(Array.from(chunk).length <= 1200, 'bounded synthesis request');
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk), 'must not split a surrogate pair');
    assert.ok(chunk.endsWith('.'), 'available sentence boundaries are respected');
  }
  assert.equal(result.sampleRate, 24000);
  assert.equal(result.channels, 1);
  assert.deepEqual(result.data, Buffer.concat(expectedAudio));
});

test('MiMo rejects incompatible WAV formats across narration chunks', async () => {
  let calls = 0;
  const { generateMimoAudio } = helper({ fetch: async () => audioResponse(wav(undefined, { sampleRate: ++calls === 1 ? 24000 : 16000 })) });
  await assert.rejects(generateMimoAudio('One complete sentence. '.repeat(120), 'Dean'), error => error.status === 502);
  assert.ok(calls >= 2);
});

test('MiMo rejects missing, invalid base64, and truncated audio', async t => {
  const truncated = wav().subarray(0, -2);
  for (const [name, response] of [
    ['missing', { choices: [{ message: {} }] }],
    ['invalid base64', { choices: [{ message: { audio: { data: '%%%not-base64%%%' } } }] }],
    ['truncated WAV', { choices: [{ message: { audio: { data: truncated.toString('base64') } } }] }],
  ]) {
    await t.test(name, async () => {
      const { generateMimoAudio } = helper({ fetch: async () => Response.json(response) });
      await assert.rejects(generateMimoAudio('Hello.', 'Chloe'), error => error.status === 502);
    });
  }
});

test('MiMo reports upstream failure without leaking upstream response bodies', async () => {
  const { generateMimoAudio } = helper({ fetch: async () => new Response('secret-provider-details', { status: 401 }) });
  await assert.rejects(generateMimoAudio('Hello.', 'Milo'), error => {
    assert.equal(error.status, 502);
    assert.ok(!error.message.includes('secret-provider-details'));
    return true;
  });
});

test('MiMo supports a configured compatible endpoint and model', async () => {
  let request;
  const { generateMimoAudio } = helper({
    env: { MIMO_BASE_URL: 'https://mimo.test/custom/v1///', MIMO_TTS_MODEL: 'configured-tts' },
    fetch: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return audioResponse(); },
  });
  await generateMimoAudio('Hello.', 'mimo_default');
  assert.equal(request.url, 'https://mimo.test/custom/v1/chat/completions');
  assert.equal(request.body.model, 'configured-tts');
});

test('MiMo honors cancellation before sending any upstream request', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  const { generateMimoAudio } = helper({ fetch: async () => { requests++; return audioResponse(); } });
  await assert.rejects(generateMimoAudio('Hello.', 'Mia', controller.signal), error => error.name === 'AbortError');
  assert.equal(requests, 0);
});

test('MiMo rejects output cut off by the provider instead of returning partial narration', async () => {
  const { generateMimoAudio } = helper({ fetch: async () => Response.json({
    choices: [{ finish_reason: 'length', message: { audio: { data: wav().toString('base64') } } }],
  }) });
  await assert.rejects(generateMimoAudio('Hello.', 'Mia'), error => error.status === 502);
});

test('unauthenticated TTS requests do not access content or providers', async () => {
  const app = routeHarness({ authenticated: false });
  assert.equal((await app.get('chapterId=chapter-1&provider=xiaomi')).status, 401);
  assert.equal(app.calls.chapter.length, 0);
  assert.equal(app.calls.google.length, 0);
});

test('provider and Xiaomi voice validation happen before content lookup', async t => {
  for (const query of ['provider=unknown', 'provider=xiaomi&voice=en', 'provider=xiaomi&voice=gemini-3.1-kore']) {
    await t.test(query, async () => {
      const app = routeHarness();
      assert.equal((await app.get(`chapterId=chapter-1&${query}`)).status, 400);
      assert.equal(app.calls.chapter.length, 0);
      assert.equal(app.calls.cacheRead.length, 0);
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('missing MiMo credentials fail before content lookup or grammar correction', async () => {
  const app = routeHarness({ env: {} });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Mia&grammarModel=gpt-4o-mini');
  assert.equal(response.status, 503);
  assert.equal(app.calls.chapter.length, 0);
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.google.length, 0);
});

test('Xiaomi cleans narration and returns private WAV without consulting or writing Google caches', async () => {
  const requests = [];
  const app = routeHarness({
    cached: Buffer.from('old-mp3'),
    content: ['# **Hello** <b>reader</b>. [Visit](https://example.test) `hidden` ![image](pic.png)', '```js\nsecret()\n``` End.'],
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return audioResponse(); },
  });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Chloe');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(response.body, 'audio is returned as a readable response body');
  assert.deepEqual(readWav(Buffer.from(await response.arrayBuffer())).data, Buffer.from([1, 0, 2, 0]));
  assert.equal(requests[0].body.messages.find(message => message.role === 'assistant').content, 'Hello reader. Visit End.');
  assert.equal(app.calls.google.length, 0);
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.cacheWrite.length, 0);
  assert.equal(app.calls.cachePrune.length, 1, 'only cache-window metadata is consulted');
  assert.equal(app.calls.cacheBackground.length, 0);
});

test('Xiaomi supports question narration and its default voice', async () => {
  let body;
  const app = routeHarness({ fetch: async (_url, options) => { body = JSON.parse(options.body); return audioResponse(); } });
  const response = await app.get('questionId=question-1&questionField=answer&provider=xiaomi');
  assert.equal(response.status, 200);
  assert.equal(body.audio.voice, 'Mia');
  assert.equal(app.calls.question.length, 1);
  assert.equal(app.calls.chapter.length, 0);
});

test('Xiaomi upstream and malformed audio errors never fall back to Google', async t => {
  for (const [name, fetch] of [
    ['upstream failure', async () => new Response('private upstream failure', { status: 500 })],
    ['malformed audio', async () => Response.json({ choices: [] })],
  ]) {
    await t.test(name, async () => {
      const app = routeHarness({ fetch });
      const response = await app.get('chapterId=chapter-1&provider=xiaomi');
      assert.equal(response.status, 502);
      assert.equal(app.calls.google.length, 0);
      assert.equal(app.calls.cacheRead.length, 0);
      assert.equal(app.calls.cacheWrite.length, 0);
      assert.ok(!(await response.text()).includes('private upstream failure'));
    });
  }
});

test('Xiaomi preserves provider rate limiting without Google fallback', async () => {
  const app = routeHarness({ fetch: async () => new Response('private quota details', { status: 429 }) });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi');
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /rate limit/i);
  assert.equal(app.calls.google.length, 0);
  assert.equal(app.calls.cacheRead.length, 0);
});

test('default and explicit Google requests retain the existing English MP3 chapter cache', async t => {
  for (const provider of ['', '&provider=google']) {
    await t.test(provider || 'default provider', async () => {
      const cached = Buffer.from('cached-mp3-audio');
      const app = routeHarness({ env: {}, cached });
      const response = await app.get(`chapterId=chapter-1${provider}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.match(response.headers.get('cache-control'), /private/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), cached);
      assert.equal(app.calls.cacheRead.length, 1);
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('Google cache misses still generate MP3 and save the chapter cache', async () => {
  const mp3 = Buffer.from('new-google-mp3');
  const urls = [];
  const app = routeHarness({ env: {}, fetch: async url => { urls.push(url); return new Response(mp3); } });
  const response = await app.get('chapterId=chapter-1&provider=google');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp3);
  assert.deepEqual(urls, ['https://google.test/audio']);
  assert.equal(app.calls.google.length, 1);
  assert.equal(app.calls.google[0].options.lang, 'en');
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.deepEqual(Buffer.from(app.calls.cacheWrite[0].create.audio), mp3);
});

test('server cache pruning keeps current and next without retaining previous or generating neighbors', async t => {
  for (const [name, query, removed] of [
    ['foreground chapter', '', ['cache-0', 'cache-1', 'cache-4']],
    ['prefetched next chapter', '&prefetch=1', ['cache-0', 'cache-3', 'cache-4']],
  ]) {
    await t.test(name, async () => {
      const cacheRows = [0, 1, 2, 3, 4].map(order => ({ id: `cache-${order}`, chapter: { order } }));
      const app = routeHarness({ env: {}, cached: Buffer.from('cached-mp3'), cacheRows });
      const response = await app.get(`chapterId=chapter-1&provider=google${query}`);
      assert.equal(response.status, 200);
      assert.equal(app.calls.cachePrune.length, 1);
      assert.equal(app.calls.cachePrune[0].where.bookId, 'book-1');
      assert.equal(app.calls.cacheDelete.length, 1);
      assert.deepEqual(Array.from(app.calls.cacheDelete[0].where.id.in), removed);
      assert.equal(app.calls.cacheBackground.length, 0, 'server does not load neighbor chapters for a second prefetch');
      assert.equal(app.calls.google.length, 0, 'cached audio does not trigger background generation');
      assert.equal(app.calls.cacheWrite.length, 0);
    });
  }
});


test('MiMo rejects filtered partial narration instead of presenting it as a full chapter', async () => {
  const { generateMimoAudio } = helper({
    fetch: async () => Response.json({ choices: [{ finish_reason: 'content_filter', message: { audio: { data: wav().toString('base64') } } }] }),
  });
  await assert.rejects(generateMimoAudio('A chapter.', 'Mia'), error => error.status === 502 && /complete text/.test(error.message));
});


test('Oversized Google audio stays playable without a MongoDB cache write', async () => {
  const audio = Buffer.alloc(16 * 1024 * 1024, 1);
  const app = routeHarness({ env: {}, fetch: async () => new Response(audio) });
  const response = await app.get('chapterId=chapter-1&provider=google');
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, audio.length);
  assert.equal(app.calls.cacheWrite.length, 0);
});


test('chapter editing endpoints invalidate audio derived from the old text', async t => {
  for (const file of ['src/app/api/chapters/[id]/content/route.ts', 'src/app/api/books/[id]/chapters/[orderIndex]/route.ts']) {
    await t.test(file, async () => {
      const calls = [];
      class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }
      const route = loadTs(file, { mocks: {
        'next/server': { NextResponse },
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { id: 'user-1' } }) },
        '@/lib/prisma': { prisma: {
          chapter: {
            findFirst: async () => ({ id: 'chapter-1' }),
            update: async args => { calls.push('updated'); return { id: 'chapter-1', content: args.data.content }; },
          },
          chapterAudio: { deleteMany: async args => { calls.push('invalidated'); assert.equal(args.where.chapterId, 'chapter-1'); } },
        } },
      } });
      const response = await route.PATCH(new Request('https://app.test/chapter', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: ['Edited narration.'] }) }), { params: Promise.resolve({ id: 'chapter-1', orderIndex: '0' }) });
      assert.equal(response.status, 200);
      assert.deepEqual(calls, ['updated', 'invalidated']);
    });
  }
});
