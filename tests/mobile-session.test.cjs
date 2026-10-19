const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const realAxios = require('../mobile-app/node_modules/axios/dist/node/axios.cjs');

function compile(file, dependencies, globals = {}) {
  const filename = path.resolve(__dirname, '../mobile-app/src/lib/' + file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, process: { env: {} },
    require(name) { if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name); return dependencies[name]; },
    ...globals });
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(config, status = 200, data = {}) { return { config, status, statusText: String(status), headers: {}, data }; }
function failure(config, status) {
  return new realAxios.AxiosError('HTTP ' + status, 'ERR_BAD_REQUEST', config, {}, response(config, status));
}
function sessionHarness({ adapter, refresh } = {}) {
  const tokens = new Map([['accessToken', 'old-access'], ['refreshToken', 'refresh-a']]);
  const writes = []; const cacheDeletes = []; const requests = []; const refreshRequests = [];
  const SecureStore = {
    getItemAsync: async key => tokens.get(key) || null,
    setItemAsync: async (key, value) => { writes.push({ key, value }); tokens.set(key, value); },
    deleteItemAsync: async key => { tokens.delete(key); },
  };
  const axios = {
    create(options) {
      return realAxios.create({ ...options, adapter: async config => {
        requests.push({ url: config.url, token: config.headers.Authorization, retry: config._retry, config });
        if (adapter) return adapter(config, tokens);
        if (config.headers.Authorization !== 'Bearer new-access') throw failure(config, 401);
        return response(config, 200, { ok: true });
      } });
    },
    post: async (url, body, options) => {
      refreshRequests.push({ url, body, options });
      return refresh ? refresh(tokens) : { data: { accessToken: 'new-access' } };
    },
  };
  const helper = compile('api-client.ts', { axios, 'expo-secure-store': SecureStore,
    './storage': { cacheService: { delete: key => cacheDeletes.push(key) } } });
  return { ...helper, tokens, writes, cacheDeletes, requests, refreshRequests };
}

test('missing deployed Android API gives an actionable server-update error without refreshing auth', async () => {
  const harness = sessionHarness({ adapter: config => {
    const error = failure(config, 404);
    error.response.data = '<!DOCTYPE html><html>Not found</html>';
    error.response.headers['content-type'] = 'text/html; charset=utf-8';
    throw error;
  } });
  await assert.rejects(harness.api.get('/mobile/finance', { params: { resource: 'categories' } }), error => {
    assert.match(error.message, /server update/);
    assert.equal(error.response.data.error, error.message);
    return true;
  });
  assert.equal(harness.refreshRequests.length, 0);
});

test('normal JSON record-not-found errors retain the server response', async () => {
  const harness = sessionHarness({ adapter: config => {
    const error = failure(config, 404);
    error.response.data = { error: 'Question not found' };
    error.response.headers['content-type'] = 'application/json';
    throw error;
  } });
  await assert.rejects(harness.api.get('/mobile/interview'), error => {
    assert.equal(error.response.data.error, 'Question not found');
    assert.doesNotMatch(error.message, /server update/);
    return true;
  });
});

test('concurrent mobile401s share one refresh through real Axios interceptor chains', async () => {
  const gate = deferred();
  const harness = sessionHarness({ refresh: () => gate.promise });
  const first = harness.api.get('/books'); const second = harness.api.get('/finance/transactions');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.refreshRequests.length, 1);
  gate.resolve({ data: { accessToken: 'new-access' } });
  await Promise.all([first, second]);
  assert.equal(harness.requests.length, 4);
  assert.equal(harness.requests.filter(request => request.retry && request.token === 'Bearer new-access').length, 2);
  assert.equal(harness.tokens.get('refreshToken'), 'refresh-a');
});

test('a401 for an older access token retries the latest saved token without another refresh', async () => {
  const harness = sessionHarness({ adapter: async (config, tokens) => {
    if (config.headers.Authorization === 'Bearer old-access') {
      tokens.set('accessToken', 'new-access'); throw failure(config, 401);
    }
    return response(config);
  } });
  await harness.api.get('/books');
  assert.equal(harness.refreshRequests.length, 0);
  assert.equal(harness.requests[1].token, 'Bearer new-access');
});

test('auth endpoints,403s and a repeated401 are never refresh loops', async () => {
  for (const [url, status] of [['/auth/login', 401], ['/auth/refresh', 401], ['/books', 403]]) {
    const harness = sessionHarness({ adapter: config => { throw failure(config, status); } });
    await assert.rejects(harness.api.get(url));
    assert.equal(harness.refreshRequests.length, 0);
  }
  const harness = sessionHarness({ adapter: config => { throw failure(config, 401); } });
  await assert.rejects(harness.api.get('/books'));
  assert.equal(harness.refreshRequests.length, 1);
  assert.equal(harness.requests.length, 2);
});

test('offline refresh failures preserve saved credentials and a later request can renew', async () => {
  let refreshCalls = 0;
  const harness = sessionHarness({ refresh: async () => {
    if (++refreshCalls === 1) throw new Error('Network unavailable');
    return { data: { accessToken: 'new-access' } };
  } });
  await assert.rejects(harness.api.get('/books'));
  assert.equal(harness.tokens.get('refreshToken'), 'refresh-a');
  assert.equal(harness.tokens.get('accessToken'), 'old-access');
  assert.deepEqual(harness.cacheDeletes, []);
  await harness.api.get('/books');
  assert.equal(refreshCalls, 2);
});

