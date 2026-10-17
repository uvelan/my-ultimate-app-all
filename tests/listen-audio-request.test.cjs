const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name) {
  const file = path.resolve(__dirname, '../src/lib/' + name + '.ts');
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Error, TypeError, DOMException,
    setTimeout, clearTimeout, console });
  return module.exports;
}
const { retryAudioOperation, AudioRequestError } = load('listen-audio-request');
const { preparedAudioEvictions } = load('listen-audio-buffer');

test('network and response-body interruption retry the complete operation', async () => {
  let calls = 0;
  const result = await retryAudioOperation(async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    if (calls === 2) throw new DOMException('Response body interrupted', 'NetworkError');
    return 'complete audio';
  }, new AbortController().signal, [0, 0]);
  assert.equal(result, 'complete audio');
  assert.equal(calls, 3);
});

test('retryable HTTP failures back off, while authentication and invalid requests fail once', async () => {
  for (const status of [408, 429, 500, 502, 503]) {
    let calls = 0;
    await retryAudioOperation(async () => {
      if (++calls === 1) throw new AudioRequestError('Temporary failure', status);
    }, new AbortController().signal, [0]);
    assert.equal(calls, 2);
  }
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(retryAudioOperation(async () => {
      calls++;
      throw new AudioRequestError('Permanent failure', status);
    }, new AbortController().signal, [0, 0]));
    assert.equal(calls, 1);
  }
});

test('abort during backoff prevents another paid/network request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = retryAudioOperation(async () => {
    calls++;
    throw new TypeError('Network failed');
  }, controller.signal, [10000]);
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('retry exhaustion is bounded and preserves the final error', async () => {
  const error = new TypeError('Network failed');
  let calls = 0;
  await assert.rejects(retryAudioOperation(async () => { calls++; throw error; },
    new AbortController().signal, [0, 0]), value => value === error);
  assert.equal(calls, 3);
});

test('prepared memory evicts farthest chapters while protecting current and next', () => {
  const entries = [0, 1, 2, 3, 4].map(index => ({ key: String(index), index, bytes: 60 }));
  assert.deepEqual(Array.from(preparedAudioEvictions(entries, 0, 150)), ['4', '3', '2']);
  assert.deepEqual(Array.from(preparedAudioEvictions(entries.slice(0, 2), 0, 50)), []);
  assert.deepEqual(Array.from(preparedAudioEvictions(entries, 1, 200)), ['4', '3']);
});
