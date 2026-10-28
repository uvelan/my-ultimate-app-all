const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function service(data, transactions = []) {
    let range;
    const rangeModule = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/src/lib/finance-range.ts','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { module: rangeModule, exports: rangeModule.exports });
    const dependencies = { '../lib/finance-range': rangeModule.exports, '../lib/api-client': { api: { get: async () => ({ data }) } }, './finance.service': { financeService: { transactions: async params => { range = params; return transactions; } } } };
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync('mobile-app/src/services/features.service.ts','utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
    return { expense: module.exports.expenseService, range: () => range };
}
test('Android category breakdown includes child details without double counting parent totals', async () => {
    const { expense } = service({ totalIncome: 2000000, totalExpense: 1100000, netSavings: 900000,
        categories: [{ id:'home', name:'Home', color:'#00f', type:'EXPENSE' }, { id:'food', name:'Food', color:'#f00', parentId:'home', type:'EXPENSE' }, { id:'other', name:'Other', type:'EXPENSE' }, { id:'salary', name:'Salary', type:'INCOME' }],
        categorySpending: { home:1000000, food:700000, other:100000 }, methodSpending: { UPI:1100000 } });
    const stats = await expense.getStats();
    assert.equal(stats.totalExpense, 11000); assert.equal(stats.balance, 9000);
    assert.equal(stats.categorySplit.length, 2); assert.equal(stats.categorySplit[0].value, 10000);
    assert.equal(stats.categorySplit[0].children[0].value, 7000);
    assert.equal(stats.categorySplit.reduce((sum,row) => sum + row.value, 0), 11000);
    assert.equal(stats.methodSplit[0].value, 11000);
});
test('cash flow keeps income and expenses separate and follows the selected month', async () => {
    const app = service({}, [
        { transactionDate:'2026-01-05T12:00:00Z', type:'INCOME', amountPaise:500000 },
        { transactionDate:'2026-01-06T12:00:00Z', type:'EXPENSE', amountPaise:120000, category:{ name:'Food', color:'#f00' } },
        { transactionDate:'2026-02-06T12:00:00Z', type:'EXPENSE', amountPaise:999999, category:{ name:'Food' } },
    ]);
    const result = await app.expense.getHistorical('month','category','2026-01-15T12:00:00Z');
    assert.equal(result.chartData.length,12); assert.equal(result.chartData.at(-1).period,'Jan');
    assert.equal(result.chartData.at(-1).income,5000); assert.equal(result.chartData.at(-1).expense,1200);
    assert.equal(app.range().type,undefined); assert.match(app.range().endDate,/2026-01-31/);
});


test('custom range cash flow includes both India boundary days and requests the exact API range', async () => {
    const app = service({}, [
        { transactionDate:'2026-09-30T18:30:00Z', type:'INCOME', amountPaise:500000 },
        { transactionDate:'2026-10-01T18:29:59.999Z', type:'EXPENSE', amountPaise:120000 },
        { transactionDate:'2026-10-01T18:30:00Z', type:'EXPENSE', amountPaise:990000 },
    ]);
    const result = await app.expense.getCashFlow('2026-10-01','2026-10-01');
    assert.equal(app.range().startDate,'2026-09-30T18:30:00.000Z');
    assert.equal(app.range().endDate,'2026-10-01T18:29:59.999Z');
    assert.equal(result.chartData.length,1); assert.equal(result.chartData[0].income,5000); assert.equal(result.chartData[0].expense,1200);
    await assert.rejects(app.expense.getCashFlow('2026-10-02','2026-10-01'));
});


test('Android dashboard loads one complete transaction set for custom dates and keeps archived category colors', async () => {
    const file='mobile-app/app/(protected)/(tabs)/expenses.tsx',source=fs.readFileSync(file,'utf8');
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
    function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='fetchData')fn=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(fn);
    const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/src/lib/finance-range.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports});
    const requests=[],refresh=[],results={};
    const transactions=[{id:'expense',type:'EXPENSE',amountPaise:12345,transactionDate:'2025-12-15T12:00:00Z',categoryId:'archived'}, {id:'income',type:'INCOME',amountPaise:50000,transactionDate:'2026-01-02T12:00:00Z'}];
    const cats=[{id:'archived',type:'EXPENSE',isArchived:true,color:'#059669'},{id:'active',type:'EXPENSE',isArchived:false,color:'#9333ea'}];
    const context={financeRequest:{current:0},activeSegment:'overview',dashboardRange:mod.exports.financeDateRange('2025-12-15','2026-01-02'),
        financeService:{transactions:async params=>{requests.push(params);return transactions;},categories:async archived=>{assert.equal(archived,true);return cats;}},
        setLoadError:message=>assert.equal(message,''),setRefreshing:value=>refresh.push(value),setLoading(){},
        setDashboardTransactions:value=>results.transactions=value,setDashboardCategories:value=>results.categories=value,setExpenses:value=>results.expenses=value,setIncomes:value=>results.incomes=value,setCategories:value=>results.editable=value,console,
    };
    const code=ts.transpileModule('('+fn+')()',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    await vm.runInNewContext(code,context);
    assert.equal(requests.length,1);assert.equal(requests[0].startDate,'2025-12-14T18:30:00.000Z');assert.equal(requests[0].endDate,'2026-01-02T18:29:59.999Z');
    assert.equal(results.transactions,transactions);assert.equal(results.categories,cats);assert.equal(results.editable.length,1);assert.equal(results.expenses[0].amount,123.45);assert.equal(results.incomes[0].amount,500);assert.deepEqual(refresh,[true,false]);
});