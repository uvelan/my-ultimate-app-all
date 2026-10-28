const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks={}) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,URLSearchParams,require:name=>mocks[name]});
  return module.exports;
}
const range=load('src/lib/finance-range.ts');
const dashboard=load('src/lib/finance-dashboard.ts');
const {financeCsv}=load('src/lib/finance-csv.ts',{'./finance-range':range});
const categories=[{id:'home',name:'Home, expenses',color:'#059669',parentId:null},{id:'food',name:'Food "daily"',color:'#9333ea',parentId:'home'}];
const items=[
  {id:'1',categoryId:'food',description:'Dinner, "family"',type:'EXPENSE',amountPaise:12345,paymentMethod:'UPI',transactionDate:'2026-10-01T18:45:00Z'},
  {id:'2',categoryId:'home',description:'=1+1',type:'EXPENSE',amountPaise:500,paymentMethod:'Cash',transactionDate:'2026-10-01T10:00:00Z'},
  {id:'3',categoryId:'missing',description:null,type:'INCOME',amountPaise:100000,paymentMethod:null,transactionDate:'2026-10-01T09:00:00Z'},
];
test('CSV preserves local dates, exact amounts, parent categories, and quoted text',()=>{
  const csv=financeCsv(items,categories);
  assert.ok(csv.startsWith('\uFEFFDate,Type,'));
  assert.ok(csv.includes('2026-10-02,EXPENSE,"Home, expenses","Food ""daily""","Dinner, ""family""","UPI",123.45'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('INCOME,"","Uncategorized","","Unknown",1000.00'));
});
test('CSV exports the same filtered transactions used by the dashboard totals',()=>{
  const view=dashboard.dashboardView(items,categories,[],['Cash'],'CATEGORY');
  const csv=financeCsv(view.filteredTransactions,categories);
  assert.equal(csv.split('\r\n').length,3);
  assert.ok(!csv.includes('"Cash"')); assert.ok(csv.includes('"UPI"')); assert.ok(csv.includes('INCOME'));
  assert.equal(view.totalExpense,12345); assert.equal(view.totalIncome,100000);
  assert.equal(financeCsv([],categories).split('\r\n').length,1);
});
const reports=load('src/app/(protected)/finance/reports/page.tsx',{
  '@/lib/finance-range':range,
  'next/navigation':{redirect:url=>{throw Object.assign(new Error('Redirect'),{url});}},
});
test('bookmarked report months redirect to matching dashboard ranges including leap years',async()=>{
  for(const [month,end] of [['2026-10','2026-10-31'],['2024-02','2024-02-29'],['2026-02','2026-02-28'],['2026-12','2026-12-31']]){
    await assert.rejects(reports.default({searchParams:Promise.resolve({month})}),error=>{
      const url=new URL(error.url,'https://example.test');
      assert.equal(url.pathname,'/finance/dashboard');assert.equal(url.searchParams.get('period'),'custom');
      assert.equal(url.searchParams.get('startDate'),`${month}-01`);assert.equal(url.searchParams.get('endDate'),end);return true;
    });
  }
});
test('empty or invalid old report month opens the default dashboard',async()=>{
  for(const month of [undefined,'invalid','2026-13','2026-00']) {
    await assert.rejects(reports.default({searchParams:Promise.resolve({month})}),error=>error.url==='/finance/dashboard');
  }
});
