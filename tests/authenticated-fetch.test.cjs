const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const origin = 'https://reader.test';
function loadFetch(fetch, { browser = true } = {}) {
  const filename = path.resolve(__dirname, '../src/lib/authenticated-fetch.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const globals = { module, exports: module.exports, fetch, URL, Request, Response, Headers, AbortController, AbortSignal, DOMException };
  if (browser) globals.window = { location: { origin, href: `${origin}/listen/book-1` } };
  new vm.Script(source, { filename }).runInNewContext(globals);
  return module.exports.authenticatedFetch;
}
function requestUrl(input) { return input instanceof Request ? input.url : new URL(String(input), origin).href; }
function isRefresh(input) { return requestUrl(input) === `${origin}/api/auth/refresh`; }
function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

test('an expired app API request refreshes its session and retries the original body and options', async () => {
  const attempts = [];
  const refreshes = [];
  const controller = new AbortController();
  const authenticatedFetch = loadFetch(async (input, init) => {
    if (isRefresh(input)) { refreshes.push(init); return Response.json({ accessToken: 'renewed' }); }
    attempts.push({
      url: input.url, method: input.method, headers: new Headers(input.headers),
      body: await input.text(), credentials: input.credentials, signal: input.signal,
    });
    return attempts.length === 1 ? new Response('expired', { status: 401 }) : new Response('updated');
  });
  const request = new Request(`${origin}/api/books/book-1`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Test': 'original-header' },
    body: JSON.stringify({ title: 'New title' }), credentials: 'same-origin', signal: controller.signal,
  });
  const result = await authenticatedFetch(request);
  assert.equal(await result.text(), 'updated');
  assert.equal(attempts.length, 2);
  for (const attempt of attempts) {
    assert.equal(attempt.url, request.url);
    assert.equal(attempt.method, 'PATCH');
    assert.equal(attempt.headers.get('X-Test'), 'original-header');
    assert.equal(attempt.body, '{"title":"New title"}');
    assert.equal(attempt.credentials, 'same-origin');
  }
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].method, 'POST');
  assert.equal(refreshes[0].credentials, 'same-origin');
  controller.abort();
  assert.ok(attempts.every(attempt => attempt.signal.aborted), 'both attempts retain caller cancellation');
});

test('concurrent expired requests share a refresh and each retry after it succeeds', async () => {
  const started = deferred();
  const finish = deferred();
  let refreshed = false;
  let refreshCount = 0;
  const attempts = new Map();
  const authenticatedFetch = loadFetch(async input => {
    if (isRefresh(input)) {
      refreshCount++;
      started.resolve();
      await finish.promise;
      refreshed = true;
      return new Response(null, { status: 200 });
    }
    const url = requestUrl(input);
    attempts.set(url, (attempts.get(url) || 0) + 1);
    return new Response(refreshed ? 'ready' : 'expired', { status: refreshed ? 200 : 401 });
  });
  const requests = [authenticatedFetch('/api/tts?chapterId=1'), authenticatedFetch('/api/tts?chapterId=2')];
  await started.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshCount, 1);
  assert.deepEqual([...attempts.values()], [1, 1]);
  finish.resolve();
  assert.deepEqual((await Promise.all(requests)).map(response => response.status), [200, 200]);
  assert.deepEqual([...attempts.values()], [2, 2]);
});

test('aborting one waiting request leaves shared session refresh available to another', async () => {
  const started = deferred();
  const finish = deferred();
  const controller = new AbortController();
  let refreshed = false;
  let refreshCount = 0;
  const protectedUrls = [];
  const authenticatedFetch = loadFetch(async input => {
    if (isRefresh(input)) {
      refreshCount++;
      started.resolve();
      await finish.promise;
      refreshed = true;
      return new Response();
    }
    protectedUrls.push(input.url);
    return new Response(null, { status: refreshed ? 200 : 401 });
  });
  const aborted = authenticatedFetch('/api/tts?chapterId=old', { signal: controller.signal });
  const assertion = assert.rejects(aborted, error => error.name === 'AbortError');
  const active = authenticatedFetch('/api/tts?chapterId=current');
  await started.promise;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assertion; // Cancellation must settle before the refresh completes.
  assert.equal(refreshCount, 1);
  finish.resolve();
  assert.equal((await active).status, 200);
  assert.equal(protectedUrls.filter(url => url.includes('chapterId=old')).length, 1);
  assert.equal(protectedUrls.filter(url => url.includes('chapterId=current')).length, 2);
});

test('403 responses, other origins, non-API pages, and auth endpoints do not trigger refresh', async t => {
  for (const [input, status] of [
    ['/api/tts', 403], ['https://external.test/api/tts', 401], ['/finance/dashboard', 401],
    ['/api/auth/login', 401], ['/api/auth/refresh', 401], ['/api/tts', 200],
  ]) {
    await t.test(`${input} ${status}`, async () => {
      const calls = [];
      const authenticatedFetch = loadFetch(async (request, init) => { calls.push({ request, init }); return new Response(null, { status }); });
      assert.equal((await authenticatedFetch(input)).status, status);
      assert.equal(calls.length, 1);
      assert.equal(requestUrl(calls[0].request), new URL(input, origin).href);
    });
  }
});

test('a second 401 ends the retry without entering a refresh loop', async () => {
  let requests = 0;
  let refreshes = 0;
  const authenticatedFetch = loadFetch(async input => {
    if (isRefresh(input)) { refreshes++; return new Response(); }
    requests++;
    return new Response('still unauthorized', { status: 401 });
  });
  assert.equal((await authenticatedFetch('/api/tts')).status, 401);
  assert.equal(requests, 2);
  assert.equal(refreshes, 1);
});

test('failed refresh returns the original unauthorized response and permits a later new refresh', async t => {
  for (const failure of ['unauthorized', 'network']) {
    await t.test(failure, async () => {
      let requests = 0;
      let refreshes = 0;
      const authenticatedFetch = loadFetch(async input => {
        if (isRefresh(input)) {
          refreshes++;
          if (failure === 'network') throw new Error('offline');
          return new Response(null, { status: 401 });
        }
        requests++;
        return new Response('original unauthorized', { status: 401 });
      });
      for (let index = 0; index < 2; index++) {
        const response = await authenticatedFetch('/api/tts');
        assert.equal(response.status, 401);
        assert.equal(await response.text(), 'original unauthorized');
      }
      assert.equal(requests, 2);
      assert.equal(refreshes, 2);
    });
  }
});

test('server-side usage passes through without attempting browser session renewal', async () => {
  let calls = 0;
  const authenticatedFetch = loadFetch(async () => { calls++; return new Response(null, { status: 401 }); }, { browser: false });
  assert.equal((await authenticatedFetch(`${origin}/api/tts`)).status, 401);
  assert.equal(calls, 1);
});
