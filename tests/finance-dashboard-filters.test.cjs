const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/finance-dashboard.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { dashboardView, dashboardCategoryTree } = moduleUnderTest.exports;
const categories = [{id:'food',name:'Food',color:'#f00',parentId:null},{id:'lunch',name:'Lunch',color:'#f00',parentId:'food'},{id:'salary',name:'Salary',color:'#0f0',parentId:null}];
const transactions = [
  {id:'1',type:'EXPENSE',categoryId:'lunch',amountPaise:200,paymentMethod:'UPI'},
  {id:'2',type:'EXPENSE',categoryId:'food',amountPaise:300,paymentMethod:'Cash'},
  {id:'3',type:'INCOME',categoryId:'salary',amountPaise:1000,paymentMethod:'UPI'},
  {id:'4',type:'EXPENSE',categoryId:'missing',amountPaise:50,paymentMethod:null},
];

test('chart and expanded breakdown use saved category colors without overriding duplicates', () => {
  const chart=dashboardView(transactions,categories,[],[],'CATEGORY');
  const tree=dashboardCategoryTree(transactions,categories);
  assert.equal(chart.groups.find(group=>group.id==='food').color,'#f00');
  const food=tree.find(node=>node.id==='food');
  assert.equal(food.color,'#f00');
  assert.equal(food.children[0].color,'#f00');
  const changed=categories.map(category=>category.id==='food'?{...category,color:'#059669'}:category);
  assert.equal(dashboardView(transactions,changed,[],[],'CATEGORY').groups.find(group=>group.id==='food').color,'#059669');
  assert.equal(dashboardCategoryTree(transactions,changed).find(node=>node.id==='food').color,'#059669');
});
test('category parents include child items exactly once and expanded amounts reconcile', () => {
  const view = dashboardView(transactions,categories,null,null,'CATEGORY');
  assert.equal(view.totalExpense,550); assert.equal(view.netSavings,450);
  const food=view.groups.find(item=>item.id==='food');
  assert.equal(food.amountPaise,500); assert.equal(food.items.length,2);
  assert.equal(view.groups.reduce((sum,item)=>sum+item.amountPaise,0),view.totalExpense);
});
test('clicking legends excludes their items from all totals and the breakdown', () => {
  const method=dashboardView(transactions,categories,null,['UPI'],'METHOD');
  assert.equal(method.totalIncome,0); assert.equal(method.totalExpense,350); assert.equal(method.netSavings,-350);
  assert.equal(method.groups.some(group=>group.id==='UPI'),false);
  const combined=dashboardView(transactions,categories,['food'],['UPI'],'CATEGORY');
  assert.equal(combined.totalIncome,0); assert.equal(combined.totalExpense,50); assert.equal(combined.netSavings,-50);
  assert.equal(combined.groups[0].items[0].id,'4');
  const empty=dashboardView(transactions,categories,['food','missing'],null,'METHOD');
  assert.equal(empty.groups.length,0); assert.equal(empty.totalExpense,0);
  assert.equal(dashboardView(transactions,categories,null,null,'METHOD').totalExpense,550);
});

test('multiple legends can be excluded and restoring a legend restores its items', () => {
  const excluded=['UPI','Cash'];
  assert.equal(dashboardView(transactions,categories,[],excluded,'METHOD').totalExpense,50);
  const restored=excluded.filter(method=>method!=='UPI');
  const result=dashboardView(transactions,categories,[],restored,'CATEGORY');
  assert.equal(result.totalExpense,250); assert.equal(result.totalIncome,1000);
  const allHidden=dashboardView(transactions,categories,[],['UPI','Cash','Unknown'],'METHOD');
  assert.equal(allHidden.groups.length,0); assert.equal(allHidden.netSavings,0);
  assert.equal(dashboardView(transactions,categories,[],[],'CATEGORY').totalExpense,550);
});

test('expandable breakdown preserves nested categories and direct items without duplicate totals', () => {
  const nestedCategories=[...categories,{id:'coffee',name:'Coffee',color:'#a00',parentId:'lunch'}];
  const nestedTransactions=[...transactions,{id:'5',type:'EXPENSE',categoryId:'coffee',amountPaise:75,paymentMethod:'UPI'}];
  const nodes=dashboardCategoryTree(nestedTransactions,nestedCategories);
  const food=nodes.find(node=>node.id==='food');
  assert.equal(food.amountPaise,575);
  assert.equal(food.items.length,1); assert.equal(food.items[0].id,'2');
  assert.equal(food.children[0].amountPaise,275);
  assert.equal(food.children[0].items[0].id,'1');
  assert.equal(food.children[0].children[0].items[0].id,'5');
  const reconcile=node=>{
    const amount=node.items.reduce((sum,item)=>sum+item.amountPaise,0)+node.children.reduce((sum,child)=>sum+reconcile(child),0);
    assert.equal(amount,node.amountPaise); return amount;
  };
  assert.equal(nodes.reduce((sum,node)=>sum+reconcile(node),0),625);
  const filtered=dashboardView(nestedTransactions,nestedCategories,['missing'],['Cash'],'METHOD');
  const filteredTree=dashboardCategoryTree(filtered.groups.flatMap(group=>group.items),nestedCategories);
  assert.equal(filteredTree[0].amountPaise,275); assert.equal(filteredTree[0].items.length,0);
  assert.equal(dashboardCategoryTree([],categories).length,0);
});
