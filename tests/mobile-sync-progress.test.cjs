const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleValue={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/src/lib/sync-progress.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleValue,exports:moduleValue.exports});
const {chapterSyncProgress}=moduleValue.exports;
test('batch progress counts verified chapters once and cannot report 100 before the last file is committed',()=>{
 const p=chapterSyncProgress(10,15,[10,10,11,99],12,'generating',.5); assert.equal(p.complete,2);assert.equal(p.remaining,3);assert.ok(Math.abs(p.percent-49)<1e-9);
 assert.ok(chapterSyncProgress(10,15,[10,11,12,13],14,'downloading',1).percent<100);
 assert.equal(chapterSyncProgress(10,15,[10,11,12,13,14],14,'complete',1).percent,100);
 assert.equal(chapterSyncProgress(10,15,[],12,'generating',NaN).percent,0);
});

test('batch progress includes generation without marking unverified chapters saved',()=>{
 const p=chapterSyncProgress(10,20,[10,11,12,13],16,'batch-generating',.5,6);
 assert.equal(p.complete,4);assert.equal(p.remaining,6);assert.ok(p.percent>40&&p.percent<100);
 assert.ok(chapterSyncProgress(10,20,[10,11,12,13],16,'batch-downloading',1,6).percent<100);
});
test('distance below four downloads individually and distance four or above uses one batch',()=>{
 const {batchDeliveryRequired}=moduleValue.exports;
 assert.equal(batchDeliveryRequired(244,244),false);
 assert.equal(batchDeliveryRequired(247,244),false);
 assert.equal(batchDeliveryRequired(248,244),true);
 assert.equal(batchDeliveryRequired(260,244),true);
 assert.equal(batchDeliveryRequired(247,245),false);
});
