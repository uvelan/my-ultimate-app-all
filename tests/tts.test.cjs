const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Transpile the real server code, but never import Next, Prisma, or API SDKs.
// Every test gets its own globals, environment, and module state.
const root = path.resolve(__dirname, '..');
const compressedPremiumAudio = Buffer.from('compressed-premium-mp3');
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
      if (name === 'node:crypto') return require('node:crypto');
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

function geminiAudioResponse() {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: {
    mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.from([1, 0, 2, 0]).toString('base64'),
  } }] } }] });
}

function helper(options = {}) {
  return loadTs('src/lib/mimo-tts.ts', { ...options, env: { MIMO_API_KEY: 'test-key', ...options.env } });
}

function routeHarness({ env = { MIMO_API_KEY: 'test-key' }, content = ['Hello world.'], title = '', cached = null,
  cachedAudio = null, cachedFor = { provider: 'google', voice: 'en', grammar: 'OFF' },
  cacheReadError = false, cacheWriteError = false, compressionError = false, activeWindow = true, chapters = null, fetch, authenticated = true, syncMetadata = { sync: null, audioId: null }, correctedParagraphs = null } = {}) {
  const calls = { chapter: [], question: [], cacheRead: [], cacheWrite: [], cacheKeys: [], compression: [], windowActivate: [], windowRead: [], cacheBackground: [], google: [], syncRead: [] };
  const db = {
    chapter: {
      async findUnique(args) {
        calls.chapter.push(args);
        return chapters ? chapters[args.where.id] || null : { id: 'chapter-1', bookId: 'book-1', order: 2, title, content };
      },
      async findMany(args) {
        calls.cacheBackground.push(args);
        if (!chapters) return [];
        return Object.values(chapters).filter(chapter => chapter.bookId === args.where.bookId && chapter.order >= args.where.order.gte)
          .sort((a, b) => a.order - b.order).slice(0, args.take).map(({ id }) => ({ id }));
      },
    },
    interviewQuestion: {
      async findUnique(args) { calls.question.push(args); return { answer: content.join(' ') }; },
    },
  };
  const cacheWindow = { bookId: 'book-1', currentChapterId: 'chapter-1', windowToken: 'window-1', chapterIds: ['chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5'] };
  const serverCache = {
    async readServerNarrationSync(...args) { calls.syncRead.push(args); return syncMetadata; },
    async activateAudioCacheWindow(...args) { calls.windowActivate.push(args); return cacheWindow; },
    async getAudioCacheWindow(...args) { calls.windowRead.push(args); return activeWindow ? cacheWindow : null; },
    serverAudioCacheKey(...args) { calls.cacheKeys.push(args); return JSON.stringify(args); },
    async readServerAudio(window, chapterId, key) {
      calls.cacheRead.push({ window, chapterId, key });
      if (cacheReadError) throw new Error('Cache unavailable');
      const [identity, provider, voice, grammar] = JSON.parse(key);
      if (provider !== cachedFor.provider || voice !== cachedFor.voice || grammar !== cachedFor.grammar) return null;
      if (Object.hasOwn(cachedFor, 'identity') && JSON.stringify(identity) !== JSON.stringify(cachedFor.identity)) return null;
      return cachedAudio || (cached ? { audio: cached, contentType: 'audio/mpeg', provider: 'google', voice: 'en', fallback: [] } : null);
    },
    async writeServerAudio(window, chapterId, requestedKey, actualKey, audio) {
      calls.cacheWrite.push({ window, chapterId, requestedKey, actualKey, audio });
      if (cacheWriteError) throw new Error('Cache write failed');
    },
  };
  class NextResponse extends Response {
    static json(body, init) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); }
  }
  const mimo = loadTs('src/lib/mimo-tts.ts', { env, fetch });
  const gemini = loadTs('src/lib/gemini-tts.ts', { env, fetch });
  const chapterNarration = loadTs('src/lib/chapter-narration.ts');
  const google = loadTs('src/lib/google-tts.ts', { env, fetch, mocks: {
    'google-tts-api': { getAllAudioUrls(text, options) { calls.google.push({ text, options }); return [{ url: 'https://google.test/audio', shortText: text }]; } },
  } });
  const route = loadTs('src/app/api/tts/route.ts', {
    env, fetch,
    mocks: {
      '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: authenticated, user: { id: 'user-1' } }) },
      'next/server': { NextResponse },
      '@/lib/prisma': { prisma: db },
      '@/lib/mimo-tts': mimo,
      '@/lib/gemini-tts': gemini,
      '@/lib/google-tts': google,
      '@/lib/server-audio-cache': serverCache,
      '@/lib/chapter-narration': chapterNarration,
      '@/lib/audio-compression': { async compressNarrationAudio(audio, contentType, signal) {
        calls.compression.push({ audio, contentType, signal });
        signal?.throwIfAborted();
        if (compressionError) throw new Error('Encoder unavailable');
        return /wav/i.test(contentType) ? { audio: compressedPremiumAudio, contentType: 'audio/mpeg' } : { audio, contentType };
      } },
      '@google/generative-ai': { GoogleGenerativeAI: class {
        constructor() { if (!correctedParagraphs) throw new Error('Unexpected Gemini call'); }
        getGenerativeModel() { return { async generateContent() { return { response: { text: () => JSON.stringify(correctedParagraphs) } }; } }; }
      } },
      openai: class { constructor() { throw new Error('Unexpected OpenAI call'); } },
    },
  });
  return { calls, get: (query = '', init) => route.GET(new Request(`https://app.test/api/tts?${query}`, init)) };
}

