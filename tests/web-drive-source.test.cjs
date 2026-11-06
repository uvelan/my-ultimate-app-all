const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(fetch) {
 const slots = [], effects = [], storage = new Map();
 let cursor = 0, pending = [], dirty = false, args = [true, 'user', 'book', 'first'], value;
 const react = {
  useState(initial) {
   const i = cursor++;
   if (!(i in slots)) slots[i] = initial;
   return [slots[i], next => { const v = typeof next === 'function' ? next(slots[i]) : next;
    if (!Object.is(v, slots[i])) { slots[i] = v; dirty = true; } }];
  },
  useEffect(run, deps) {
   const i = cursor++, before = effects[i];
   if (!before || deps.some((v, index) => !Object.is(v, before.deps[index]))) {
    pending.push(() => { before?.cleanup?.(); effects[i] = { deps, cleanup: run() }; });
   }
  },
 };
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync('src/hooks/useDriveAudio.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
 }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, AbortController, URLSearchParams,
  window: {}, localStorage: { getItem: key => storage.get(key), setItem: (key, v) => storage.set(key, v) },
  setInterval: () => 1, clearInterval() {},
  require: name => name === 'react' ? react : name === '@/lib/authenticated-fetch'
   ? { authenticatedFetch: fetch } : {},
 });
 function render() { cursor = 0; dirty = false; pending = []; value = module.exports.useDriveAudio(...args); pending.forEach(run => run()); }
 return {
  get current() { return value; },
  async settle(next) {
   if (next) args = next;
   render();
   for (let i = 0; i < 15; i++) { await new Promise(resolve => setImmediate(resolve)); if (dirty) render(); }
   return value;
  },
  stop() { effects.forEach(effect => effect?.cleanup?.()); },
  storage,
 };
}
const response = value => Promise.resolve({ ok: true, json: async () => value });

test('Drive source streams a scoped URL, changes voice, and stops preparing when deselected', async () => {
 const calls = [];
 const h = harness((url, init) => {
  calls.push({ url, init });
  return response(url.includes('op=status') ? { configured: true, connected: true, clientId: 'public' }
   : { url: '/api/drive/stream?ticket=opaque', sync: { title: 'Chapter', paragraphs: ['Text'], segments: [] } });
 });
 h.storage.set('web-drive-folder-user-book', JSON.stringify({ id: 'folder', name: 'Book' }));
 await h.settle();
 assert.equal(h.current.url, '/api/drive/stream?ticket=opaque');
 assert.ok(calls.some(c => c.url.includes('chapterId=first') && c.url.includes('voice=af_bella')));
 h.current.setVoice('af_heart'); await h.settle();
 assert.ok(calls.some(c => c.url.includes('voice=af_heart')));
 await h.settle([true, 'user', 'book', 'second']);
 assert.ok(calls.some(c => c.url.includes('chapterId=second')));
 const count = calls.length;
 await h.settle([false, 'user', 'book', 'second']);
 assert.equal(h.current.url, '');
 assert.equal(calls.length, count);
 assert.ok(calls.filter(c => c.url.includes('op=prepare')).every(c => c.init.signal.aborted));
 h.stop();
});

test('a late Drive preparation cannot replace the newly selected chapter', async () => {
 let finishFirst, firstSignal;
 const h = harness((url, init) => {
  if (url.includes('op=status')) return response({ configured: true, connected: true, clientId: 'public' });
  if (url.includes('chapterId=first')) {
   firstSignal = init.signal;
   return new Promise(resolve => { finishFirst = () => resolve({ ok: true, json: async () => ({ url: '/old', sync: {} }) }); });
  }
  return response({ url: '/new', sync: {} });
 });
 h.storage.set('web-drive-folder-user-book', JSON.stringify({ id: 'folder', name: 'Book' }));
 await h.settle();
 await h.settle([true, 'user', 'book', 'second']);
 assert.equal(firstSignal.aborted, true);
 finishFirst(); await h.settle();
 assert.equal(h.current.url, '/new');
 h.stop();
});

test('a plain text gateway timeout is retryable and never surfaces a JSON parser error', async () => {
 let failed = false;
 const h = harness(url => {
  if (url.includes('op=status')) return response({ configured: true, connected: true, clientId: 'public' });
  if (failed) return response({ url: '/api/drive/stream?ticket=opaque', sync: {} });
  failed = true;
  return Promise.resolve(new Response('An error occurred with your deployment', { status: 504 }));
 });
 h.storage.set('web-drive-folder-user-book', JSON.stringify({ id: 'folder', name: 'Book' }));
 await h.settle();
 assert.match(h.current.error, /timed out.*Retry/);
 assert.equal(h.current.busy, false);
 h.current.retry();
 await h.settle();
 assert.equal(h.current.error, '');
 assert.match(h.current.url, /ticket=opaque/);
 h.stop();
});
