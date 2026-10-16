const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function helper() {
  const filename = path.resolve(__dirname, '../src/lib/tts-provider.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({ module, exports: module.exports });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('audio response metadata selects the actual fallback provider and voice', () => {
  const { readTtsAudioMetadata } = helper();
  const requested = { provider: 'gemini', voice: 'Charon' };
  assert.deepEqual(plain(readTtsAudioMetadata(new Headers({
    'X-TTS-Provider': 'xiaomi', 'X-TTS-Voice': 'Mia', 'X-TTS-Fallback': 'gemini',
  }), requested)), { provider: 'xiaomi', voice: 'Mia', fallback: ['gemini'] });
  assert.deepEqual(plain(readTtsAudioMetadata(new Headers({
    'X-TTS-Provider': 'google', 'X-TTS-Voice': 'en', 'X-TTS-Fallback': 'gemini,xiaomi',
  }), requested)), { provider: 'google', voice: 'en', fallback: ['gemini', 'xiaomi'] });
});

test('successful responses without fallback headers retain the selected provider and voice', () => {
  const { readTtsAudioMetadata } = helper();
  for (const requested of [
    { provider: 'gemini', voice: 'Zephyr' }, { provider: 'xiaomi', voice: 'Chloe' }, { provider: 'google', voice: 'en-GB' },
  ]) {
    assert.deepEqual(plain(readTtsAudioMetadata(new Headers(), requested)), { ...requested, fallback: [] });
  }
});

test('missing or mismatched response voices use the actual provider default', () => {
  const { readTtsAudioMetadata } = helper();
  for (const [provider, voice, expected] of [
    ['google', null, 'en'], ['google', 'Chloe', 'en'], ['xiaomi', 'Kore', 'Mia'], ['gemini', 'Dean', 'Kore'],
  ]) {
    const headers = new Headers({ 'X-TTS-Provider': provider });
    if (voice) headers.set('X-TTS-Voice', voice);
    const actual = readTtsAudioMetadata(headers, { provider: 'gemini', voice: 'Charon' });
    assert.equal(actual.provider, provider);
    assert.equal(actual.voice, expected);
  }
});

test('unknown provider headers cannot replace a valid selection and fallback lists are sanitized', () => {
  const { readTtsAudioMetadata } = helper();
  const actual = readTtsAudioMetadata(new Headers({
    'X-TTS-Provider': 'unknown', 'X-TTS-Voice': 'en-US',
    'X-TTS-Fallback': ' gemini,unknown,gemini,xiaomi,google, xiaomi ',
  }), { provider: 'google', voice: 'en-GB' });
  assert.deepEqual(plain(actual), { provider: 'google', voice: 'en-US', fallback: ['gemini', 'xiaomi'] });
});

test('legacy Gemini choices migrate out of the Google voice selector', () => {
  const { migrateLegacyTtsSelection } = helper();
  for (const voice of ['gemini-3.1-kore', 'gemini-2.5-kore']) {
    for (const provider of [null, 'google']) {
      assert.deepEqual(plain(migrateLegacyTtsSelection(provider, voice)), { provider: 'gemini', googleVoice: 'en' });
    }
    assert.deepEqual(plain(migrateLegacyTtsSelection('xiaomi', voice)), { provider: 'xiaomi', googleVoice: 'en' }, 'an explicit later Xiaomi choice is preserved');
  }
});

test('current settings retain supported free accents and invalid stored settings recover to defaults', () => {
  const { migrateLegacyTtsSelection } = helper();
  assert.deepEqual(plain(migrateLegacyTtsSelection('gemini', 'en-IN')), { provider: 'gemini', googleVoice: 'en-IN' });
  assert.deepEqual(plain(migrateLegacyTtsSelection('google', 'en-AU')), { provider: 'google', googleVoice: 'en-AU' });
  assert.deepEqual(plain(migrateLegacyTtsSelection('unknown', 'unknown')), { provider: 'google', googleVoice: 'en' });
  assert.deepEqual(plain(migrateLegacyTtsSelection(null, null)), { provider: 'google', googleVoice: 'en' });
});
