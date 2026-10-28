const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../mobile-app', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, Date, console, require(name) { if (!(name in dependencies)) throw Error(name); return dependencies[name]; } });
 return module.exports;
}
const audio = load('src/lib/listen-audio.ts', {});
const content = load('src/lib/chapter-content.ts', {});
const chapterNarration = load('src/lib/chapter-narration.ts', {});
const kokoro = load('src/lib/kokoro-text.ts', { './chapter-content': content, './chapter-narration': chapterNarration });
const identity = { userId: 'u', bookId: 'b', chapterId: 'c', title: 'Chapter', content: ['Text.'], provider: 'kokoro', voice: 'af_heart', grammarModel: 'OFF', chunkTarget: 1000 };
function harness() {
 const preferences = new Map(), files = new Map(), queued = [];
 const artifact = { key: audio.audioIdentityKey(identity), userId: 'u', bookId: 'b', chapterId: 'c', chapterIndex: 2, voice: 'af_heart', chunkTarget: 1000, uri: 'file:///local-pc-audio/chapter.wav', bytes: 144, sync: { version: 1, title: 'Chapter', paragraphs: ['Text.'], segments: [{ text: 'Text.', start: 0, end: 2 }] } };
 const state = { paired: true, paused: false, status: { phase: 'idle' }, artifacts: [artifact] };
 const bridge = { setAutomatic: async () => true, enqueue: async value => { queued.push(JSON.parse(value)); return true; }, snapshot: async () => JSON.stringify(state), invalidateAudio: async key => { state.artifacts = state.artifacts.filter(a => a.key !== key); } };
 class Emitter { addListener() {} }
 const service = load('src/services/local-sync.service.ts', {
  './book.service': { bookService: { getChapterContent: async () => { throw Error('Unexpected chapter request'); } } },
  'react-native': { NativeModules: { LocalChapterSync: bridge }, Platform: { OS: 'android' }, NativeEventEmitter: Emitter },
  'expo-file-system/legacy': { getInfoAsync: async uri => files.has(uri) ? { exists: true, size: files.get(uri) } : { exists: false } },
  '../lib/storage': { cacheService: { get: key => preferences.get(key), set: (key, value) => preferences.set(key, String(value)) } },
  '../lib/kokoro-text': kokoro, '../lib/chapter-narration': chapterNarration, '../lib/listen-audio': audio, '../lib/narration-sync': { validNarrationSync: value => value?.version === 1 && value.segments?.length > 0 },
 }).localSyncService;
 return { service, artifact, state, files, queued };
}
test('only a complete downloaded chapter with matching identity and size becomes playable', async () => {
 const h = harness();
 assert.equal(await h.service.get(identity), null);
 h.files.set(h.artifact.uri, 143); assert.equal(await h.service.get(identity), null);
 h.files.set(h.artifact.uri, 144); assert.equal((await h.service.get(identity)).uri, h.artifact.uri);
 for (const change of [{ userId: 'other' }, { chapterId: 'other' }, { voice: 'af_bella' }, { content: ['Edited.'] }, { grammarModel: 'gemini' }]) assert.equal(await h.service.get({ ...identity, ...change }), null);
 await h.service.invalidate(identity); assert.equal(await h.service.get(identity), null);
});
test('successful chapter checkpoints remain scoped to book, user, voice and passage settings', async () => {
 const h = harness();
 assert.equal(await h.service.lastSynced('u', 'b', 'af_heart', 1000), 2);
 assert.equal(await h.service.lastSynced('u', 'b', 'af_bella', 1000), -1);
 assert.equal(await h.service.lastSynced('u', 'b', 'af_heart', 400), -1);
 h.service.setSetting('count', 51); assert.equal(h.service.settings().count, 5);
 h.service.setSetting('count', 7); assert.equal(h.service.settings().count, 7);
 assert.equal(h.service.waitingError().code, 'LOCAL_SYNC_PENDING');
});

test('completed chapters play while batch is paused despite changed paragraph representation or target', async () => {
 const h = harness(); h.files.set(h.artifact.uri, 144); h.state.paused = true; h.state.status.phase = 'paused';
 const equivalent = { ...identity, content: 'Text.', chunkTarget: 400 };
 assert.notEqual(audio.audioIdentityKey(equivalent), h.artifact.key);
 const file = await h.service.get(equivalent);
 assert.equal(file.uri, h.artifact.uri); assert.equal(file.key, audio.audioIdentityKey(equivalent));
 assert.equal(await h.service.get({ ...equivalent, content: 'Edited text.' }), null);
 assert.equal(await h.service.get({ ...equivalent, voice: 'af_bella' }), null);
 await h.service.invalidate(equivalent); assert.equal(await h.service.get(equivalent), null);
});

test('automatic sync keeps its window ahead of native background playback without React screen state',async()=>{
 const h=harness();h.service.setSetting('enabled',true);
 const book={id:'b',chapters:Array.from({length:10},(_,index)=>({id:'c'+index,title:'Chapter '+index,content:['Synthetic '+index]}))};
 await h.service.prepareAhead(book,'u',3,'af_heart',1000);
 assert.equal(h.queued.length,1);assert.equal(h.queued[0].length,5);
 assert.deepEqual(h.queued[0].map(item=>item.chapterIndex),[3,4,5,6,7]);
 assert.equal(h.queued[0][3].batchId,'');assert.ok(h.queued[0][4].batchId);
 h.service.setSetting('automatic',false);await h.service.prepareAhead(book,'u',4,'af_heart',1000);assert.equal(h.queued.length,1);
});

test('a one-chapter automatic window requests the next chapter after the native source ends',async()=>{
 const h=harness();h.service.setSetting('enabled',true);h.service.setSetting('count',1);
 const book={id:'b',chapters:Array.from({length:5},(_,index)=>({id:'c'+index,title:'Chapter '+index,content:['Synthetic '+index]}))};
 await h.service.prepareAhead(book,'u',2,'af_heart',1000,()=>true,undefined,true);
 assert.equal(h.queued[0].length,1);assert.equal(h.queued[0][0].chapterIndex,3);assert.equal(h.queued[0][0].playbackIndex,2);
});

test('background prefetch preserves the pending voice rather than copying the currently playing voice',async()=>{
 const h=harness();h.service.setSetting('enabled',true);h.service.setSetting('count',1);
 h.artifact.voice='af_bella';const book={id:'b',chapters:[{id:'new',title:'Upcoming',content:['New text.']}]};
 await h.service.prepareAhead(book,'u',0,'af_heart',1000,()=>true,h.artifact.uri);
 assert.equal(h.queued[0][0].payload.voice,'af_heart');
});
