const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
    const refs=[],effects=[],tasks=[],scrolls=[];let slot=0;
    const react={
        useRef:initial=>{const key=slot++;return refs[key]||(refs[key]={current:initial});},
        useCallback:fn=>fn,
        useEffect:fn=>effects.push(fn),
    };
    const jsx=(type,props)=>({type,props});
    const native={FlatList:'FlatList',View:'View',InteractionManager:{runAfterInteractions:fn=>{const task={fn,cancelled:false,cancel(){this.cancelled=true;}};tasks.push(task);return task;}}};
    const module={exports:{}};
    const code=ts.transpileModule(fs.readFileSync('mobile-app/src/components/ChapterIndexList.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,require:name=>({react,'react/jsx-runtime':{jsx},'react-native':native})[name]});
    const cleanup=[];
    return {
        scrolls,
        render:props=>{
            cleanup.splice(0).forEach(fn=>fn?.());slot=0;
            const tree=module.exports.ChapterIndexList({...props,keyExtractor:item=>item.id,renderItem:()=>null});
            tree.props.ref.current={scrollToIndex:options=>scrolls.push(options),scrollToOffset:options=>scrolls.push(options)};
            effects.splice(0).forEach(fn=>cleanup.push(fn()));return tree;
        },
        settle:()=>tasks.splice(0).forEach(task=>{if(!task.cancelled)task.fn();}),
    };
}
const data=Array.from({length:1000},(_,index)=>({id:String(index),title:'A chapter title that can wrap to two lines'}));
const layout=tree=>tree.props.onLayout({nativeEvent:{layout:{height:500}}});

test('opening and reopening the index focuses the currently selected chapter every time',()=>{
    const app=harness();let tree=app.render({data,selectedIndex:700,open:false});layout(tree);app.settle();assert.equal(app.scrolls.length,0);
    tree=app.render({data,selectedIndex:700,open:true});app.settle();assert.equal(app.scrolls.at(-1).index,700);assert.equal(app.scrolls.at(-1).viewPosition,0.35);
    app.render({data,selectedIndex:700,open:false});app.settle();
    tree=app.render({data,selectedIndex:820,open:true});app.settle();assert.equal(app.scrolls.at(-1).index,820);
    tree=app.render({data,selectedIndex:821,open:true});app.settle();assert.equal(app.scrolls.at(-1).index,821);
});
test('focus waits for layout, handles delayed chapters and cancels closed sidebar work',()=>{
    const app=harness();let tree=app.render({data:[],selectedIndex:10,open:true});app.settle();assert.equal(app.scrolls.length,0);
    tree=app.render({data,selectedIndex:10,open:true});app.settle();assert.equal(app.scrolls.length,0);
    layout(tree);assert.equal(app.scrolls.at(-1).index,10);
    const before=app.scrolls.length;
    app.render({data,selectedIndex:20,open:true});app.render({data,selectedIndex:20,open:false});app.settle();assert.equal(app.scrolls.length,before);
});
test('long titles have exact measured row heights and out-of-range selections stay safe',()=>{
    const app=harness();let tree=app.render({data,selectedIndex:2000,open:true});layout(tree);app.settle();assert.equal(app.scrolls.at(-1).index,999);
    const row=tree.props.renderItem({item:data[700],index:700});
    const measurement=tree.props.getItemLayout(null,700);
    assert.equal(measurement.length,row.props.style.height);assert.equal(measurement.offset,measurement.length*700);
    tree.props.onScrollToIndexFailed();assert.equal(app.scrolls.at(-1).offset,999*measurement.length);
    tree=app.render({data,selectedIndex:-1,open:true});app.settle();assert.equal(app.scrolls.at(-1).index,0);
});
