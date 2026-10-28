const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const { audiobookLoadError, validateAudiobook } = require('./helpers/audiobook-load.cjs');
function harness(get) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/hooks/useListenChapters.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => name === 'react' ? {} : name.includes('api-client') ? { api: { get } } : { audiobookLoadError }, Error, Map });
  return module.exports;
}
const book = () => ({ id: 'book', chapters: Array.from({ length: 2000 }, (_, index) => ({ id: 'chapter-' + index, order: index + 10, title: 'Chapter ' + index })) });
test('large audiobooks fetch only five chapter bodies using server chapter order', async () => {
  const urls = [];
  const { loadListenChapters } = harness(async (url, options) => {
    urls.push(url); assert.ok(options.signal);
    const order = Number(url.split('/').at(-1));
    return { data: { id: 'chapter-' + (order - 10), content: ['Text ' + order] } };
  });
  const loaded = await loadListenChapters(book(), 500, new AbortController().signal);
  assert.deepEqual(urls, [510, 511, 512, 513, 514].map(order => '/books/book/chapters/' + order));
  assert.equal(loaded.chapters[500].content[0], 'Text 510');
  assert.equal(loaded.chapters[499].content, undefined);
  assert.equal(loaded.chapters[505].content, undefined);
});
test('a failed upcoming chapter does not block the selected chapter', async () => {
  const { loadListenChapters } = harness(async url => {
    const order = Number(url.split('/').at(-1));
    if (order !== 10) throw new Error('Prefetch unavailable');
    return { data: { id: 'chapter-0', content: ['Ready'] } };
  });
  const loaded = await loadListenChapters(book(), 0, new AbortController().signal);
  assert.equal(loaded.chapters[0].content[0], 'Ready');
  assert.equal(loaded.chapters[1].content, undefined);
});
test('selected chapter failures can be retried and never return missing or wrong content', async () => {
  let fail = true;
  const { loadListenChapters } = harness(async url => {
    if (fail) throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    const order = Number(url.split('/').at(-1));
    return { data: { id: 'chapter-' + (order - 10), content: ['Ready'] } };
  });
  await assert.rejects(loadListenChapters(book(), 0, new AbortController().signal), /timeout/);
  fail = false;
  assert.equal((await loadListenChapters(book(), 0, new AbortController().signal)).chapters[0].content[0], 'Ready');
  const invalid = harness(async () => ({ data: { id: 'wrong', content: [] } }));
  await assert.rejects(invalid.loadListenChapters(book(), 0, new AbortController().signal), /chapter list changed/);
});
test('cancelled chapter downloads cannot publish a book', async () => {
  const controller = new AbortController();
  const { loadListenChapters } = harness(async () => { controller.abort(); return { data: {} }; });
  await assert.rejects(loadListenChapters(book(), 0, controller.signal), /cancelled/);
});
test('timeouts, invalid responses and programming errors are not all described as a connection failure', () => {
  assert.match(audiobookLoadError({ code: 'ECONNABORTED' }), /timed out/);
  assert.match(audiobookLoadError({ code: 'ERR_NETWORK' }), /connection/);
  assert.equal(audiobookLoadError(new Error('Invalid data')), 'Invalid data');
  assert.throws(() => validateAudiobook('<html>Sign in</html>'), /invalid book response/);
  assert.throws(() => validateAudiobook({ id: 'book', chapters: [] }), /no chapters/);
});

function hookHarness(get) {
  const slots = [], effects = []; let cursor = 0;
  const react = {
    useState: initial => { const position = cursor++; if (!(position in slots)) slots[position] = initial;
      return [slots[position], value => { slots[position] = typeof value === 'function' ? value(slots[position]) : value; }]; },
    useEffect: (callback, deps) => { const position = cursor++, prior = effects[position];
      if (!prior || deps.some((value, index) => value !== prior.deps[index])) { prior?.cleanup?.(); effects[position] = { deps, cleanup: callback() }; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/hooks/useListenChapters.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => name === 'react' ? react : name.includes('api-client') ? { api: { get } } : { audiobookLoadError }, AbortController, Error, Map });
  let current = book(), selected = 0; const updates = [];
  const setBook = update => { current = update(current); updates.push(current); };
  return { render: () => { cursor = 0; return module.exports.useListenChapters(current, selected, setBook); },
    select: index => { selected = index; }, updates,
    unmount: () => { effects.forEach(effect => effect?.cleanup?.()); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('chapter hook exits loading after failure and Retry recovers the selected chapter', async () => {
  let fail = true;
  const app = hookHarness(async url => {
    if (fail) throw Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' });
    const order = Number(url.split('/').at(-1));
    return { data: { id: 'chapter-' + (order - 10), content: ['Ready'] } };
  });
  assert.equal(app.render().loading, true); await flush();
  const failed = app.render(); assert.equal(failed.loading, false); assert.match(failed.error, /timed out/);
  fail = false; failed.retry(); assert.equal(app.render().loading, true); await flush();
  assert.equal(app.render().loading, false); assert.equal(app.render().error, null);
  assert.equal(app.updates[0].chapters[0].content[0], 'Ready'); app.unmount();
});
test('chapter hook aborts obsolete requests and ignores late results after switching or leaving', async () => {
  const pending = [];
  const app = hookHarness((url, options) => new Promise(resolve => pending.push({ url, options, resolve })));
  app.render(); app.select(100); app.render();
  assert.equal(pending[0].options.signal.aborted, true);
  const complete = item => { const order = Number(item.url.split('/').at(-1)); item.resolve({ data: { id: 'chapter-' + (order - 10), content: ['Late'] } }); };
  pending.slice(0, 5).forEach(complete); await flush(); assert.equal(app.updates.length, 0);
  app.unmount(); assert.equal(pending[5].options.signal.aborted, true);
  pending.slice(5).forEach(complete); await flush(); assert.equal(app.updates.length, 0);
});
