const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync('mobile-app/' + file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, require: name => deps[name] });
 return module.exports;
}
const { financeBreakdownImageRows, financeImageLines } = load('src/lib/finance-image.ts');
const item = { id: 'item', description: 'Jar Repair', amountPaise: 10000, transactionDate: '2026-10-30T10:00:00Z', paymentMethod: 'UPI' };
const child = { id: 'child', name: 'Bill', color: '#abcdef', amountPaise: 20000, children: [], items: [item] };
const root = { id: 'root', name: 'Utility', color: '#123456', amountPaise: 40000, children: [child], items: [] };
test('image rows preserve expansion, nesting, parent percentages and transaction details', () => {
 assert.equal(financeBreakdownImageRows([root], 50000, new Set()).length, 1);
 const rows = financeBreakdownImageRows([root], 50000, new Set(['["root"]', '["root","child"]']));
 assert.deepEqual(Array.from(rows, row => row.name), ['Utility', 'Bill', 'Jar Repair']);
 assert.deepEqual(Array.from(rows, row => row.depth), [0, 1, 2]);
 assert.equal(rows[0].percentage, 80); assert.equal(rows[1].percentage, 50);
 assert.match(rows[2].detail, /30\/10\/2026.*UPI/);
 assert.equal(rows[2].amountPaise, 10000);
 assert.equal(financeBreakdownImageRows([root], 0, new Set())[0].percentage, 0);
});
test('payment method branches do not share expansion of identical child categories', () => {
 const roots = [{ ...root, id: 'UPI' }, { ...root, id: 'Cash' }];
 const rows = financeBreakdownImageRows(roots, 80000, new Set(['["UPI"]', '["UPI","child"]']));
 assert.deepEqual(Array.from(rows, row => row.name), ['Utility', 'Bill', 'Jar Repair', 'Utility']);
});
test('long image labels wrap without losing words or Unicode characters', () => {
 for (const text of ['A long category with several words', '₹'.repeat(100), '😀'.repeat(50)]) {
  const lines = financeImageLines(text, 12);
  assert.ok(lines.every(line => Array.from(line).length <= 12));
  assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
 }
});
test('PNG export writes base64 and shares an image file with its date-range filename', async () => {
 const calls = [];
 const service = load('src/services/finance-export.service.ts', {
  'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (...args) => calls.push(args) },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (...args) => calls.push(args) },
  'react-native': { Platform: { OS: 'android' } },
 });
 await service.shareFinanceImage('png-data', 'breakdown_2026-10-21_2026-11-01.png');
 assert.equal(calls[0][0], 'file:///cache/breakdown_2026-10-21_2026-11-01.png');
 assert.equal(calls[0][2].encoding, 'base64');
 assert.equal(calls[1][1].mimeType, 'image/png');
});
