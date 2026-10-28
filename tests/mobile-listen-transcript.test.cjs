const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('../mobile-app/node_modules/react');const moduleValue={exports:{}};
const code=ts.transpileModule(fs.readFileSync('mobile-app/src/components/ListenTranscript.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module:moduleValue,exports:moduleValue.exports,require:name=>name==='react'?{default:React}:Object.fromEntries(['View','ScrollView','Text','Pressable'].map(name=>[name,name]))});
const Component=moduleValue.exports.ListenTranscript;
const props={cues:[{text:'First chapter'},{text:'Next passage'}],activeCue:0,light:true,height:340,follow:true,scrollRef:{current:null},onFollow(){},onDrag(){},onViewport(){},onCueLayout(){}};
function nodes(root,type){const found=[];function visit(item){if(!item||typeof item!=='object')return;if(item.type===type)found.push(item);React.Children.forEach(item.props?.children,visit);}visit(root);return found;}
test('chapter and highlight changes keep the transcript scroll and row identities stable',()=>{
 const first=Component(props),next=Component({...props,cues:[{text:'Different chapter'},{text:'Different passage'}],activeCue:1});
 const scrollA=nodes(first,'ScrollView')[0],scrollB=nodes(next,'ScrollView')[0];
 assert.equal(scrollA.key,null);assert.equal(scrollB.key,null);assert.equal(scrollA.props.removeClippedSubviews,false);
 const rowsA=nodes(first,'View').filter(node=>node.key!==null),rowsB=nodes(next,'View').filter(node=>node.key!==null);
 assert.deepEqual(rowsA.map(node=>node.key),rowsB.map(node=>node.key));
 for(const row of [...rowsA,...rowsB])assert.equal(row.props.collapsable,false);
 assert.equal(first.props.collapsable,false);assert.equal(first.props.collapsableChildren,false);
 assert.equal(rowsA[1].props.style.backgroundColor,'transparent');assert.notEqual(rowsB[1].props.style.backgroundColor,'transparent');
});

test('reused row layouts retain follow-audio geometry when chapter text changes without a new native layout event',()=>{
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('mobile-app/src/lib/narration-layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
 const layouts=new Map([[0,{text:'Old chapter',y:0,height:50}],[1,{text:'Old second passage',y:54,height:70}],[2,{text:'Removed',y:128,height:40}]]);
 module.exports.refreshCueLayoutText(layouts,[{text:'Current chapter'},{text:'Current passage'}]);
 assert.equal(layouts.get(1).text,'Current passage');assert.equal(layouts.get(1).y,54);assert.equal(layouts.get(1).height,70);assert.equal(layouts.has(2),false);
});
