const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks={}) { const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]});return module.exports; }
const range=load('src/lib/finance-range.ts');
test('web dashboard loads complete item data for the inclusive selected range', async () => {
    const calls=[];
    const aggregate={transactions:[{id:'txn',description:'Lunch',type:'EXPENSE',categoryId:'cat',amountPaise:30000,paymentMethod:'UPI',transactionDate:new Date('2026-10-15T12:00:00Z')}]};
    const page=load('src/app/(protected)/finance/dashboard/page.tsx',{
        '@/lib/finance-range':range,
        '@/actions/transaction':{getDashboardAggregates:async(start,end)=>{calls.push([start.toISOString(),end.toISOString()]);return aggregate;}},
        '@/actions/category':{getCategories:async()=>[{id:'cat',name:'Food',color:'#f00'}]},
        '@/actions/recurring':{processRecurringTransactions:async()=>{}},
        './DashboardClient':{default:'Dashboard'},'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
    });
    const result=await page.default({searchParams:Promise.resolve({period:'custom',startDate:'2026-10-01',endDate:'2026-10-15'})});
    assert.deepEqual(calls,[['2026-09-30T18:30:00.000Z','2026-10-15T18:29:59.999Z']]);
    assert.equal(result.props.currentPeriod,'custom'); assert.equal(result.props.rangeStart,'2026-10-01'); assert.equal(result.props.rangeEnd,'2026-10-15');
    assert.equal(result.props.transactions[0].amountPaise,30000);
    assert.equal(result.props.transactions[0].transactionDate,'2026-10-15T12:00:00.000Z');
    assert.equal(result.props.categories[0].name,'Food');
});
test('web Apply range preserves existing query parameters and rejects reversed dates', () => {
    const file='src/app/(protected)/finance/dashboard/DashboardClient.tsx',source=fs.readFileSync(file,'utf8');
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let fn;
    function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='applyRange')fn=node.initializer.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(fn);
    const errors=[],urls=[];
    const context={financeDateRange:range.financeDateRange,startInput:'2026-10-01',endInput:'2026-10-15',setRangeError:value=>errors.push(value),URLSearchParams,searchParams:new URLSearchParams('period=year&view=method'),pathname:'/finance/dashboard',router:{push:value=>urls.push(value)}};
    const code=ts.transpileModule('('+fn+')({preventDefault(){}})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,context);const query=new URL(urls[0],'https://test.local').searchParams;
    assert.equal(query.get('period'),'custom');assert.equal(query.get('view'),'method');assert.equal(query.get('startDate'),'2026-10-01');assert.equal(query.get('endDate'),'2026-10-15');
    context.startInput='2026-10-16';vm.runInNewContext(code,context);assert.equal(urls.length,1);assert.match(errors.at(-1),/valid dates/);
});
