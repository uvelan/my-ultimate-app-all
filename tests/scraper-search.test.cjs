const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
    const module = { exports: {} };
    new vm.Script(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText).runInNewContext({ module, exports: module.exports,
        require: name => name in mocks ? mocks[name] : require(name),
        URL, Response, AbortSignal, setTimeout, clearTimeout, process: { env: {} }, console: { error() {} }, ...globals,
    });
    return module.exports;
}

test('FlareSolverr stays optional when no endpoint is configured', async () => {
    const app = load('src/lib/flaresolverr.ts', {}, { fetch: () => { throw Error('Unexpected network request'); } });
    assert.equal(await app.fetchThroughFlareSolverr('https://novelfull.com/search?keyword=Story'), null);
});

test('FlareSolverr reuses and serializes a browser session without fixed waits or media downloads', async () => {
    const commands = [];
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const requestStarted = new Promise(resolve => { started = resolve; });
    let requests = 0;
    const app = load('src/lib/flaresolverr.ts', {}, {
        process: { env: { FLARESOLVERR_URL: 'http://solver/v1' } },
        fetch: async (_, options) => {
            const body = JSON.parse(options.body); commands.push(body);
            if (body.cmd !== 'request.get') return Response.json({ status: 'ok' });
            requests++;
            if (requests === 1) { started(); await gate; }
            return Response.json({ status: 'ok', solution: { status: 200, response: '<p>Chapter</p>' } });
        },
    });
    const first = app.fetchThroughFlareSolverr('https://novelfull.com/chapter-1.html');
    const second = app.fetchThroughFlareSolverr('https://novelfull.com/chapter-2.html');
    await requestStarted;
    assert.equal(requests, 1);
    release();
    await Promise.all([first, second]);
    const pages = commands.filter(c => c.cmd === 'request.get');
    assert.equal(commands.filter(c => c.cmd === 'sessions.create').length, 1);
    assert.equal(pages[0].session, pages[1].session);
    assert.equal(pages[0].waitInSeconds, 0);
    assert.equal(pages[0].disableMedia, true);
    await app.closeFlareSolverrSessions();
    assert.equal(commands.at(-1).cmd, 'sessions.destroy');
});

test('an expired solver session is rebuilt once and separate origins get separate sessions', async () => {
    const commands = [];
    let expired = true;
    const app = load('src/lib/flaresolverr.ts', {}, {
        process: { env: { FLARESOLVERR_URL: 'http://solver/v1' } },
        fetch: async (_, options) => {
            const body = JSON.parse(options.body); commands.push(body);
            if (body.cmd !== 'request.get') return Response.json({ status: 'ok' });
            if (expired) { expired = false; return Response.json({ status: 'error', message: 'Session not found' }); }
            return Response.json({ status: 'ok', solution: { status: 200, response: 'Chapter content' } });
        },
    });
    await app.fetchThroughFlareSolverr('https://novelfull.com/chapter-1.html');
    await app.fetchThroughFlareSolverr('https://novelfull.net/chapter-1.html');
    assert.equal(commands.filter(c => c.cmd === 'sessions.create').length, 3);
    const pages = commands.filter(c => c.cmd === 'request.get');
    assert.notEqual(pages[0].session, pages[1].session);
    assert.notEqual(pages[1].session, pages[2].session);
    await app.closeFlareSolverrSessions();
});

test('solver responses preserve rate-limit Retry-After headers', async () => {
    const app = load('src/lib/flaresolverr.ts', {}, {
        process: { env: { FLARESOLVERR_URL: 'http://solver/v1' } },
        fetch: async (_, options) => Response.json(JSON.parse(options.body).cmd === 'request.get'
            ? { status: 'ok', solution: { status: 429, response: 'Slow down', headers: { 'Retry-After': '120' } } }
            : { status: 'ok' }),
    });
    const response = await app.fetchThroughFlareSolverr('https://novelfull.com/chapter-1');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '120');
    await app.closeFlareSolverrSessions();
});

test('known blocked origins skip repeated failed HTTP probes; HTTP 429 never triggers the solver', async () => {
    let native = 0, solver = 0;
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { fetchInNovelFullBrowser: async () => null, isNovelFullUrl: () => true },
        './flaresolverr': { fetchThroughFlareSolverr: async () => { solver++; return new Response('Chapter'); } },
    }, { process: { env: { FLARESOLVERR_URL: 'http://solver/v1' } },
        fetch: async url => { native++; return new Response('', { status: url.includes('.net') ? 429 : 403 }); } });
    await app.fetchScraperResource('https://novelfull.com/chapter-1');
    await app.fetchScraperResource('https://novelfull.com/chapter-2');
    assert.equal(native, 1);
    assert.equal(solver, 2);
    assert.equal((await app.fetchScraperResource('https://novelfull.net/chapter-1')).status, 429);
    assert.equal(solver, 2);
});

