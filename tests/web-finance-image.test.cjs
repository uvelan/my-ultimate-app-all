const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
 const module = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, { module, exports: module.exports, require: name => dependencies[name], ...globals });
 return module.exports;
}
const rows = load('src/lib/finance-image.ts');
const image = load('src/lib/finance-image-export.ts', { './finance-image': rows });
const snapshot = { rangeStart: '2026-10-21', rangeEnd: '2026-11-01', totalExpense: 1552078,
 grouping: 'category', hidden: 'My Expense', rows: [{ id: 'one', name: 'Utility & Home <safe>', depth: 0,
 amountPaise: 1552078, color: '#079475', percentage: 100 }] };
test('web and mobile use identical expansion and label layout logic', () => {
 assert.equal(fs.readFileSync('src/lib/finance-image.ts', 'utf8'), fs.readFileSync('mobile-app/src/lib/finance-image.ts', 'utf8'));
});
test('web image includes the selected range, total, filters, escaped labels and category colors', () => {
 const result = image.financeImageSvg(snapshot);
 assert.equal(result.width, 1080);
 for (const text of ['2026-10-21 – 2026-11-01 (inclusive)', '₹15,520.78', 'Hidden: My Expense', 'Utility &amp; Home &lt;safe&gt;', '#079475']) assert.ok(result.svg.includes(text));
 const hostile = image.financeImageSvg({ ...snapshot, rows: [{ ...snapshot.rows[0], color: 'url(https://external.invalid/x)', name: '<script>alert(1)</script>' }] });
 assert.ok(!hostile.svg.includes('<script>'));
 assert.ok(!hostile.svg.includes('external.invalid'));
 assert.ok(image.financeImageSvg({ ...snapshot, rows: [] }).svg.includes('No expenses match this selection.'));
 assert.throws(() => image.financeImageSvg({ ...snapshot, rows: Array.from({ length: 1000 }, () => snapshot.rows[0]) }), /too tall/);
});
test('web download creates PNG through Canvas and uses the date-range filename', async () => {
 const calls = [], urls = [];
 class Image { set src(value) { calls.push(['source', value]); this.onload(); } }
 const png = { type: 'image/png' };
 const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(['draw', ...args]) }), toBlob: (callback, type) => { calls.push(['format', type]); callback(png); } };
 const link = { click() { calls.push(['click', this.download]); }, remove() {} };
 const exporter = load('src/lib/finance-image-export.ts', { './finance-image': rows }, {
  Image, document: { createElement: type => type === 'canvas' ? canvas : link, body: { appendChild() {} } },
  URL: { createObjectURL: blob => { urls.push(blob); return 'blob:png'; }, revokeObjectURL: url => calls.push(['revoke', url]) }, setTimeout: callback => callback(),
 });
 await exporter.downloadFinancePng('blob:svg', 1080, 800, 'breakdown_2026-10-21_2026-11-01.png');
 assert.equal(canvas.width, 1080); assert.equal(canvas.height, 800);
 assert.equal(urls[0], png);
 assert.ok(calls.some(call => call[0] === 'format' && call[1] === 'image/png'));
 assert.ok(calls.some(call => call[0] === 'click' && call[1] === 'breakdown_2026-10-21_2026-11-01.png'));
 assert.ok(calls.some(call => call[0] === 'revoke'));
});

test('web breakdown export reads open branches and the applied period rather than a viewport screenshot', () => {
 let state = null;
 const jsx = (type, props) => ({ type, props });
 const dashboard = load('src/lib/finance-dashboard.ts');
 const module = { exports: {} };
 const source = ts.transpileModule(fs.readFileSync('src/app/(protected)/finance/dashboard/ExpandableBreakdown.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
 }).outputText;
 const dependencies = {
  react: { useRef: () => ({ current: { querySelectorAll: () => [{ dataset: { imagePath: '["root"]' } }] } }),
   useState: () => [state, value => { state = value; }] },
  'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/finance-dashboard': dashboard,
  '@/lib/finance-image': rows, '@/components/finance/FinanceImageExport': { default: 'ImagePreview' },
  './DashboardClient.module.css': { default: {} },
 };
 vm.runInNewContext(source, { module, exports: module.exports, require: name => dependencies[name] });
 const categories = [{ id: 'root', name: 'Utility', color: '#123456', parentId: null }];
 const transaction = { id: 't', categoryId: 'root', amountPaise: 10000, type: 'EXPENSE', description: 'Repair', paymentMethod: 'UPI', transactionDate: '2026-10-30T10:00:00Z' };
 const tree = module.exports.default({ groups: [{ id: 'root', name: 'Utility', color: '#123456', amountPaise: 10000, items: [transaction] }], categories, view: 'CATEGORY', total: 10000, rangeStart: '2026-10-21', rangeEnd: '2026-11-01', hidden: 'Home' });
 function nodes(value) { return !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)]; }
 nodes(tree).find(node => node.props?.['aria-label'] === 'Export breakdown with selected date range').props.onClick();
 assert.equal(state.rangeStart, '2026-10-21'); assert.equal(state.rangeEnd, '2026-11-01');
 assert.equal(state.hidden, 'Home'); assert.equal(state.totalExpense, 10000);
 assert.deepEqual(Array.from(state.rows, row => row.name), ['Utility', 'Repair']);
});


test('all expanded includes transactions behind collapsed branches and PDF prints the chosen rows', async () => {
 const branch = { id: 'child', name: 'Groceries', color: '#079475', amountPaise: 100, children: [],
  items: [{ id: 'tx', amountPaise: 100, description: 'Weekly groceries', paymentMethod: 'UPI', transactionDate: '2026-10-30T10:00:00Z' }] };
 const tree = [{ ...branch, id: 'parent', name: 'Home', items: [], children: [branch] }];
 const shown = rows.financeBreakdownImageRows(tree, 100, new Set(['["parent"]']));
 const expanded = rows.financeBreakdownImageRows(tree, 100, 'all');
 assert.deepEqual(Array.from(shown, row => row.name), ['Home', 'Groceries']);
 assert.deepEqual(Array.from(expanded, row => row.name), ['Home', 'Groceries', 'Weekly groceries']);
 assert.doesNotMatch(rows.financeBreakdownPdfHtml({ ...snapshot, rows: shown, scope: 'shown' }), /Weekly groceries/);

 let printed = false, removed = false, afterPrint;
 const frame = { style: {}, setAttribute() {}, remove() { removed = true; },
  contentWindow: { print() { printed = true; }, addEventListener(name, callback) { afterPrint = callback; } } };
 const exporter = load('src/lib/finance-image-export.ts', { './finance-image': rows }, {
  document: { createElement: type => { assert.equal(type, 'iframe'); return frame; }, body: { appendChild: element => element.onload() } },
  setTimeout: () => 1, clearTimeout() {},
 });
 await exporter.printFinancePdf({ ...snapshot, rows: expanded, scope: 'all' });
 assert.equal(printed, true);
 assert.match(frame.srcdoc, /Weekly groceries/);
 assert.match(frame.srcdoc, /All rows expanded/);
 assert.match(frame.srcdoc, /2026-10-21/);
 assert.match(frame.srcdoc, /Hidden: My Expense/);
 afterPrint();
 assert.equal(removed, true);
});