test('invalid refresh clears credentials and cached profile, and notifies only subscribed listeners', async () => {
  const harness = sessionHarness({ refresh: async () => { throw failure({}, 401); } });
  let notifications = 0;
  const unsubscribe = harness.onSessionExpired(() => notifications++);
  harness.onSessionExpired(() => notifications += 10)();
  await assert.rejects(harness.api.get('/books'));
  assert.equal(harness.tokens.size, 0);
  assert.deepEqual(harness.cacheDeletes, ['session-profile']);
  assert.equal(notifications, 1);
  unsubscribe();
});

test('late successful refresh cannot restore credentials after logout or account switch', async () => {
  for (const switched of [false, true]) {
    const gate = deferred();
    const harness = sessionHarness({ refresh: () => gate.promise });
    const request = harness.api.get('/books');
    await new Promise(resolve => setImmediate(resolve));
    harness.tokens.clear();
    if (switched) { harness.tokens.set('refreshToken', 'refresh-b'); harness.tokens.set('accessToken', 'account-b-access'); }
    gate.resolve({ data: { accessToken: 'old-account-new-access' } });
    await assert.rejects(request);
    assert.equal(harness.tokens.get('accessToken'), switched ? 'account-b-access' : undefined);
    assert.equal(harness.writes.length, 0);
  }
});

test('late invalid refresh from a previous account cannot clear the newly signed-in session', async () => {
  const gate = deferred();
  const harness = sessionHarness({ refresh: () => gate.promise });
  let expired = 0;
  harness.onSessionExpired(() => expired++);
  const request = harness.api.get('/books');
  await new Promise(resolve => setImmediate(resolve));
  harness.tokens.set('refreshToken', 'refresh-b');
  harness.tokens.set('accessToken', 'account-b-access');
  gate.reject(failure({}, 401));
  await assert.rejects(request);
  assert.equal(harness.tokens.get('refreshToken'), 'refresh-b');
  assert.equal(harness.tokens.get('accessToken'), 'account-b-access');
  assert.deepEqual(harness.cacheDeletes, []);
  assert.equal(expired, 0);
});

test('logout during refresh stays logged out when the late refresh returns401', async () => {
  const gate = deferred();
  const harness = sessionHarness({ refresh: () => gate.promise });
  let expired = 0;
  harness.onSessionExpired(() => expired++);
  const request = harness.api.get('/books');
  await new Promise(resolve => setImmediate(resolve));
  await harness.clearSession();
  gate.reject(failure({}, 401));
  await assert.rejects(request);
  assert.equal(harness.tokens.size, 0);
  assert.equal(harness.writes.length, 0);
  assert.equal(expired, 1, 'late401 does not clear or notify the same logged-out session twice');
  assert.deepEqual(harness.cacheDeletes, ['session-profile']);
});

test('aborted401 does not replay the original request after successful refresh', async () => {
  const gate = deferred(); const controller = new AbortController();
  const harness = sessionHarness({ refresh: () => gate.promise });
  const request = harness.api.get('/books', { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  gate.resolve({ data: { accessToken: 'new-access' } });
  await assert.rejects(request);
  assert.equal(harness.requests.length, 1);
});

test('MMKV4 uses createMMKV/remove and serializes all primitive preferences as strings', () => {
  const values = new Map(); let created = 0; const removed = [];
  const native = { set: (key, value) => values.set(key, value), getString: key => values.get(key),
    remove: key => { removed.push(key); values.delete(key); }, clearAll: () => values.clear() };
  const helper = compile('storage.ts', { 'react-native-mmkv': {
    createMMKV: () => { created++; return native; }, MMKV: class { constructor() { throw new Error('Legacy constructor must not be used'); } },
  } });
  helper.cacheService.set('speed', 1.25); helper.cacheService.set('enabled', false);
  assert.equal(created, 1); assert.strictEqual(helper.storage, native);
  assert.equal(values.get('speed'), '1.25'); assert.equal(values.get('enabled'), 'false');
  helper.cacheService.setObject('profile', { id: 'reader' });
  assert.equal(helper.cacheService.getObject('profile').id, 'reader');
  values.set('corrupt', '{ invalid JSON'); assert.equal(helper.cacheService.getObject('corrupt'), null);
  helper.cacheService.delete('profile'); assert.deepEqual(removed, ['profile']);
  helper.cacheService.clearAll(); assert.equal(values.size, 0);
});

test('missing native storage has a usable development fallback and legacy MMKV delete remains supported', () => {
  const fallback = compile('storage.ts', { 'react-native-mmkv': {} });
  fallback.cacheService.set('voice', 'Mia'); assert.equal(fallback.cacheService.get('voice'), 'Mia');
  fallback.cacheService.delete('voice'); assert.equal(fallback.cacheService.get('voice'), undefined);
  let deleted = '';
  const legacy = compile('storage.ts', { 'react-native-mmkv': { MMKV: class {
    set() {} getString() {} clearAll() {} delete(key) { deleted = key; }
  } } });
  legacy.cacheService.delete('old'); assert.equal(deleted, 'old');
});