test('FlareSolverr returns real HTML and reports unavailable services or unsolved challenges', async () => {
    const make = fetch => load('src/lib/flaresolverr.ts', {}, {
        process: { env: { FLARESOLVERR_URL: 'http://127.0.0.1:8191/v1' } },
        fetch: (url, options) => JSON.parse(options.body).cmd === 'request.get'
            ? fetch(url, options) : Response.json({ status: 'ok' }),
    });
    const app = make(async (endpoint, options) => {
        assert.equal(endpoint, 'http://127.0.0.1:8191/v1');
        assert.equal(JSON.parse(options.body).cmd, 'request.get');
        return Response.json({ status: 'ok', solution: { status: 200, response: '<h1>Search results</h1>' } });
    });
    assert.equal(await (await app.fetchThroughFlareSolverr('https://novelfull.com/search')).text(), '<h1>Search results</h1>');
    await assert.rejects(make(async () => { throw Error('Connection refused'); }).fetchThroughFlareSolverr('https://novelfull.com/search'),
        error => error.code === 'SOLVER_UNAVAILABLE' && error.status === 502);
    await assert.rejects(make(async () => Response.json({ status: 'error', message: 'Challenge timeout' })).fetchThroughFlareSolverr('https://novelfull.com/search'),
        error => error.code === 'SOLVER_FAILED');
    await assert.rejects(make(async () => Response.json({ status: 'ok', solution: { status: 200, response: '<title>Just a moment...</title>' } })).fetchThroughFlareSolverr('https://novelfull.com/search'),
        error => error.code === 'SOURCE_BLOCKED');
});

test('blocked NovelFull requests use FlareSolverr before parsing and saving content', async () => {
    const events = [];
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { fetchInNovelFullBrowser: async () => null, isNovelFullUrl: url => new URL(url).hostname === 'novelfull.com' },
        './flaresolverr': { fetchThroughFlareSolverr: async () => { events.push('solver'); return new Response('Chapter content'); } },
    }, { fetch: async () => { events.push('native'); return new Response('Blocked', { status: 403 }); } });
    await app.fetchScraperResource('https://novelfull.com/story/chapter-1.html', {}, {
        consume: async response => { assert.equal(await response.text(), 'Chapter content'); events.push('saved'); },
    });
    assert.deepEqual(events, ['native', 'solver', 'saved']);
    events.length = 0;
    assert.equal((await app.fetchScraperResource('https://example.test/story')).status, 403);
    assert.deepEqual(events, ['native']);
});

test('an expired manual verification session can fall back to the solver, but save failures cannot', async () => {
    let reason = Object.assign(new Error('Verification expired'), { code: 'BROWSER_VERIFICATION_REQUIRED' });
    let solved = 0;
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { fetchInNovelFullBrowser: async () => { throw reason; }, isNovelFullUrl: () => true },
        './flaresolverr': { fetchThroughFlareSolverr: async () => { solved++; return new Response('Search results'); } },
    });
    assert.equal(await (await app.fetchScraperResource('https://novelfull.com/search')).text(), 'Search results');
    reason = new Error('Database save failed');
    await assert.rejects(app.fetchScraperResource('https://novelfull.com/story/chapter-1.html'), /Database save failed/);
    assert.equal(solved, 1);
});

test('name search reaches both NovelFull domains and ignores sidebar recommendations', async () => {
    const urlHelper = load('src/lib/scraper-url.ts');
    const fixtures = {
        'novelfull.com': '<div class="list-truyen"><div class="row"><img src="/cover.jpg"><h3 class="truyen-title"><a href="/absolute-resonance.html">Absolute Resonance</a></h3></div></div><div class="s-title"><h3><a href="/unrelated.html">Unrelated</a></h3></div>',
        'novelfull.net': '<div class="rank-list"><div class="li"><img src="/cover.jpg"><h3 class="tit"><a href="/absolute-resonance.html">Absolute Resonance</a></h3></div></div><h3><a href="/unrelated.html">Unrelated</a></h3>',
    };
    for (const host of Object.keys(fixtures)) {
        let requested;
        const app = load('src/app/api/novelscraper/search/route.ts', {
            '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true }) },
            '@/lib/prisma': { prisma: { sourceWebsite: { findUnique: async () => ({ url: `https://${host}/` }) } } },
            '@/lib/scraper-url': urlHelper,
            '@/lib/scraper-fetch': { fetchScraperResource: async url => { requested = url; return new Response(fixtures[host]); } },
            'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        });
        const result = await app.POST({ json: async () => ({ siteId: 'source', query: 'Absolute Resonance' }) });
        assert.equal(result.status, 200);
        assert.equal(new URL(requested).searchParams.get('keyword'), 'Absolute Resonance');
        assert.equal(result.body.results.length, 1);
        assert.equal(result.body.results[0].url, `https://${host}/absolute-resonance.html`);
        assert.equal(result.body.results[0].image, `https://${host}/cover.jpg`);
    }
});


test('FreeWebNovel uses the solver after a block and reuses it for later chapters', async () => {
    let native = 0, solved = 0;
    const app = load('src/lib/scraper-fetch.ts', {
        './scraper-browser': { isNovelFullUrl: () => false, fetchInNovelFullBrowser: async () => null },
        './flaresolverr': { fetchThroughFlareSolverr: async () => { solved++; return new Response('Chapter text'); } },
    }, { process: { env: { FLARESOLVERR_URL: 'http://solver/v1' } }, fetch: async () => { native++; return new Response('Challenge', { status: 403 }); } });
    await app.fetchScraperResource('https://freewebnovel.com/novel/story/chapter-1');
    await app.fetchScraperResource('https://freewebnovel.com/novel/story/chapter-2');
    assert.equal(native, 1);
    assert.equal(solved, 2);
    const unrelated = await app.fetchScraperResource('https://freewebnovel.com.evil.test/story');
    assert.equal(unrelated.status, 403);
    assert.equal(solved, 2);
});