test('MiMo exposes the supported voice choices', () => {
  assert.deepEqual(Array.from(helper().MIMO_VOICES), ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean']);
});

test('MiMo measures all WAV data chunks rather than container or metadata byte sizes', async () => {
  let segments;
  const { generateMimoAudio } = helper({ fetch: async () => audioResponse(wav([Buffer.alloc(24000), Buffer.alloc(24000)], { junk: true })) });
  await generateMimoAudio('One second of speech.', 'Mia', undefined, value => { segments = value; });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, 'One second of speech.');
  assert.equal(segments[0].start, 0);
  assert.equal(segments[0].end, 1);
});

test('sync requests read matching metadata without audio, grammar, window changes, or TTS', async () => {
  const sync = { version: 1, title: 'Title', paragraphs: ['Edited body.'], segments: [{ text: 'Title. Edited body.', start: 0, end: 4 }] };
  const app = routeHarness({ title: 'Title', syncMetadata: { sync, audioId: 'a'.repeat(64) } });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Mia&grammarModel=gpt-4o-mini&sync=1&windowStart=invalid&windowOnly=1&bypassCache=1');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sync, audioId: 'a'.repeat(64) });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(app.calls.syncRead.length, 1);
  assert.deepEqual(JSON.parse(app.calls.syncRead[0][2]), [{ narrationVersion: 2, title: 'Title', content: ['Hello world.'] }, 'xiaomi', 'Mia', 'gpt-4o-mini']);
  for (const key of ['windowActivate', 'windowRead', 'cacheRead', 'cacheWrite', 'compression', 'google']) assert.equal(app.calls[key].length, 0, key);
});

test('sync lookup remains authenticated and returns null for legacy metadata', async () => {
  const blocked = routeHarness({ authenticated: false });
  assert.equal((await blocked.get('chapterId=chapter-1&sync=1')).status, 401);
  assert.equal(blocked.calls.chapter.length, 0);
  const app = routeHarness();
  assert.deepEqual(await (await app.get('chapterId=chapter-1&sync=1')).json(), { sync: null, audioId: null });
  assert.equal(app.calls.cacheWrite.length, 0);
});

test('successful fallback persists actual narration timing and hashes compressed response bytes', async () => {
  const app = routeHarness({ title: '<b>Chapter One</b>', content: ['<p>First paragraph.</p>', '**Second paragraph.**'],
    env: { MIMO_API_KEY: 'key' }, fetch: async () => audioResponse(wav([Buffer.alloc(48000)])) });
  const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Kore');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Audio-ID'), require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
  const sync = app.calls.cacheWrite[0].audio.narrationSync;
  assert.equal(sync.version, 1);
  assert.equal(sync.title, 'Chapter One');
  assert.deepEqual(Array.from(sync.paragraphs), ['First paragraph.', 'Second paragraph.']);
  assert.equal(sync.segments.length, 1);
  assert.match(sync.segments[0].text, /Chapter One/);
  assert.equal(sync.segments[0].end, 1);
});

test('synchronization stores corrected paragraphs and spoken text rather than the uncorrected source', async () => {
  const app = routeHarness({ title: '# The Title', content: ['She walk home.', 'He wait.'],
    correctedParagraphs: ['She walks home.', 'He waits.'], env: { GEMINI_API_KEY: 'key' }, fetch: async () => geminiAudioResponse() });
  const response = await app.get('chapterId=chapter-1&provider=gemini&grammarModel=gemini-2.5-flash');
  assert.equal(response.status, 200);
  const sync = app.calls.cacheWrite[0].audio.narrationSync;
  assert.deepEqual(Array.from(sync.paragraphs), ['She walks home.', 'He waits.']);
  assert.equal(sync.title, 'The Title');
  assert.match(sync.segments[0].text, /The Title/);
  assert.match(sync.segments[0].text, /She walks home\. He waits\./);
  assert.equal(sync.segments[0].start, 0);
  assert.equal(sync.segments[0].end, 2 / 24000);
});

