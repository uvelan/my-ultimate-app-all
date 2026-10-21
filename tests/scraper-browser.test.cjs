const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const module = { exports: {} };
    new vm.Script(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    }).outputText).runInNewContext({
        module, exports: module.exports, require: name => name in mocks ? mocks[name]
            : name === './flaresolverr' ? load('src/lib/flaresolverr.ts') : require(name),
        URL, Response, setTimeout, clearTimeout, console,
        process: { env: { NODE_ENV: 'development' }, cwd: () => process.cwd() }, ...globals,
    });
    return module.exports;
}

function browserMock() {
    const visits = [], launches = [], waits = [];
    let blocked = true, disconnected, waitHook;
    const page = {
        goto: async url => { visits.push(url); return { status: () => blocked ? 403 : 200 }; },
        title: async () => blocked ? 'Just a moment...' : 'NovelFull',
        bringToFront: async () => {},
        content: async () => '<div id="chapter-content">Chapter text</div>',
        waitForFunction: async (...args) => {
            waits.push(args);
            await waitHook?.();
            if (blocked) throw Error('Chapter did not load');
            return { dispose: async () => {} };
        },
    };
    const browser = { newPage: async () => page, once: (_, fn) => { disconnected = fn; }, close: async () => disconnected?.() };
    const app = load('src/lib/scraper-browser.ts', { puppeteer: { launch: async options => { launches.push(options); return browser; } } });
    return { app, visits, launches, waits, wait: hook => { waitHook = hook; }, solve: () => { blocked = false; }, close: () => browser.close() };
}

test('browser holds the current chapter until readiness and database persistence both finish', async () => {
    const b = browserMock();
    let loaded, saved, waiting, saving;
    const loadGate = new Promise(resolve => { loaded = resolve; });
    const saveGate = new Promise(resolve => { saved = resolve; });
    const waitStarted = new Promise(resolve => { waiting = resolve; });
    const saveStarted = new Promise(resolve => { saving = resolve; });
    try {
        await b.app.openNovelFullBrowser('https://novelfull.net/story.html');
        b.solve();
        b.wait(async () => { waiting(); await loadGate; });
        const first = b.app.fetchInNovelFullBrowser('https://novelfull.net/story/chapter-1.html', {
            chapterSelector: '#chapter-content',
            consume: async response => { assert.match(await response.text(), /Chapter text/); saving(); await saveGate; },
        });
        const second = b.app.fetchInNovelFullBrowser('https://novelfull.net/story/chapter-2.html');
        await waitStarted;
        assert.equal(b.visits.length, 2);
        assert.equal(b.waits[0][1].timeout, 120000);
        loaded();
        await saveStarted;
        assert.equal(b.visits.length, 2);
        saved();
        await Promise.all([first, second]);
        assert.equal(b.visits.length, 3);
    } finally { loaded(); saved(); await b.close(); }
});

test('an unfinished challenge or chapter never reaches the save callback', async () => {
    const b = browserMock();
    let consumed = false;
    try {
        await b.app.openNovelFullBrowser('https://novelfull.net/story.html');
        await assert.rejects(b.app.fetchInNovelFullBrowser('https://novelfull.net/story/chapter-1.html', {
            chapterSelector: '#chapter-content', consume: async () => { consumed = true; },
        }), error => error.code === 'CHAPTER_NOT_READY');
        assert.equal(consumed, false);
        assert.equal(b.visits.at(-1), 'https://novelfull.net/story/chapter-1.html');
    } finally { await b.close(); }
});

test('ordinary scraping never launches a verification browser automatically', async () => {
    const b = browserMock();
    assert.equal(await b.app.fetchInNovelFullBrowser('https://novelfull.net/story.html'), null);
    assert.equal(b.launches.length, 0);
});

test('manual verification session is reused for discovery, AJAX and chapter downloads', async () => {
    const b = browserMock();
    try {
        assert.equal((await b.app.openNovelFullBrowser('https://novelfull.net/story.html')).verificationRequired, true);
        assert.equal(b.launches[0].headless, false);
        await assert.rejects(b.app.fetchInNovelFullBrowser('https://novelfull.net/story/chapter-1.html'),
            error => error.code === 'BROWSER_VERIFICATION_REQUIRED' && error.retryable === false);
        b.solve();
        for (const path of ['/story.html', '/ajax-chapter-option?novelId=1', '/story/chapter-1.html']) {
            const response = await b.app.fetchInNovelFullBrowser(`https://novelfull.net${path}`);
            assert.equal(response.status, 200);
            assert.match(await response.text(), /Chapter text/);
        }
        assert.equal(b.launches.length, 1);
        assert.equal(await b.app.fetchInNovelFullBrowser('https://novelfire.net/book/story'), null);
        assert.equal(await b.app.fetchInNovelFullBrowser('https://novelfull.net/cover.jpg'), null);
    } finally { await b.close(); }
});

