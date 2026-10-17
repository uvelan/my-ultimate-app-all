const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/listen-audio-window.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(compiled, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { nextAudioWindowStart } = moduleUnderTest.exports;

test('five-chapter anchor advances at the middle chapter, not at every chapter', () => {
  let previousStart = null;
  let previousCurrent = null;
  const starts = [];
  for (let current = 0; current < 8; current++) {
    previousStart = nextAudioWindowStart(previousStart, previousCurrent, current);
    previousCurrent = current;
    starts.push(previousStart);
  }
  assert.deepEqual(starts, [0, 0, 2, 2, 4, 4, 6, 6]);
});

test('any backward navigation resets the anchor, including within the retained window', () => {
  assert.equal(nextAudioWindowStart(2, 3, 2), 2);
  assert.equal(nextAudioWindowStart(2, 3, 1), 1);
  assert.equal(nextAudioWindowStart(0, 1, 0), 0);
  assert.equal(nextAudioWindowStart(8, 9, 4), 4);
});

test('forward jumps at or beyond the middle start at the clicked chapter', () => {
  assert.equal(nextAudioWindowStart(0, 0, 1), 0);
  assert.equal(nextAudioWindowStart(0, 0, 2), 2);
  assert.equal(nextAudioWindowStart(0, 1, 4), 4);
  assert.equal(nextAudioWindowStart(2, 2, 20), 20);
});

test('settings reruns preserve the anchor and a new book starts at its restored chapter', () => {
  assert.equal(nextAudioWindowStart(2, 3, 3), 2);
  assert.equal(nextAudioWindowStart(1, 1, 1), 1);
  assert.equal(nextAudioWindowStart(null, null, 14), 14);
});