test('cached binary responses also carry the digest of their actual bytes', async () => {
  const bytes = Buffer.from('existing cached mp3');
  const app = routeHarness({ cached: bytes });
  const response = await app.get('chapterId=chapter-1&provider=google');
  assert.equal(response.headers.get('X-TTS-Audio-ID'), require('node:crypto').createHash('sha256').update(bytes).digest('hex'));
  assert.equal(app.calls.syncRead.length, 0);
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
  const sentence = 'A reader says caf\u00e9, \u0928\u092e\u0938\u094d\u0924\u0947, and hello \u{1f600}. ';
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

test('provider and premium voice validation happen before content lookup or fallback', async t => {
  for (const query of ['provider=unknown', 'provider=xiaomi&voice=en', 'provider=xiaomi&voice=gemini-3.1-kore', 'provider=gemini&voice=Mia', 'provider=gemini&voice=unknown', 'provider=google&voice=Kore']) {
    await t.test(query, async () => {
      const app = routeHarness();
      assert.equal((await app.get(`chapterId=chapter-1&${query}`)).status, 400);
      assert.equal(app.calls.chapter.length, 0);
      assert.equal(app.calls.cacheRead.length, 0);
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('missing MiMo credentials fall back to cached English Google audio', async () => {
  const cached = Buffer.from('cached-google-mp3');
  const app = routeHarness({ env: {}, cached });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Mia');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-TTS-Provider'), 'google');
  assert.equal(response.headers.get('X-TTS-Voice'), 'en');
  assert.equal(response.headers.get('X-TTS-Fallback'), 'xiaomi');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), cached);
  assert.equal(app.calls.chapter.length, 1);
  assert.equal(app.calls.cacheRead.length, 2);
  assert.equal(app.calls.google.length, 0);
  assert.equal(JSON.parse(app.calls.cacheWrite[0].requestedKey)[1], 'xiaomi');
  assert.equal(JSON.parse(app.calls.cacheWrite[0].actualKey)[1], 'google');
});

test('server cache hits return premium and fallback audio before grammar correction or paid generation', async t => {
  for (const [requested, actual] of [
    [{ provider: 'gemini', voice: 'Puck' }, { provider: 'gemini', voice: 'Puck', fallback: [] }],
    [{ provider: 'xiaomi', voice: 'Dean' }, { provider: 'xiaomi', voice: 'Dean', fallback: [] }],
    [{ provider: 'gemini', voice: 'Kore' }, { provider: 'xiaomi', voice: 'Mia', fallback: ['gemini'] }],
  ]) {
    await t.test(`${requested.provider}/${requested.voice} to ${actual.provider}/${actual.voice}`, async () => {
      const content = ['Original **chapter** text.'];
      const audio = compressedPremiumAudio;
      const app = routeHarness({ env: {}, content,
        cachedFor: { ...requested, grammar: 'gpt-4o-mini' },
        cachedAudio: { audio, contentType: 'audio/mpeg', ...actual },
      });
      const response = await app.get(`chapterId=chapter-1&provider=${requested.provider}&voice=${requested.voice}&grammarModel=gpt-4o-mini`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('X-TTS-Cache'), 'database');
      assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
      assert.equal(response.headers.get('Content-Length'), String(audio.length));
      assert.equal(response.headers.get('X-TTS-Provider'), actual.provider);
      assert.equal(response.headers.get('X-TTS-Voice'), actual.voice);
      assert.equal(response.headers.get('X-TTS-Fallback'), actual.fallback.length ? actual.fallback.join(',') : null);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
      assert.deepEqual(JSON.parse(JSON.stringify(app.calls.cacheKeys[0])), [{ title: '', content, narrationVersion: 2 }, requested.provider, requested.voice, 'gpt-4o-mini']);
      assert.equal(app.calls.cacheWrite.length, 0);
      assert.equal(app.calls.google.length, 0);
      assert.equal(app.calls.compression.length, 0, 'server cache reads already return their stored format');
    });
  }
});

test('window-only activation prepares server ownership without generating or reading audio', async () => {
  const app = routeHarness({ env: {} });
  const response = await app.get('chapterId=chapter-1&windowOnly=1&grammarModel=gpt-4o-mini');
  assert.equal(response.status, 204);
  assert.equal(app.calls.windowActivate.length, 1);
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.cacheWrite.length, 0);
  assert.equal(app.calls.google.length, 0);
});

test('manual retry bypasses stored audio and publishes the fresh result', async () => {
  const app = routeHarness({ env: {}, cached: Buffer.from('broken-old-audio'), fetch: async () => new Response(Buffer.from('fresh-audio')) });
  const response = await app.get('chapterId=chapter-1&bypassCache=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-TTS-Cache'), 'generated');
  assert.equal(await response.text(), 'fresh-audio');
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.cacheWrite.length, 1);
});

