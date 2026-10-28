const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/lib/finance-range.ts','utf8');
const moduleCopy = { exports: {} };
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleCopy,exports:moduleCopy.exports});
const { financeDateRange, financeDay, financeRangeSeries } = moduleCopy.exports;
test('web and Android use the same inclusive range rules', () => {
    assert.equal(source,fs.readFileSync('mobile-app/src/lib/finance-range.ts','utf8'));
    const range=financeDateRange('2026-10-01','2026-10-31');
    assert.equal(range.startDate,'2026-09-30T18:30:00.000Z'); assert.equal(range.endDate,'2026-10-31T18:29:59.999Z');
    assert.equal(financeDay(new Date('2026-09-30T18:30:00Z')),'2026-10-01');
});
test('invalid, impossible, incomplete and reversed dates are rejected', () => {
    for(const dates of [['2026-02-29','2026-03-01'],['2026-10-02','2026-10-01'],['','2026-10-01'],['2026-13-01','2026-13-02'],['2026-1-1','2026-10-01']]) assert.equal(financeDateRange(...dates),null);
    assert.ok(financeDateRange('2024-02-29','2024-02-29'));
});
test('daily chart includes empty days and excludes transactions outside the chosen range', () => {
    const rows=financeRangeSeries('2026-10-01','2026-10-03',{'2026-09-30':{income:999,expense:999},'2026-10-01':{income:500,expense:100},'2026-10-03':{income:0,expense:200}});
    assert.equal(rows.length,3); assert.equal(rows[1].expense,0); assert.equal(rows.reduce((sum,row)=>sum+row.expense,0),300);
});
test('longer ranges aggregate monthly or yearly without dropping partial first and last periods', () => {
    const daily={'2025-12-31':{income:100,expense:20},'2026-02-01':{income:0,expense:30}};
    const monthly=financeRangeSeries('2025-12-31','2026-02-01',daily);
    assert.equal(monthly.length,3); assert.equal(monthly[1].income,0); assert.equal(monthly.reduce((sum,row)=>sum+row.expense,0),50);
    const yearly=financeRangeSeries('2022-12-31','2026-02-01',daily);
    assert.equal(yearly.length,5); assert.equal(yearly.at(-1).key,'2026'); assert.equal(yearly.reduce((sum,row)=>sum+row.expense,0),50);
});
