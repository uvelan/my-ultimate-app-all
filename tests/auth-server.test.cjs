const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function auth({ cookie, authorization, tokens = {} } = {}) {
    const module = { exports: {} };
    const verified = [];
    new vm.Script(ts.transpileModule(fs.readFileSync('src/lib/auth-server.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText).runInNewContext({
        module, exports: module.exports, require(name) {
            if (name === 'next/headers') return { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }), headers: async () => ({ get: () => authorization }) };
            if (name === '@/lib/auth-node') return { verifyAccessToken: token => { verified.push(token); return tokens[token] || null; } };
            throw Error(name);
        },
    });
    return { run: module.exports.verifyAuth, verified };
}
test('fresh Android Bearer token overrides stale cookie', async () => {
    const app = auth({ cookie: 'stale', authorization: 'Bearer fresh', tokens: { fresh: { id: 'mobile' } } });
    const result = await app.run();
    assert.equal(result.isAuthenticated, true);
    assert.equal(result.user.id, 'mobile');
    assert.deepEqual(app.verified, ['fresh']);
});
test('explicit Bearer selection cannot fall back into another cookie account', async () => {
    for (const authorization of ['Bearer invalid', 'Bearer', 'Bearer   ']) {
        const app = auth({ cookie: 'web', authorization, tokens: { web: { id: 'different-account' } } });
        assert.equal((await app.run()).isAuthenticated, false);
        assert.ok(!app.verified.includes('web'));
    }
});
test('web cookie authentication continues working without Bearer credentials', async () => {
    const app = auth({ cookie: 'web', tokens: { web: { id: 'web-user' } } });
    assert.equal((await app.run()).user.id, 'web-user');
});
test('Bearer scheme casing and spacing follow HTTP authentication semantics', async () => {
    const app = auth({ authorization: 'bearer   token  ', tokens: { token: { id: 'native' } } });
    assert.equal((await app.run()).user.id, 'native');
});
test('missing credentials are rejected without token verification', async () => {
    const app = auth();
    assert.equal((await app.run()).isAuthenticated, false);
    assert.equal(app.verified.length, 0);
});