test('server storage failures do not prevent successful chapter playback', async () => {
  const app = routeHarness({ env: {}, cacheReadError: true, cacheWriteError: true, fetch: async () => new Response(Buffer.from('playable')) });
  const response = await app.get('chapterId=chapter-1');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'playable');
  assert.equal(app.calls.cacheRead.length, 1);
  assert.equal(app.calls.cacheWrite.length, 1);
});

test('a failed cache write still serves newly compressed premium audio without another provider call', async () => {
  let requests = 0;
  const app = routeHarness({ cacheWriteError: true, fetch: async () => { requests++; return audioResponse(); } });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Mia');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Content-Length'), String(compressedPremiumAudio.length));
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Fallback'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressedPremiumAudio);
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.equal(app.calls.compression.length, 1);
  assert.equal(requests, 1);
  assert.equal(app.calls.google.length, 0);
});

test('an encoder failure preserves playable original audio without restarting speech generation', async () => {
  let requests = 0;
  const app = routeHarness({ compressionError: true, fetch: async () => { requests++; return audioResponse(); } });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Mia');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/wav');
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Fallback'), null);
  assert.deepEqual(readWav(Buffer.from(await response.arrayBuffer())).data, Buffer.from([1, 0, 2, 0]));
  assert.equal(requests, 1);
  assert.equal(app.calls.google.length, 0);
});

test('failed alias persistence still plays an already cached fallback without a second paid request', async () => {
  const urls = [];
  const bytes = compressedPremiumAudio;
  const app = routeHarness({
    env: { GEMINI_API_KEY: 'gemini-key' }, cacheWriteError: true,
    cachedFor: { provider: 'xiaomi', voice: 'Mia', grammar: 'OFF' },
    cachedAudio: { audio: bytes, contentType: 'audio/mpeg', provider: 'xiaomi', voice: 'Mia', fallback: [] },
    fetch: async url => { urls.push(url); return new Response(null, { status: 429 }); },
  });
  const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Kore');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-TTS-Cache'), 'database');
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Fallback'), 'gemini');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('generativelanguage'));
  assert.equal(app.calls.cacheRead.length, 2);
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.equal(app.calls.google.length, 0);
});

test('an obsolete prefetch never activates or writes into another active server window', async () => {
  const app = routeHarness({ env: {}, activeWindow: false, fetch: async () => new Response(Buffer.from('uncached-audio')) });
  const response = await app.get('chapterId=chapter-1&prefetch=1&windowStart=old-chapter');
  assert.equal(response.status, 200);
  assert.equal(app.calls.windowActivate.length, 0);
  assert.deepEqual(app.calls.windowRead, [['book-1', 'old-chapter']]);
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.cacheWrite.length, 0);
  assert.equal(app.calls.chapter.length, 1, 'stale prefetch does not try to activate its supplied anchor');
});

