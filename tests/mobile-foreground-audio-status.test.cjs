const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('mobile-app/src/hooks/useForegroundAudioStatus.ts','utf8');
function harness(focused=true,backgroundStatus){
 const frames=new Map(),writes=[],effects=[];let serial=0,reads=0,event,appEvent,released=false;
 let live={id:'player',chapter:'A',currentTime:1};
 const AppState={currentState:'active',addEventListener:(_,callback)=>{appEvent=callback;return{remove(){appEvent=null}}}};
 const player={get currentStatus(){if(released)throw Error('released');reads++;return{...live}},addListener:(_,callback)=>{event=callback;return{remove(){event=null}}}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:name=>name==='react'?{useState:initial=>[initial(),value=>writes.push(value)],useEffect:fn=>effects.push(fn)}:{AppState},requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)});
 module.exports.useForegroundAudioStatus(player,focused,backgroundStatus);const stop=effects[0]();
 return {writes,frames,AppState,setLive:value=>{live=value},emit:payload=>event?.(payload),app:state=>{AppState.currentState=state;appEvent?.(state)},flush:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())},stop,reads:()=>reads,release:()=>{released=true}};
}
test('background events produce no UI writes and return applies one current native snapshot',()=>{
 const h=harness();h.flush();h.writes.length=0;h.app('background');const before=h.reads();
 for(let i=0;i<200;i++)h.emit({chapter:'obsolete-'+i,localChapterId:'fixture-'+i});
 assert.equal(h.frames.size,0);assert.equal(h.writes.length,0);assert.equal(h.reads(),before);
 h.setLive({chapter:'D',currentTime:37});h.app('active');for(let i=0;i<200;i++)h.emit({chapter:'A',currentTime:0});
 assert.equal(h.frames.size,1);h.flush();assert.equal(h.writes.length,1);assert.equal(h.writes[0].chapter,'D');assert.equal(h.writes[0].currentTime,37);h.stop();
});
test('blurred screens do not subscribe, and stopped surfaces cannot publish scheduled updates',()=>{
 const hidden=harness(false);assert.equal(hidden.frames.size,0);hidden.stop();
 const h=harness();const queued=[...h.frames.values()][0];h.stop();const before=h.reads();queued();assert.equal(h.reads(),before);assert.equal(h.writes.length,0);
});
test('backgrounding cancels the scheduled frame and a released player cannot throw into rendering',()=>{
 const h=harness();h.app('background');assert.equal(h.frames.size,0);h.release();h.app('active');assert.doesNotThrow(()=>h.flush());assert.equal(h.writes.length,0);h.stop();
});

test('completion survives foreground coalescing without accepting a stale end event',()=>{
 const h=harness();h.flush();h.writes.length=0;
 h.setLive({chapter:'C',playbackState:'ready',playing:true,isLoaded:true,duration:20,currentTime:5,didJustFinish:false});
 h.emit({chapter:'A',didJustFinish:true});h.flush();assert.equal(h.writes.at(-1).didJustFinish,false);
 h.setLive({chapter:'C',playbackState:'ended',playing:false,isLoaded:true,duration:20,currentTime:20,didJustFinish:false});
 h.emit({didJustFinish:true});h.flush();assert.equal(h.writes.at(-1).didJustFinish,true);h.stop();
});

test('non-PC audio still receives background completion controls without rendering the hidden screen',()=>{
 const controls=[];const h=harness(true,{current:status=>controls.push(status)});h.flush();h.writes.length=0;h.app('background');
 h.setLive({playbackState:'ended',playing:false,isLoaded:true,currentTime:20,duration:20,didJustFinish:false});h.emit({didJustFinish:true});
 assert.equal(controls.length,1);assert.equal(controls[0].didJustFinish,true);assert.equal(h.writes.length,0);h.stop();
});
