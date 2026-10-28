const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, require: name => mocks[name], ...globals });
    return module.exports;
}
function hookHarness() {
    const listeners = {}, refs = [], requests = [], applied = [];
    let setup, now = 0, respond;
    const pending = new Promise(resolve => respond = resolve);
    const document = { visibilityState: 'visible', addEventListener: (name, cb) => listeners[name] = cb, removeEventListener() {} };
    const window = { addEventListener: (name, cb) => listeners[name] = cb, removeEventListener() {} };
    const { useBookProgressSync } = load('src/hooks/useBookProgressSync.ts', {
        react: { useRef: value => { const ref = { current: value }; refs.push(ref); return ref; }, useEffect: cb => setup = cb },
        '@/lib/authenticated-fetch': { authenticatedFetch: async (url, options) => { requests.push({ url, options }); return pending; } },
    }, { document, window, Date: { now: () => now }, AbortController, AbortSignal });
    useBookProgressSync('book', 8, false, (...args) => applied.push(args));
    const cleanup = setup(); now = 2000;
    return { listeners, refs, requests, applied, cleanup, document, respond: chapter => respond({ ok: true, json: async () => ({ chapterId: chapter, sentenceId: 3 }) }) };
}
test('returning to the web view fetches uncached server progress and accepts an earlier chapter', async () => {
    const app = hookHarness(); const request = app.listeners.focus(); app.respond(2); await request;
    assert.equal(app.requests[0].url, '/api/books/book?progress=1');
    assert.equal(app.requests[0].options.cache, 'no-store');
    assert.deepEqual(app.applied, [[2, 3]]);
});
test('a focus response cannot replace a new local selection or active playback', async () => {
    for (const field of ['chapterIndex', 'playing']) {
        const app = hookHarness(); const request = app.listeners.focus();
        app.refs[0].current[field] = field === 'chapterIndex' ? 5 : true;
        app.respond(2); await request; assert.deepEqual(app.applied, []);
    }
});
test('unmount cancels a pending progress response', async () => {
    const app = hookHarness(); const request = app.listeners.focus(); app.cleanup(); app.respond(2); await request;
    assert.deepEqual(app.applied, []);
});
test('the lightweight progress endpoint requires authentication and does not fetch chapter content', async () => {
    for (const authenticated of [false, true]) {
        const queries = [];
        class NextResponse extends Response { static json(data, options) { return new NextResponse(JSON.stringify(data), options); } }
        const route = load('src/app/api/books/[id]/route.ts', {
            'next/server': { NextResponse }, '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: authenticated, user: authenticated ? { id: 'user' } : null }) },
            '@/lib/prisma': { prisma: { book: { findUnique: async query => { queries.push(query); return { id: 'book', chapterId: 2, sentenceId: 3 }; } } } },
            'fs/promises': {}, path: {},
        }, { Response });
        const response = await route.GET({ nextUrl: new URL('https://app.test/api/books/book?progress=1') }, { params: Promise.resolve({ id: 'book' }) });
        assert.equal(response.status, authenticated ? 200 : 401);
        if (authenticated) {
            assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
            assert.equal(queries[0].select.chapterId, true); assert.equal(queries[0].include, undefined);
        } else assert.equal(queries.length, 0);
    }
});
