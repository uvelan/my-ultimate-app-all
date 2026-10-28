const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file,mocks={}) {
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]});return module.exports;
}
const range=load('mobile-app/src/lib/finance-range.ts');
const period=load('mobile-app/src/lib/finance-period.ts',{'./finance-range':range});
const dashboard=load('mobile-app/src/lib/finance-dashboard.ts');
const csv=load('mobile-app/src/lib/finance-csv.ts',{'./finance-range':range});
test('mobile uses identical dashboard exclusion, breakdown and CSV logic to web',()=>{
    for(const file of ['finance-dashboard.ts','finance-csv.ts'])assert.equal(fs.readFileSync('mobile-app/src/lib/'+file,'utf8'),fs.readFileSync('src/lib/'+file,'utf8'));
});
test('quarter and half-year presets include their entire calendar period in India',()=>{
    for(const [anchor,key,start,end] of [
        ['2026-01-15','quarter','2026-01-01','2026-03-31'],['2026-04-01','quarter','2026-04-01','2026-06-30'],
        ['2026-08-15','quarter','2026-07-01','2026-09-30'],['2026-10-28','quarter','2026-10-01','2026-12-31'],
        ['2026-03-31','halfYear','2026-01-01','2026-06-30'],['2026-10-28','halfYear','2026-07-01','2026-12-31'],
        ['2024-02-15','month','2024-02-01','2024-02-29'],['2026-10-28','year','2026-01-01','2026-12-31'],
    ]) {
        const actual=period.financePeriodRange(key,new Date(anchor+'T12:00:00Z'));
        assert.equal(actual.start,start);assert.equal(actual.end,end);
        assert.equal(actual.startDate,range.financeDateRange(start,end).startDate);assert.equal(actual.endDate,range.financeDateRange(start,end).endDate);
    }
    assert.equal(period.financePeriodRange('quarter',new Date('2026-03-31T20:00:00Z')).start,'2026-04-01');
});
test('previous and next navigate full quarters and half-years across year boundaries',()=>{
    for(const [key,anchor,direction,start] of [
        ['quarter','2026-12-31',1,'2027-01-01'],['quarter','2026-01-31',-1,'2025-10-01'],
        ['halfYear','2026-10-28',-1,'2026-01-01'],['halfYear','2026-10-28',1,'2027-01-01'],
        ['year','2026-10-28',1,'2027-01-01'],['month','2024-01-31',1,'2024-02-01'],
    ])assert.equal(period.financePeriodRange(key,period.moveFinancePeriod(key,new Date(anchor+'T12:00:00Z'),direction)).start,start);
});
function dashboardHarness() {
    let states=[],index=0,shares=[];
    const jsx=(type,props)=>({type,props});
    const react={useState:initial=>{const key=index++;if(!(key in states))states[key]=initial;return [states[key],value=>{states[key]=typeof value==='function'?value(states[key]):value;}];}};
    const native={View:'View',Text:'Text',TouchableOpacity:'Button',ScrollView:'ScrollView',StyleSheet:{create:value=>value},Alert:{alert:()=>assert.fail('unexpected export failure')}};
    const module=load('mobile-app/src/components/finance/FinanceDashboard.tsx',{
        react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'victory-native':{VictoryPie:'Pie'},'lucide-react-native':{},
        '@/src/lib/finance-dashboard':dashboard,'@/src/lib/finance-csv':csv,
        '@/src/services/finance-export.service':{shareFinanceCsv:async(...args)=>shares.push(args)},
    });
    const categories=[{id:'food',name:'Food',color:'#059669',parentId:null},{id:'home',name:'Home',color:'#9333ea',parentId:null}];
    const transactions=[{id:'1',categoryId:'food',description:'Lunch',amountPaise:200,type:'EXPENSE',transactionDate:'2026-10-01T12:00:00Z',paymentMethod:'UPI'},
        {id:'2',categoryId:'home',amountPaise:300,type:'EXPENSE',transactionDate:'2026-10-02T12:00:00Z',paymentMethod:'Cash'},
        {id:'3',categoryId:'salary',amountPaise:1000,type:'INCOME',transactionDate:'2026-10-03T12:00:00Z',paymentMethod:'UPI'}];
    const props={categories,transactions,grouping:'category',onGrouping:value=>props.grouping=value,rangeStart:'2026-10-01',rangeEnd:'2026-10-31'};
    const render=()=>{index=0;return module.FinanceDashboard(props);};
    return {render,shares,renderBranch:element=>{index=50;return element.type(element.props);}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(nodes);return[tree,...nodes(tree.props?.children)];}
function text(tree){if(tree===null||tree===undefined||typeof tree==='boolean')return'';if(Array.isArray(tree))return tree.map(text).join('');if(typeof tree==='object')return text(tree.props?.children);return String(tree);}
test('mobile legend taps exclude and restore pie data, breakdown items, totals and CSV',async()=>{
    const app=dashboardHarness();let tree=app.render();
    const find=label=>nodes(tree).find(node=>node.props?.accessibilityLabel?.startsWith(label));
    find('Food, included').props.onPress();tree=app.render();
    assert.equal(nodes(tree).find(node=>node.type==='Pie').props.data.length,1);
    assert.ok(text(tree).includes('−₹3.00'));assert.ok(text(tree).includes('₹7.00'));
    await find('Export filtered finance CSV').props.onPress();
    assert.ok(!app.shares[0][0].includes('"Food"'));assert.ok(app.shares[0][0].includes('"Home"'));assert.ok(app.shares[0][0].includes('INCOME'));
    find('Home, included').props.onPress();tree=app.render();assert.ok(text(tree).includes('No expenses in this selection.'));
    find('Food, excluded').props.onPress();tree=app.render();assert.equal(nodes(tree).find(node=>node.type==='Pie').props.data[0].id,'food');
});
test('tapping a mobile pie slice displays its amount and visible percentage',()=>{
    const app=dashboardHarness();let tree=app.render();
    const pie=nodes(tree).find(node=>node.type==='Pie');
    pie.props.events[0].eventHandlers.onPressIn(null,{datum:pie.props.data.find(item=>item.id==='food')});tree=app.render();
    assert.ok(text(tree).includes('Food: ₹2.00 (40%)'));
    assert.ok(!text(tree).includes('Savings Rate'));assert.ok(!text(tree).includes('Cash Flow'));
});
test('mobile breakdown stacks below the chart and expands to individual items',()=>{
    const app=dashboardHarness();const tree=app.render();
    const columns=nodes(tree).find(node=>node.props?.style?.flexDirection==='column'&&node.props.style.gap===16);
    assert.ok(columns);assert.ok(text(columns.props.children[1]).includes('Breakdown'));
    const branch=nodes(tree).find(node=>typeof node.type==='function'&&node.props?.node?.id==='food');
    let rendered=app.renderBranch(branch);
    assert.ok(!text(rendered).includes('Lunch'));
    nodes(rendered).find(node=>node.props?.accessibilityLabel==='Expand Food').props.onPress();
    rendered=app.renderBranch(branch);assert.ok(text(rendered).includes('Lunch'));assert.ok(text(rendered).includes('UPI'));
});
test('native CSV export writes a file and opens the system share sheet',async()=>{
    const calls=[];
    const service=load('mobile-app/src/services/finance-export.service.ts',{
        'expo-file-system/legacy':{cacheDirectory:'cache/',EncodingType:{UTF8:'utf8'},writeAsStringAsync:async(...args)=>calls.push(['write',...args])},
        'expo-sharing':{isAvailableAsync:async()=>true,shareAsync:async(...args)=>calls.push(['share',...args])},
        'react-native':{Platform:{OS:'android'},Share:{share:()=>assert.fail('expected file share')}},
    });
    await service.shareFinanceCsv('csv contents','finance.csv');
    assert.equal(calls[0][0],'write');assert.equal(calls[0][1],'cache/finance.csv');assert.equal(calls[0][2],'csv contents');assert.equal(calls[1][0],'share');assert.equal(calls[1][2].mimeType,'text/csv');
});
