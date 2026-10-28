const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  let saved = null;
  const cacheService = { getObject: () => saved, setObject: (_, value) => { saved = value; }, delete: () => { saved = null; } };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../mobile-app/src/lib/audio-diagnostics.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { module, exports: module.exports, require: () => ({ cacheService }) });
  return module.exports.audioDiagnostics;
}
test('device audio logs are bounded and exclude chapter text, paths, tokens and arbitrary errors', () => {
  const log = harness();
  for (let i = 0; i < 120; i++) log.record('chunk ready', { index: i, start: i, end: i + 1, bytes: 100,
    text: 'private chapter', token: 'secret', uri: 'https://private', error: 'private error' });
  assert.equal(log.read().length, 100);
  assert.equal(log.read()[0].details.index, 20);
  const serialized = JSON.stringify(log.read());
  assert.ok(!serialized.includes('private') && !serialized.includes('secret'));
  log.record('private arbitrary error'); assert.equal(log.read().length, 100);
  log.clear(); assert.equal(log.read().length, 0);
});
test('Reader and Listen route diagnostics to a separate screen instead of embedding crash reports', () => {
  for (const route of ['reader', 'listen']) {
    const source = fs.readFileSync(path.join(__dirname, '../mobile-app/app', route, '[id].tsx'), 'utf8');
    assert.ok(!source.includes('PlaybackCrashReport'));
    assert.ok(source.includes("router.push('/diagnostics'"));
  }
  const diagnostics = fs.readFileSync(path.join(__dirname, '../mobile-app/app/diagnostics.tsx'), 'utf8');
  assert.ok(diagnostics.includes('<PlaybackCrashReport'));
  assert.ok(diagnostics.includes('audioDiagnostics.read()'));
});