test('browser destinations are restricted and verification cannot run in production', async () => {
    const app = load('src/lib/scraper-browser.ts');
    for (const url of ['https://evil.test/', 'http://novelfull.net/', 'https://novelfull.net.evil.test/', 'https://novelfull.com.evil.test/', 'https://user:pass@novelfull.net/', 'https://novelfull.net:8080/']) {
        assert.equal(app.isNovelFullUrl(url), false);
        await assert.rejects(app.openNovelFullBrowser(url), /HTTPS novelfull/);
    }
    const prod = load('src/lib/scraper-browser.ts', {}, { process: { env: { NODE_ENV: 'production' } } });
    await assert.rejects(prod.openNovelFullBrowser('https://novelfull.net/story.html'), /local development server/);
});

test('NovelFull.com and its www host use browser verification and chapter readiness', async () => {
    const b = browserMock();
    try {
        for (const host of ['novelfull.com', 'www.novelfull.com']) {
            assert.equal(b.app.isNovelFullUrl(`https://${host}/absolute-resonance.html`), true);
        }
        const result = await b.app.openNovelFullBrowser('https://novelfull.com/absolute-resonance.html');
        assert.equal(result.verificationRequired, true);
        b.solve();
        let saved = false;
        const response = await b.app.fetchInNovelFullBrowser('https://novelfull.com/absolute-resonance/chapter-31.html', {
            chapterSelector: '#chapter-content', consume: async () => { saved = true; },
        });
        assert.equal(response.status, 200);
        assert.equal(saved, true);
        assert.equal(b.waits.length, 1);
    } finally { await b.close(); }
});

test('shared fetch uses the verified browser and keeps native fetch for other resources', async () => {
    let nativeCalls = 0;
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { isNovelFullUrl: () => false, fetchInNovelFullBrowser: async url => url.includes('novelfull.net') ? new Response('browser') : null },
    }, { fetch: async () => { nativeCalls++; return new Response('native'); } });
    assert.equal(await (await app.fetchScraperResource('https://novelfull.net/story.html')).text(), 'browser');
    assert.equal(await (await app.fetchScraperResource('https://novelfire.net/book/story')).text(), 'native');
    assert.equal(nativeCalls, 1);
});

test('native chapter downloads also await the save callback and propagate save failures', async () => {
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { isNovelFullUrl: () => false, fetchInNovelFullBrowser: async () => null },
    }, { fetch: async () => new Response('native chapter') });
    let saved = '';
    await app.fetchScraperResource('https://novelfire.net/book/chapter-1', {}, {
        consume: async response => { saved = await response.text(); },
    });
    assert.equal(saved, 'native chapter');
    await assert.rejects(app.fetchScraperResource('https://novelfire.net/book/chapter-1', {}, {
        consume: async () => { throw Error('Save failed'); },
    }), /Save failed/);
});

test('browser endpoint requires authentication, loopback address and same-origin user action', async () => {
    let calls = 0, authenticated = true;
    const app = load('src/app/api/novelscraper/browser-session/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: authenticated }) },
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/scraper-browser': {
            isNovelFullUrl: url => url === 'https://novelfull.net/story.html', localBrowserEnabled: () => true,
            openNovelFullBrowser: async () => { calls++; return { verificationRequired: true }; },
        },
    });
    const req = (origin, host = '127.0.0.1') => ({ nextUrl: { hostname: host, origin: `http://${host}:3000` },
        headers: { get: () => origin }, json: async () => ({ sourceUrl: 'https://novelfull.net/story.html' }) });
    assert.equal((await app.POST(req('https://evil.test'))).status, 403);
    assert.equal((await app.POST(req('http://remote.test:3000', 'remote.test'))).status, 403);
    assert.equal((await app.POST(req(null))).status, 403);
    authenticated = false;
    assert.equal((await app.POST(req('http://127.0.0.1:3000'))).status, 401);
    authenticated = true;
    assert.equal((await app.POST(req('http://127.0.0.1:3000'))).status, 200);
    assert.equal(calls, 1);
});
