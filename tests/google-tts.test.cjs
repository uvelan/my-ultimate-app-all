const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load({ count = 1, fetch, timers = false } = {}) {
  const filename = path.resolve(__dirname, '../src/lib/google-tts.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({
    module, exports: module.exports, Buffer, AbortController, AbortSignal,
    setTimeout: timers ? (fn) => setTimeout(fn, 0) : setTimeout, clearTimeout,
    fetch, require: (name) => {
      assert.equal(name, 'google-tts-api');
      return { getAllAudioUrls: () => Array.from({ length: count }, (_, i) => ({ url: String(i) })) };
    },
  });
  return module.exports;
}
const audio = value => new Response(Buffer.from([value]), { headers: { 'Content-Type': 'audio/mpeg' } });

test('Google bounds long-chapter concurrency and preserves chunk order', async () => {
  let running = 0, max = 0;
  const helper = load({ count: 20, fetch: async url => {
    running++; max = Math.max(max, running);
    await new Promise(resolve => setTimeout(resolve, (20 - Number(url)) % 4));
    running--; return audio(Number(url));
  } });
  const result = await helper.generateGoogleAudio('chapter', 'en');
  assert.equal(max, 4);
  assert.deepEqual(result, Buffer.from(Array.from({ length: 20 }, (_, i) => i)));
});

test('Google retries transient HTTP, transport and empty-body failures', async () => {
  for (const failure of [() => new Response(null, { status: 429 }), () => { throw new TypeError('network'); }, () => new Response(null)]) {
    let calls = 0;
    const helper = load({ timers: true, fetch: async () => ++calls < 3 ? failure() : audio(9) });
    assert.deepEqual(await helper.generateGoogleAudio('chapter', 'en'), Buffer.from([9]));
    assert.equal(calls, 3);
  }
});

test('Google rejects permanent HTTP failures without retry', async () => {
  let calls = 0;
  const helper = load({ timers: true, fetch: async () => { calls++; return new Response(null, { status: 400 }); } });
  await assert.rejects(helper.generateGoogleAudio('chapter', 'en'), /rejected/);
  assert.equal(calls, 1);
});

test('Google rejects HTML instead of publishing it as chapter audio', async () => {
  let calls = 0;
  const helper = load({ timers: true, fetch: async () => { calls++; return new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }); } });
  await assert.rejects(helper.generateGoogleAudio('chapter', 'en'), /invalid audio/);
  assert.equal(calls, 3);
});

test('Google cancellation never starts chunks or retries', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const helper = load({ fetch: async () => { calls++; return audio(1); } });
  await assert.rejects(helper.generateGoogleAudio('chapter', 'en', controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('Google terminal failure aborts sibling workers', async () => {
  const signals = [];
  const helper = load({ count: 8, fetch: async (url, options) => {
    signals.push(options.signal);
    if (url === '0') return new Response(null, { status: 400 });
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  await assert.rejects(helper.generateGoogleAudio('chapter', 'en'));
  assert.equal(signals.length, 4);
  assert.ok(signals.every(signal => signal.aborted));
});
