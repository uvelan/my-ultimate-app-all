const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const moduleValue = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/src/lib/sync-state.ts', 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { module: moduleValue, exports: moduleValue.exports });
const { syncDisplayPhase, syncStatusMatches } = moduleValue.exports;
test('disconnected, paused and stale sessions cannot claim active generation or downloads', () => {
 for (const phase of ['queued', 'generating', 'downloading', 'batch-generating', 'batch-downloading', 'verifying']) {
  assert.equal(syncDisplayPhase(phase, { state: 'disconnected', checkedAt: 1000 }, false, 2000), 'waiting');
  assert.equal(syncDisplayPhase(phase, { state: 'pairing-required', checkedAt: 1000 }, false, 2000), 'waiting');
  assert.equal(syncDisplayPhase(phase, { state: 'connected', checkedAt: 1000 }, true, 2000), 'paused');
  assert.equal(syncDisplayPhase(phase, { state: 'connected', checkedAt: 1000 }, false, 32000), 'checking');
  assert.equal(syncDisplayPhase(phase, { state: 'checking', checkedAt: 1000 }, false, 2000), 'checking');
  assert.equal(syncDisplayPhase(phase, { state: 'connected', checkedAt: 1000 }, false, 2000), phase);
 }
 assert.equal(syncDisplayPhase('preparing', { state: 'disconnected' }, true), 'preparing');
 assert.equal(syncDisplayPhase('complete', { state: 'disconnected' }, false), 'complete');
});
test('status from a different account, book or voice cannot drive the displayed progress', () => {
 const status = { userId: 'u', bookId: 'b', voice: 'af_heart' };
 assert.equal(syncStatusMatches(status, 'u', 'b', 'af_heart'), true);
 assert.equal(syncStatusMatches(status, 'other', 'b', 'af_heart'), false);
 assert.equal(syncStatusMatches(status, 'u', 'other', 'af_heart'), false);
 assert.equal(syncStatusMatches(status, 'u', 'b', 'af_bella'), false);
 assert.equal(syncStatusMatches(status, 'u'), true);
});