test('middle chapter playback preserves its anchor while later and backward navigation activate the requested anchor', async t => {
  const id = chapter => String(chapter).padStart(24, '0');
  const chapters = Object.fromEntries([1, 2, 3].map(chapter => [id(chapter), {
    id: id(chapter), bookId: 'book-1', order: chapter - 1, content: [`Chapter ${chapter}.`],
  }]));
  for (const [name, chapter, anchor, windowOnly] of [
    ['chapter 2 retains the chapter 1 anchor', 2, 1, false],
    ['chapter 3 starts the chapter 3 window', 3, 3, false],
    ['backward chapter 2 resets its own anchor', 2, null, false],
    ['window-only promotion preserves chapter 1 anchor', 2, 1, true],
  ]) {
    await t.test(name, async () => {
      const app = routeHarness({ env: {}, chapters, cached: Buffer.from('cached') });
      const query = `chapterId=${id(chapter)}${anchor ? `&windowStart=${id(anchor)}` : ''}${windowOnly ? '&windowOnly=1' : ''}`;
      const response = await app.get(query);
      assert.equal(response.status, windowOnly ? 204 : 200);
      assert.equal(app.calls.windowActivate.length, 1);
      const expectedAnchor = anchor || chapter;
      assert.deepEqual(app.calls.windowActivate[0].slice(0, 3), ['book-1', id(expectedAnchor), expectedAnchor - 1]);
      assert.equal(app.calls.windowRead.length, 0);
      if (!windowOnly) assert.equal(app.calls.cacheRead[0].chapterId, id(chapter), 'audio lookup uses current chapter even when window anchor differs');
      else assert.equal(app.calls.cacheRead.length, 0);
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('invalid, missing, cross-book, and out-of-range anchors are rejected before cache activation', async t => {
  const id = chapter => String(chapter).padStart(24, '0');
  const chapters = Object.fromEntries([1, 2, 3, 4].map(chapter => [id(chapter), {
    id: id(chapter), bookId: 'book-1', order: chapter - 1, content: ['Text.'],
  }]));
  chapters[id(9)] = { id: id(9), bookId: 'other-book', order: 1, content: ['Other book.'] };
  for (const [name, anchor] of [
    ['malformed', 'invalid-id'], ['missing', id(8)], ['cross-book', id(9)],
    ['too far behind current', id(1)], ['ahead of current', id(4)],
  ]) {
    await t.test(name, async () => {
      const app = routeHarness({ env: {}, chapters });
      const response = await app.get(`chapterId=${id(3)}&windowStart=${anchor}&windowOnly=1`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Invalid audio cache window.');
      assert.equal(app.calls.windowActivate.length, 0);
      assert.equal(app.calls.windowRead.length, 0);
      assert.equal(app.calls.cacheRead.length, 0);
      assert.equal(app.calls.cacheWrite.length, 0);
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('anchor validation uses adjacent chapter positions when stored chapter orders have gaps', async () => {
  const id = chapter => String(chapter).padStart(24, '0');
  const chapters = Object.fromEntries([10, 30, 100].map((order, index) => [id(index + 1), {
    id: id(index + 1), bookId: 'book-1', order, content: ['Chapter text.'],
  }]));
  const adjacent = routeHarness({ env: {}, chapters, cached: Buffer.from('cached') });
  const response = await adjacent.get(`chapterId=${id(2)}&windowStart=${id(1)}`);
  assert.equal(response.status, 200, 'the next actual chapter may have a nonconsecutive order');
  assert.deepEqual(adjacent.calls.windowActivate[0].slice(0, 3), ['book-1', id(1), 10]);
  const distant = routeHarness({ env: {}, chapters });
  assert.equal((await distant.get(`chapterId=${id(3)}&windowStart=${id(1)}&windowOnly=1`)).status, 400);
  assert.equal(distant.calls.windowActivate.length, 0, 'the third actual chapter must start a new window');
});

test('Xiaomi cleans narration and stores and serves compressed audio with its original voice metadata', async () => {
  const requests = [];
  const app = routeHarness({
    cached: Buffer.from('old-mp3'),
    content: ['# **Hello** <b>reader</b>. [Visit](https://example.test) `hidden` ![image](pic.png)', '```js\nsecret()\n``` End.'],
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return audioResponse(); },
  });
  const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Chloe');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Voice'), 'Chloe');
  assert.equal(response.headers.get('X-TTS-Fallback'), null);
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.ok(response.body, 'audio is returned as a readable response body');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressedPremiumAudio);
  assert.equal(requests[0].body.messages.find(message => message.role === 'assistant').content, 'Hello reader . Visit End.');
  assert.equal(app.calls.google.length, 0);
  assert.equal(app.calls.cacheRead.length, 1);
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.equal(app.calls.cacheWrite[0].audio.contentType, 'audio/mpeg');
  assert.deepEqual(app.calls.cacheWrite[0].audio.audio, compressedPremiumAudio);
  assert.equal(app.calls.compression.length, 1);
  assert.deepEqual(readWav(app.calls.compression[0].audio).data, Buffer.from([1, 0, 2, 0]));
  assert.equal(app.calls.windowActivate.length, 1);
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
  assert.equal(app.calls.cacheRead.length, 0);
  assert.equal(app.calls.cacheWrite.length, 0);
});

test('every speech provider reads the cleaned chapter title once before the body', async t => {
  for (const provider of ['gemini', 'xiaomi', 'google']) {
    await t.test(provider, async () => {
      const spoken = [];
      const app = routeHarness({
        title: '# **<i>Chapter 7:</i> The Return**', content: ['The gates opened. Birds sang.'],
        env: { GEMINI_API_KEY: 'gemini-key', MIMO_API_KEY: 'mimo-key' },
        fetch: async (url, options) => {
          if (url.includes('generativelanguage')) {
            spoken.push(JSON.parse(options.body).contents[0].parts[0].text);
            return geminiAudioResponse();
          }
          if (url.includes('xiaomimimo')) {
            spoken.push(JSON.parse(options.body).messages[0].content);
            return audioResponse();
          }
          return new Response(Buffer.from('google-mp3'));
        },
      });
      const response = await app.get(`chapterId=chapter-1&provider=${provider}`);
      assert.equal(response.status, 200);
      if (provider === 'google') spoken.push(app.calls.google[0].text);
      assert.equal(spoken.length, 1);
      assert.equal(spoken[0], 'Chapter 7: The Return. The gates opened. Birds sang.');
      assert.equal(spoken[0].split('Chapter 7: The Return').length - 1, 1);
    });
  }
});

test('an existing title at the start of narration is not repeated after case and punctuation normalization', async t => {
  for (const content of [
    ['# CHAPTER 7 - THE RETURN!', 'The gates opened.'],
    ['CHAPTER 7 - THE RETURN! The gates opened.'],
  ]) {
    await t.test(content.length === 2 ? 'title paragraph' : 'title and body in one paragraph', async () => {
      const app = routeHarness({ title: 'Chapter 7: The Return', content, env: {}, fetch: async () => new Response(Buffer.from('mp3')) });
      assert.equal((await app.get('chapterId=chapter-1')).status, 200);
      assert.equal(app.calls.google[0].text, 'CHAPTER 7 - THE RETURN! The gates opened.');
    });
  }
  const distinct = routeHarness({ title: 'Chapter 7', content: ['Chapter 70 begins.'], env: {}, fetch: async () => new Response(Buffer.from('mp3')) });
  assert.equal((await distinct.get('chapterId=chapter-1')).status, 200);
  assert.equal(distinct.calls.google[0].text, 'Chapter 7. Chapter 70 begins.', 'a prefix inside another chapter number is not a duplicate title');
});

test('a stored title does not turn an empty chapter into a title-only audio request', async t => {
  for (const provider of ['gemini', 'xiaomi', 'google']) {
    await t.test(provider, async () => {
      const app = routeHarness({ title: 'Chapter 7: The Return', content: ['<span></span>', '```hidden code```', '   '] });
      const response = await app.get(`chapterId=chapter-1&provider=${provider}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'No text is available to read.');
      assert.equal(app.calls.google.length, 0);
      assert.equal(app.calls.cacheWrite.length, 0);
      assert.equal(app.calls.compression.length, 0);
    });
  }
});

test('question narration remains its field content without chapter title narration', async () => {
  let spoken;
  const app = routeHarness({ title: 'Unrelated chapter title', content: ['An interview answer.'], fetch: async (_url, options) => {
    spoken = JSON.parse(options.body).messages[0].content;
    return audioResponse();
  } });
  assert.equal((await app.get('questionId=question-1&questionField=answer&provider=xiaomi')).status, 200);
  assert.equal(spoken, 'An interview answer.');
  assert.equal(app.calls.cacheKeys.length, 0);
});

test('all fallback providers receive the title and all cache aliases use the title-aware versioned identity', async () => {
  const title = 'Chapter 7: The Return';
  const content = ['The gates opened.'];
  const paidNarration = [];
  const app = routeHarness({ title, content, env: { GEMINI_API_KEY: 'gemini-key', MIMO_API_KEY: 'mimo-key' }, fetch: async (url, options) => {
    if (url === 'https://google.test/audio') return new Response(Buffer.from('mp3'));
    const body = JSON.parse(options.body);
    paidNarration.push(body.contents ? body.contents[0].parts[0].text : body.messages[0].content);
    return new Response(null, { status: 429 });
  } });
  const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Kore');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-TTS-Fallback'), 'gemini,xiaomi');
  assert.deepEqual([...paidNarration, app.calls.google[0].text], Array(3).fill('Chapter 7: The Return. The gates opened.'));
  assert.equal(app.calls.cacheKeys.length, 4, 'original, fallback-stage, and saved actual keys all use the same narration identity');
  for (const [identity] of app.calls.cacheKeys) {
    assert.deepEqual(JSON.parse(JSON.stringify(identity)), { narrationVersion: 2, title, content });
  }
  const saved = app.calls.cacheWrite[0];
  assert.deepEqual(JSON.parse(saved.requestedKey)[0], { narrationVersion: 2, title, content });
  assert.deepEqual(JSON.parse(saved.actualKey)[0], { narrationVersion: 2, title, content });
});

test('body-only legacy keys and a previous title cannot serve cached narration after a title change', async t => {
  const content = ['The same chapter body.'];
  const title = 'New Chapter Title';
  for (const oldIdentity of [content, { narrationVersion: 2, title: 'Old Chapter Title', content }]) {
    await t.test(Array.isArray(oldIdentity) ? 'body-only legacy key' : 'changed title', async () => {
      const app = routeHarness({ title, content, env: {}, cached: Buffer.from('old-audio'),
        cachedFor: { provider: 'google', voice: 'en', grammar: 'OFF', identity: oldIdentity },
        fetch: async () => new Response(Buffer.from('new-audio')),
      });
      const response = await app.get('chapterId=chapter-1');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('X-TTS-Cache'), 'generated');
      assert.equal(await response.text(), 'new-audio');
      assert.equal(app.calls.google[0].text, 'New Chapter Title. The same chapter body.');
      for (const [identity] of app.calls.cacheKeys) assert.deepEqual(JSON.parse(JSON.stringify(identity)), { narrationVersion: 2, title, content });
      assert.equal(app.calls.cacheWrite.length, 1);
    });
  }
});

test('Gemini uses its selected voice and compresses its WAV before storage and response', async () => {
  const requests = [];
  const app = routeHarness({ env: { GEMINI_API_KEY: 'gemini-key' }, cached: Buffer.from('unrelated-google-mp3'), fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return geminiAudioResponse();
  } });
  const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Charon');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('X-TTS-Provider'), 'gemini');
  assert.equal(response.headers.get('X-TTS-Voice'), 'Charon');
  assert.equal(response.headers.get('X-TTS-Fallback'), null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressedPremiumAudio);
  assert.equal(app.calls.cacheRead.length, 1);
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.equal(app.calls.cacheWrite[0].audio.contentType, 'audio/mpeg');
  assert.deepEqual(app.calls.cacheWrite[0].audio.audio, compressedPremiumAudio);
  assert.equal(JSON.parse(app.calls.cacheWrite[0].actualKey)[1], 'gemini');
  assert.equal(app.calls.compression.length, 1);
  assert.equal(app.calls.google.length, 0);
});

test('Gemini quota failure falls back to MiMo with its own default voice', async () => {
  const requests = [];
  const app = routeHarness({ env: { GEMINI_API_KEY: 'gemini-key', MIMO_API_KEY: 'mimo-key' }, fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return url.includes('generativelanguage') ? new Response('private quota', { status: 429 }) : audioResponse();
  } });
  const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Fenrir');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('X-TTS-Provider'), 'xiaomi');
  assert.equal(response.headers.get('X-TTS-Voice'), 'Mia');
  assert.equal(response.headers.get('X-TTS-Fallback'), 'gemini');
  assert.equal(requests.length, 2);
  assert.ok(requests[0].url.includes('generativelanguage'));
  assert.ok(requests[1].url.includes('xiaomimimo'));
  assert.equal(requests[1].body.audio.voice, 'Mia');
  assert.equal(app.calls.google.length, 0);
  assert.equal(app.calls.cacheRead.length, 2);
  assert.equal(app.calls.cacheWrite.length, 1);
});

test('Gemini and MiMo failures reach free English Google audio in order', async t => {
  for (const failure of ['missing credentials', 'quota', 'malformed audio']) {
    await t.test(failure, async () => {
      const urls = [];
      const app = routeHarness({
        env: failure === 'missing credentials' ? {} : { GEMINI_API_KEY: 'gemini-key', MIMO_API_KEY: 'mimo-key' },
        fetch: async url => {
          urls.push(url);
          if (url === 'https://google.test/audio') return new Response('free-google-mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
          return failure === 'quota' ? new Response(null, { status: 429 }) : Response.json({});
        },
      });
      const response = await app.get('chapterId=chapter-1&provider=gemini&voice=Puck');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(response.headers.get('X-TTS-Provider'), 'google');
      assert.equal(response.headers.get('X-TTS-Voice'), 'en');
      assert.equal(response.headers.get('X-TTS-Fallback'), 'gemini,xiaomi');
      assert.equal(await response.text(), 'free-google-mp3');
      assert.equal(app.calls.google.length, 1);
      assert.equal(app.calls.google[0].options.lang, 'en');
      assert.equal(app.calls.cacheWrite.length, 1);
      if (failure === 'missing credentials') assert.deepEqual(urls, ['https://google.test/audio']);
      else {
        assert.equal(urls.length, 3);
        assert.ok(urls[0].includes('generativelanguage'));
        assert.ok(urls[1].includes('xiaomimimo'));
        assert.equal(urls[2], 'https://google.test/audio');
      }
    });
  }
});

test('legacy Gemini Google voices use the Gemini chain and report normalized metadata', async t => {
  for (const voice of ['gemini-3.1-kore', 'gemini-2.5-kore']) {
    await t.test(voice, async () => {
      let body;
      const app = routeHarness({ env: { GEMINI_API_KEY: 'gemini-key' }, fetch: async (_url, options) => { body = JSON.parse(options.body); return geminiAudioResponse(); } });
      const response = await app.get(`chapterId=chapter-1&provider=google&voice=${voice}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('X-TTS-Provider'), 'gemini');
      assert.equal(response.headers.get('X-TTS-Voice'), 'Kore');
      assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
      assert.equal(app.calls.google.length, 0);
    });
  }
});

test('cancelling premium generation never starts a fallback provider', async t => {
  for (const provider of ['gemini', 'xiaomi']) {
    await t.test(provider, async () => {
      const controller = new AbortController();
      const urls = [];
      const app = routeHarness({ env: { GEMINI_API_KEY: 'gemini-key', MIMO_API_KEY: 'mimo-key' }, fetch: async url => {
        urls.push(url);
        controller.abort();
        throw controller.signal.reason;
      } });
      const response = await app.get(`chapterId=chapter-1&provider=${provider}`, { signal: controller.signal });
      assert.notEqual(response.status, 200);
      assert.equal(urls.length, 1);
      assert.ok(urls[0].includes(provider === 'gemini' ? 'generativelanguage' : 'xiaomimimo'));
      assert.equal(app.calls.google.length, 0);
      assert.equal(app.calls.cacheRead.length, 1);
      assert.equal(app.calls.cacheWrite.length, 0);
    });
  }
});

test('Xiaomi operational failures fall back to English Google audio and report the actual provider', async t => {
  for (const [name, failedResponse] of [
    ['upstream failure', async () => new Response('private upstream failure', { status: 500 })],
    ['malformed audio', async () => Response.json({ choices: [] })],
    ['provider rate limit', async () => new Response('private quota details', { status: 429 })],
  ]) {
    await t.test(name, async () => {
      const urls = [];
      const app = routeHarness({ fetch: async url => {
        urls.push(url);
        return url === 'https://google.test/audio' ? new Response('google-mp3', { headers: { 'Content-Type': 'audio/mpeg' } }) : failedResponse();
      } });
      const response = await app.get('chapterId=chapter-1&provider=xiaomi&voice=Dean');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(response.headers.get('X-TTS-Provider'), 'google');
      assert.equal(response.headers.get('X-TTS-Voice'), 'en');
      assert.equal(response.headers.get('X-TTS-Fallback'), 'xiaomi');
      assert.equal(await response.text(), 'google-mp3');
      assert.equal(app.calls.google.length, 1);
      assert.equal(app.calls.google[0].options.lang, 'en');
      assert.equal(app.calls.cacheRead.length, 2);
      assert.equal(app.calls.cacheWrite.length, 1);
      assert.equal(urls.length, 2);
    });
  }
});

test('default and explicit Google requests retain the existing English MP3 chapter cache', async t => {
  for (const provider of ['', '&provider=google']) {
    await t.test(provider || 'default provider', async () => {
      const cached = Buffer.from('cached-mp3-audio');
      const app = routeHarness({ env: {}, cached });
      const response = await app.get(`chapterId=chapter-1${provider}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'audio/mpeg');
      assert.equal(response.headers.get('X-TTS-Provider'), 'google');
      assert.equal(response.headers.get('X-TTS-Voice'), 'en');
      assert.equal(response.headers.get('X-TTS-Fallback'), null);
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
  assert.equal(response.headers.get('Content-Length'), String(mp3.length));
  assert.deepEqual(urls, ['https://google.test/audio']);
  assert.equal(app.calls.google.length, 1);
  assert.equal(app.calls.google[0].options.lang, 'en');
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.deepEqual(Buffer.from(app.calls.cacheWrite[0].audio.audio), mp3);
  assert.equal(app.calls.compression.length, 1);
  assert.equal(app.calls.compression[0].contentType, 'audio/mpeg');
  assert.deepEqual(app.calls.compression[0].audio, mp3, 'existing Google MP3 bytes pass through unchanged');
});

test('foreground requests activate the server window while prefetch only reads its current window', async t => {
  for (const [name, query, prefetch] of [
    ['foreground chapter', '', false],
    ['prefetched chapter', '&prefetch=1&windowStart=chapter-current', true],
  ]) {
    await t.test(name, async () => {
      const app = routeHarness({ env: {}, cached: Buffer.from('cached-mp3') });
      const response = await app.get(`chapterId=chapter-1&provider=google${query}`);
      assert.equal(response.status, 200);
      assert.equal(app.calls.windowActivate.length, prefetch ? 0 : 1);
      assert.equal(app.calls.windowRead.length, prefetch ? 1 : 0);
      if (prefetch) assert.deepEqual(app.calls.windowRead[0], ['book-1', 'chapter-current']);
      else assert.deepEqual(app.calls.windowActivate[0].slice(0, 3), ['book-1', 'chapter-1', 2]);
      assert.equal(app.calls.cacheBackground.length, 0, 'the route leaves neighbor preparation to the browser');
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


test('large Google audio remains playable and is offered to the chunked server cache', async () => {
  const audio = Buffer.alloc(16 * 1024 * 1024, 1);
  const app = routeHarness({ env: {}, fetch: async () => new Response(audio) });
  const response = await app.get('chapterId=chapter-1&provider=google');
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, audio.length);
  assert.equal(app.calls.cacheWrite.length, 1);
  assert.equal(app.calls.cacheWrite[0].audio.audio.length, audio.length);
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
