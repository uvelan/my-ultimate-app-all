const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const USER_ID = '507f1f77bcf86cd799439011';
const activeUser = { id: USER_ID, email: 'reader@example.test', role: 'USER', isActive: true };

function harness({ cookieToken = 'refresh-cookie', payload = { id: USER_ID }, user = activeUser, nodeEnv = 'production' } = {}) {
  const filename = path.resolve(__dirname, '../src/app/api/auth/refresh/route.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = { verified: [], lookups: [], signed: [], cookies: [] };
  const cookieStore = {
    get(name) { return name === 'refreshToken' && cookieToken != null ? { value: cookieToken } : undefined; },
    set(...args) { calls.cookies.push(args); },
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    'next/headers': { cookies: async () => cookieStore },
    '@/lib/auth-node': {
      verifyRefreshToken(token) { calls.verified.push(token); return payload; },
      generateAccessToken(value) { calls.signed.push(value); return 'renewed-access-token'; },
    },
    '@/lib/prisma': { prisma: { user: { findUnique: async args => { calls.lookups.push(args); return user; } } } },
  };
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({
    module, exports: module.exports, process: { env: { NODE_ENV: nodeEnv } },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unmocked auth dependency: ${name}`);
    },
  });
  return {
    calls,
    post: body => module.exports.POST(new Request('https://reader.test/api/auth/refresh', {
      method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    })),
  };
}

test('refresh tokens issued by login renew an access token with the identity verifyAuth expects', async () => {
  const app = harness();
  const response = await app.post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accessToken: 'renewed-access-token' });
  assert.deepEqual(app.calls.verified, ['refresh-cookie']);
  assert.equal(app.calls.lookups.length, 1);
  assert.equal(app.calls.lookups[0].where.id, USER_ID);
  assert.equal(app.calls.signed.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(app.calls.signed[0])), { id: USER_ID, email: activeUser.email, role: activeUser.role });
  assert.equal(app.calls.cookies.length, 1);
  const [name, token, options] = app.calls.cookies[0];
  assert.equal(name, 'accessToken');
  assert.equal(token, 'renewed-access-token');
  assert.deepEqual(Object.fromEntries(Object.entries(options)), {
    httpOnly: true, secure: true, sameSite: 'strict', maxAge: 15 * 60, path: '/',
  });
});

test('legacy userId refresh claims still work, while current id takes precedence', async t => {
  for (const payload of [{ userId: USER_ID }, { id: USER_ID, userId: '507f1f77bcf86cd799439012' }]) {
    await t.test(Object.hasOwn(payload, 'id') ? 'current id preferred' : 'legacy userId', async () => {
      const app = harness({ payload });
      assert.equal((await app.post()).status, 200);
      assert.equal(app.calls.lookups[0].where.id, USER_ID);
      assert.equal(app.calls.signed[0].id, USER_ID);
    });
  }
});

test('missing, invalid, and malformed claims are rejected before a database lookup', async t => {
  for (const payload of [null, {}, { id: '' }, { id: 'not-a-mongo-id' }, { id: 123 }, { userId: 'a'.repeat(23) }, { id: 'z'.repeat(24) }, 'not-an-object']) {
    await t.test(JSON.stringify(payload), async () => {
      const app = harness({ payload });
      assert.equal((await app.post()).status, 401);
      assert.equal(app.calls.lookups.length, 0);
      assert.equal(app.calls.signed.length, 0);
      assert.equal(app.calls.cookies.length, 0);
    });
  }
});

test('missing and inactive accounts cannot renew access', async t => {
  for (const user of [null, { ...activeUser, isActive: false }]) {
    await t.test(user ? 'inactive' : 'missing', async () => {
      const app = harness({ user });
      assert.equal((await app.post()).status, 401);
      assert.equal(app.calls.lookups.length, 1);
      assert.equal(app.calls.signed.length, 0);
      assert.equal(app.calls.cookies.length, 0);
    });
  }
});

test('the existing refresh body fallback works when a cookie is absent', async () => {
  const app = harness({ cookieToken: null });
  assert.equal((await app.post({ refreshToken: 'body-refresh-token' })).status, 200);
  assert.deepEqual(app.calls.verified, ['body-refresh-token']);
});

test('the HttpOnly cookie takes precedence over a body token', async () => {
  const app = harness();
  assert.equal((await app.post({ refreshToken: 'other-body-token' })).status, 200);
  assert.deepEqual(app.calls.verified, ['refresh-cookie']);
});

test('absent or non-string token inputs are rejected before signature verification', async t => {
  for (const body of [undefined, {}, { refreshToken: 123 }, { refreshToken: [] }]) {
    await t.test(JSON.stringify(body) || 'empty body', async () => {
      const app = harness({ cookieToken: null });
      assert.equal((await app.post(body)).status, 401);
      assert.equal(app.calls.verified.length, 0);
      assert.equal(app.calls.lookups.length, 0);
    });
  }
});

test('superusers keep the existing one-day access lifetime and development cookie settings', async () => {
  const app = harness({ user: { ...activeUser, role: 'SUPERUSER' }, nodeEnv: 'development' });
  assert.equal((await app.post()).status, 200);
  assert.equal(app.calls.signed[0].role, 'SUPERUSER');
  const options = app.calls.cookies[0][2];
  assert.equal(options.maxAge, 24 * 60 * 60);
  assert.equal(options.secure, false);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'strict');
  assert.equal(options.path, '/');
});
