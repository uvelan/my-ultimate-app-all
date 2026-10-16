const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadGemini({ env = {}, fetch = () => { throw new Error('Unexpected network request'); }, abortSignal = AbortSignal } = {}) {
  const filename = path.resolve(__dirname, '../src/lib/gemini-tts.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({
    module, exports: module.exports, Buffer, Uint8Array, AbortController, AbortSignal: abortSignal,
    process: { env: { GEMINI_API_KEY: 'test-gemini-key', ...env } }, fetch,
  });
  return module.exports;
}

function audioResponse(bytes = Buffer.from([1, 0, 2, 0]), mimeType = 'audio/L16;codec=pcm;rate=24000', finishReason = 'STOP') {
  return Response.json({ candidates: [{ finishReason, content: { parts: [
    { text: 'audio follows' }, { inlineData: { mimeType, data: bytes.toString('base64') } },
  ] } }] });
}

function readWav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt16LE(20), 1, 'PCM format');
  assert.equal(bytes.readUInt16LE(22), 1, 'mono');
  assert.equal(bytes.readUInt16LE(34), 16, '16-bit audio');
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  return { pcm: bytes.subarray(44), rate: bytes.readUInt32LE(24) };
}

test('Gemini exposes its supported voices and sends narration through generateContent', async () => {
  const requests = [];
  const timeoutBudgets = [];
  const controller = new AbortController();
  const helper = loadGemini({
    abortSignal: { any: AbortSignal.any, timeout(ms) { timeoutBudgets.push(ms); return new AbortController().signal; } },
    fetch: async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return audioResponse(); },
  });
  assert.deepEqual(Array.from(helper.GEMINI_VOICES), ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);
  const result = readWav(await helper.generateGeminiAudio('Read this sentence.', 'Zephyr', controller.signal));
  assert.equal(requests.length, 1);
  const { url, options, body } = requests[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
  assert.equal(options.method, 'POST');
  assert.equal(new Headers(options.headers).get('x-goog-api-key'), 'test-gemini-key');
  assert.equal(options.cache, 'no-store');
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.contents[0].parts[0].text, 'Read this sentence.');
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Zephyr');
  assert.deepEqual(timeoutBudgets, [60_000], 'one overall timeout budget');
  assert.equal(result.rate, 24000);
  assert.deepEqual(result.pcm, Buffer.from([1, 0, 2, 0]));
  controller.abort();
  assert.equal(options.signal.aborted, true);
});

test('long Unicode narration stays intact and PCM is joined in source order despite completion order', async () => {
  const sentence = 'Hello caf\u00e9 and \u{1f600}. ';
  const text = sentence.repeat(250).trim();
  const spoken = [];
  const expectedAudio = [];
  let active = 0;
  let peak = 0;
  const helper = loadGemini({ fetch: async (_url, options) => {
    const body = JSON.parse(options.body);
    spoken.push(body.contents[0].parts[0].text);
    const index = spoken.length;
    const bytes = Buffer.from([index, 0]);
    expectedAudio.push(bytes);
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, index === 1 ? 15 : 0));
    active--;
    return audioResponse(bytes);
  } });
  const result = readWav(await helper.generateGeminiAudio(text, 'Kore'));
  assert.ok(spoken.length > 1);
  assert.ok(peak <= 2, 'large chapters do not produce an unbounded API burst');
  assert.equal(spoken.join(' ').replace(/\s+/g, ' '), text);
  for (const chunk of spoken) {
    assert.ok(Array.from(chunk).length <= 1800);
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk));
    assert.ok(chunk.endsWith('.'), 'available sentence boundaries are respected');
  }
  assert.deepEqual(result.pcm, Buffer.concat(expectedAudio));
});

test('a configured Gemini TTS model is used', async () => {
  let requestUrl;
  const helper = loadGemini({ env: { GEMINI_TTS_MODEL: 'configured-preview' }, fetch: async url => { requestUrl = url; return audioResponse(); } });
  await helper.generateGeminiAudio('Hello.', 'Puck');
  assert.ok(requestUrl.endsWith('/configured-preview:generateContent'));
});

test('missing credentials, invalid voices, and empty text fail without network requests', async t => {
  for (const [name, env, text, voice, status] of [
    ['missing credentials', { GEMINI_API_KEY: undefined }, 'Hello.', 'Kore', 503],
    ['invalid voice', {}, 'Hello.', 'Mia', 400],
    ['empty narration', {}, '   ', 'Kore', 400],
  ]) {
    await t.test(name, async () => {
      const helper = loadGemini({ env });
      await assert.rejects(helper.generateGeminiAudio(text, voice), error => error.status === status);
    });
  }
});

test('provider failures and unsafe partial or malformed audio are rejected', async t => {
  for (const [name, response, status] of [
    ['quota', () => new Response('secret upstream quota', { status: 429 }), 429],
    ['upstream failure', () => new Response('secret provider failure', { status: 500 }), 502],
    ['missing audio', () => Response.json({ candidates: [] }), 502],
    ['truncated narration', () => audioResponse(undefined, undefined, 'MAX_TOKENS'), 502],
    ['filtered narration', () => audioResponse(undefined, undefined, 'SAFETY'), 502],
    ['unsupported format', () => audioResponse(undefined, 'audio/mpeg'), 502],
    ['odd PCM byte count', () => audioResponse(Buffer.from([1])), 502],
    ['invalid sample rate', () => audioResponse(undefined, 'audio/L16;rate=999999'), 502],
    ['invalid base64', () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16', data: '%%%!' } }] } }] }), 502],
  ]) {
    await t.test(name, async () => {
      const helper = loadGemini({ fetch: async () => response() });
      await assert.rejects(helper.generateGeminiAudio('Hello.', 'Charon'), error => {
        assert.equal(error.status, status);
        assert.ok(!error.message.includes('secret'));
        return true;
      });
    });
  }
});

test('chunks with different sample rates cannot produce a misleading combined WAV', async () => {
  let index = 0;
  const helper = loadGemini({ fetch: async () => audioResponse(undefined, `audio/L16;rate=${++index === 1 ? 24000 : 16000}`) });
  await assert.rejects(helper.generateGeminiAudio('A full sentence. '.repeat(220), 'Fenrir'), error => error.status === 502);
});

test('pre-aborted requests never call Gemini', async () => {
  const controller = new AbortController();
  controller.abort();
  const helper = loadGemini();
  await assert.rejects(helper.generateGeminiAudio('Hello.', 'Kore', controller.signal), error => error.name === 'AbortError');
});
