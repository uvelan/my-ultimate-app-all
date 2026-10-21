const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new vm.Script(code, { filename: file }).runInNewContext({
        module, exports: module.exports,
        require: name => name in mocks ? mocks[name]
            : name === './chapter-paragraphs' ? load('src/lib/chapter-paragraphs.ts') : name === '@/lib/freewebnovel' ? load('src/lib/freewebnovel.ts') : name.endsWith('/scraper-jobs') ? jobs
            : (name === '@/lib/scraper-fetch' || name === './scraper-fetch') && globals.fetch
                ? { fetchScraperResource: async (url, options, pageOptions = {}) => {
                    const response = await globals.fetch(url, options);
                    if (pageOptions.consume) await pageOptions.consume(response.clone());
                    return response;
                } } : require(name),
        URL, Response, AbortController, Buffer, process, setTimeout, clearTimeout, setInterval, clearInterval,
        console: { info() {}, warn() {}, error() {} }, ...globals,
    });
    return module.exports;
}
const urls = load('src/lib/scraper-url.ts');
const jobs = load('src/lib/scraper-jobs.ts', { './prisma': { prisma: {} } });
test('source matching accepts domains and full URLs and rejects lookalike hosts', () => {
    for (const source of ['example.test', 'www.example.test', 'https://example.test/', 'https://www.example.test/']) {
        assert.equal(urls.matchesScraperSource('https://example.test/book/story', source), true);
        assert.equal(urls.matchesScraperSource('https://example.test.evil.test/book', source), false);
    }
    assert.equal(urls.matchesScraperSource('file:///book', 'example.test'), false);
    assert.equal(urls.scraperSourceUrl('example.test').origin, 'https://example.test');
});

function linkRoute(html, existing = null, options = {}) {
    const scheduled = [], saved = [], syncs = [];
    const route = load('src/app/api/novelscraper/scrape-link/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { id: 'bearer-user' } }) },
        'next/server': { after: fn => scheduled.push(fn), NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/scraper-url': urls,
        '@/lib/chapter-scraper': { startNovelSyncAsync: async (...args) => syncs.push(args) },
        '@/lib/prisma': { prisma: {
            sourceWebsite: { findUnique: async () => ({ url: options.source || 'https://www.example.test/', tagsToExtract: { chapters: options.selector || '.chapters a' } }) },
            novel: { findUnique: async () => existing, upsert: async args => { saved.push(args); return { id: 'novel-id', ...args.create }; } },
        } },
    }, { fetch: options.fetch || (async () => new Response(html)) });
    return { ...route, scheduled, saved, syncs };
}
const request = body => ({ json: async () => ({ siteId: 'site', sourceUrl: 'https://example.test/book/story/', ...body }) });

test('submitting a link schedules chapter scraping with authenticated user and requested range', async () => {
    const app = linkRoute('<h1>Story</h1><div class="chapters"><a href="one">One</a><a href="two">Two</a></div>');
    const res = await app.POST(request({ fromChapter: '2', toChapter: '2' }));
    assert.equal(res.status, 201);
    assert.equal(app.saved[0].create.status, 'SCRAPING');
    assert.equal(app.saved[0].create.allChapters.length, 1);
    assert.equal(app.saved[0].create.allChapters[0].url, 'https://example.test/book/story/two');
    assert.equal(app.syncs.length, 0);
    await app.scheduled[0]();
    assert.deepEqual(app.syncs, [['novel-id', 'bearer-user']]);
});

test('empty chapter discovery returns actionable error without saving or scheduling', async () => {
    const app = linkRoute('<h1>Story</h1>');
    const res = await app.POST(request());
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'NO_CHAPTERS');
    assert.equal(app.saved.length, 0);
    assert.equal(app.scheduled.length, 0);
});

test('resubmitting a novel preserves downloaded chapters', async () => {
    const app = linkRoute('<div class="chapters"><a href="one">One</a></div>', {
        status: 'ERROR', allChapters: [{ title: 'One', url: 'https://example.test/book/story/one', status: 'done', content: 'Saved text' }],
    });
    assert.equal((await app.POST(request())).status, 201);
    assert.equal(app.saved[0].update.allChapters[0].content, 'Saved text');
});

function worker(count, failures = [], options = {}) {
    const updates = [], inserted = [], books = [], fetched = [], heartbeatTicks = [], heartbeatWrites = [], heartbeatStops = [], sleeps = [];
    const novel = { id: 'novel', title: 'Story', status: 'SCRAPING', sourceLink: 'https://example.test/book', sourceWebsite: { url: 'example.test', tagsToExtract: { content: '.custom-text' } },
        allChapters: Array.from({ length: count }, (_, i) => ({ title: `Chapter ${i + 1}`, url: `https://example.test/${i + 1}`, status: 'pending' })) };
    if (options.sourceWebsite) novel.sourceWebsite = options.sourceWebsite;
    const store = {
        readSavedChapterBatch: async (_id, start, count) => novel.allChapters.slice(start, start + count),
        loadScrapeJob: async () => ({ ...novel, allChapters: novel.allChapters.map(c => {
            const { content, ...metadata } = c; return { ...metadata, hasSavedContent: Boolean(content) };
        }) }),
        writeScrapeProgress: async (_id, data, expectedStatus) => {
            heartbeatWrites.push({ where: { status: expectedStatus }, data: { updatedAt: new Date() } });
            if (expectedStatus && !(Array.isArray(expectedStatus) ? expectedStatus.includes(novel.status) : expectedStatus === novel.status)) return { count: 0 };
            const next = JSON.parse(JSON.stringify(novel.allChapters));
            if (data.chapterIndex !== undefined) {
                const { hasSavedContent, ...chapter } = data.chapter;
                next[data.chapterIndex] = chapter;
                await options.update?.({ allChapters: next });
                novel.allChapters = next;
            }
            if (data.status) novel.status = data.status;
            if (data.status || data.chapter) updates.push({ status: novel.status, allChapters: JSON.parse(JSON.stringify(novel.allChapters)) });
            return { count: 1 };
        },
    };
    const app = load('src/lib/chapter-scraper.ts', { './scraper-store': store, './prisma': { prisma: {
        novel: { findUnique: async () => novel, update: async args => {
            await options.update?.(args.data);
            if (args.data.allChapters) novel.allChapters = JSON.parse(JSON.stringify(args.data.allChapters));
            if (args.data.status) novel.status = args.data.status;
            updates.push(JSON.parse(JSON.stringify(args.data)));
        }, updateMany: async args => {
            heartbeatWrites.push(args);
            if (typeof args.where.status === 'string' && args.where.status !== novel.status) return { count: 0 };
            if (args.data.status) novel.status = args.data.status;
            if (args.data.allChapters) novel.allChapters = JSON.parse(JSON.stringify(args.data.allChapters));
            if (args.data.status || args.data.allChapters) updates.push(JSON.parse(JSON.stringify(args.data)));
            return { count: 1 };
        } },
        user: { findUnique: async () => ({ name: 'Reader', email: 'reader@example.test' }) },
        book: { findFirst: async () => null, create: async args => { books.push(args.data); return { id: 'book' }; } },
        chapter: { findMany: async () => [], createMany: async args => { await options.import?.(args.data); inserted.push(...args.data); } },
    } } }, {
        fetch: async url => {
            fetched.push(url);
            if (options.fetch) return options.fetch(url);
            return failures.includes(Number(new URL(url).pathname.slice(1)))
            ? new Response('Unavailable', { status: 503 })
            : new Response(options.html || `<div class="custom-text"><p>${'Chapter text. '.repeat(10)}</p></div>`);
        },
        setTimeout: (fn, ms) => {
            if (ms < 15000) sleeps.push(ms);
            return setTimeout(fn, ms < 15000 ? 0 : ms);
        },
        setInterval: (fn, ms) => { heartbeatTicks.push({ fn, ms }); return { unref() {} }; },
        clearInterval: timer => { if (timer) heartbeatStops.push(timer); },
    });
    return { ...app, updates, inserted, books, fetched, heartbeatTicks, heartbeatWrites, heartbeatStops, sleeps,
        requestStop: () => { novel.status = 'STOPPING'; }, stored: () => novel };
}

test('workers heartbeat during a slow save and stop the heartbeat when finished', async () => {
    let release, started;
    const saveStarted = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const app = worker(1, [], { update: async data => {
        if (data.allChapters?.[0].status === 'done') { started(); await gate; }
    } });
    const sync = app.startNovelSyncAsync('novel', 'user');
    await saveStarted;
    assert.equal(app.heartbeatTicks[0].ms, 30000);
    await app.heartbeatTicks[0].fn();
    assert.equal(app.heartbeatWrites[0].where.status, 'SCRAPING');
    assert.deepEqual(Object.keys(app.heartbeatWrites[0].data), ['updatedAt']);
    release();
    await sync;
    assert.equal(app.heartbeatStops.length, 1);
});

test('stale scraping jobs become resumable without changing chapter content or live jobs', async () => {
    const cutoff = jobs.staleScrapeCutoff().getTime();
    const records = [
        { status: 'SCRAPING', updatedAt: new Date(cutoff - 1), allChapters: [{ status: 'done', content: 'Saved chapter' }] },
        { status: 'SCRAPING', updatedAt: new Date(), allChapters: [] },
        { status: 'DONE', updatedAt: new Date(0), allChapters: [] },
    ];
    const before = JSON.stringify(records.map(row => row.allChapters));
    const service = load('src/lib/scraper-jobs.ts', { './prisma': { prisma: { novel: {
        updateMany: async ({ where, data }) => {
            assert.deepEqual(Array.from(where.status.in), ['SCRAPING', 'STOPPING', 'IMPORTING']);
            assert.deepEqual(Object.keys(data), ['status']);
            let count = 0;
            for (const record of records) {
                if (where.status.in.includes(record.status) && record.updatedAt < where.updatedAt.lt) {
                    record.status = data.status; count++;
                }
            }
            return { count };
        },
    } } } });
    assert.equal((await service.recoverInterruptedScrapes()).count, 1);
    assert.deepEqual(records.map(row => row.status), ['INTERRUPTED', 'SCRAPING', 'DONE']);
    assert.equal(JSON.stringify(records.map(row => row.allChapters)), before);
});

test('novel listing is read-only, returns summary progress and reports stale jobs', async () => {
    let query;
    const now = new Date().toISOString();
    const app = load('src/app/api/novelscraper/novels/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true }) },
        '@/lib/scraper-db': {},
        'next/server': { NextResponse: { json: body => body } },
        '@/lib/prisma': { prisma: { novel: { aggregateRaw: async args => {
            query = args;
            return [{ _id: { $oid: 'novel' }, title: 'Story', sourceWebsiteId: { $oid: 'source' }, sourceLink: 'https://example.test/book', status: 'SCRAPING',
                progress: { saved: 1, total: 2 }, createdAt: { $date: now }, updatedAt: { $date: new Date(Date.now() - 11 * 60000).toISOString() } },
                { _id: { $oid: 'failed-novel' }, title: 'Absolute Resonance', sourceLink: 'https://novelfull.net/absolute-resonance.html', status: 'ERROR',
                    progress: { saved: 0, total: 1, failure: { title: 'Chapter 31', error: 'HTTP 403 from source', attempts: 3 } },
                    createdAt: { $date: now }, updatedAt: { $date: now } },
                { _id: { $oid: 'live' }, title: 'Live', sourceLink: 'https://example.test/live', status: 'SCRAPING',
                    progress: { saved: 7, total: 10 }, createdAt: { $date: now }, updatedAt: { $date: now } },
                { _id: { $oid: 'import' }, title: 'Import', sourceLink: 'https://example.test/import', status: 'SCRAPING',
                    progress: { saved: 10, total: 10 }, createdAt: { $date: now }, updatedAt: { $date: now } }];
        } } } },
    });
    const result = await app.GET();
    assert.equal(query.options.maxTimeMS, 10000);
    assert.equal(query.pipeline[1].$project.allChapters, undefined);
    assert.equal(result[0].id, 'novel');
    assert.equal(result[0].site, 'source');
    assert.equal(result[0].status, 'interrupted');
    assert.equal(result[0].chaptersScraped, 1);
    assert.equal(result[0].totalChapters, 2);
    assert.match(result[0].error, /Sync/);
    assert.match(result[1].error, /Chapter 31: HTTP 403.*3 attempts/);
    assert.equal(result[2].status, 'scraping');
    assert.equal(result[3].status, 'importing');
    assert.equal(result[2].updatedAt, now);
    assert.equal(result.some(n => 'allChapters' in n), false);
});

test('dashboard list requests handle failed sessions, invalid data and timeouts', async () => {
    let callback, cleared = 0;
    const client = fetch => load('src/lib/scraper-client.ts', {}, {
        fetch, setTimeout: fn => { callback = fn; return 1; }, clearTimeout: () => cleared++,
    });
    await assert.rejects(client(async () => new Response('{}', { status: 401 })).fetchScraperList('/list'), /session expired/);
    await assert.rejects(client(async () => new Response('{}', { status: 500 })).fetchScraperList('/list'), /HTTP 500/);
    await assert.rejects(client(async () => new Response('{}')).fetchScraperList('/list'), /invalid list/);
    const pending = client((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })).fetchScraperList('/list');
    callback();
    await assert.rejects(pending, /timed out/);
    const rows = await client(async () => new Response('[{"id":"saved"}]')).fetchScraperList('/list');
    assert.equal(rows[0].id, 'saved');
    assert.equal(cleared, 5);
});

test('sync imports all chapters beyond the old ten-chapter cutoff and uses library owner email', async () => {
    const app = worker(12);
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.updates.at(-1).status, 'DONE');
    assert.equal(app.inserted.length, 12);
    assert.equal(app.books[0].userName, 'reader@example.test');
    assert.deepEqual(app.sleeps, []);
});

test('a chapter failure stops before the next chapter and Sync resumes at the failed chapter', async () => {
    const failures = [2];
    const app = worker(3, failures);
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.updates.at(-1).status, 'ERROR');
    assert.deepEqual(app.inserted.map(c => c.order), [1]);
    assert.equal(app.updates.at(-1).allChapters[1].status, 'error');
    assert.match(app.updates.at(-1).allChapters[1].error, /HTTP 503/);
    assert.equal(app.updates.at(-1).allChapters[1].attempts, 3);
    assert.equal(app.updates.at(-1).allChapters[1].errorCode, 'HTTP_503');
    assert.equal(app.updates.at(-1).allChapters[2].status, 'pending');
    assert.deepEqual(app.fetched.map(url => new URL(url).pathname), ['/1', '/2', '/2', '/2']);
    failures.length = 0;
    app.stored().status = 'SCRAPING';
    await app.startNovelSyncAsync('novel', 'user');
    assert.deepEqual(app.fetched.map(url => new URL(url).pathname), ['/1', '/2', '/2', '/2', '/2', '/3']);
    assert.equal(app.updates.at(-1).status, 'DONE');
    assert.equal(app.updates.at(-1).allChapters[1].error, undefined);
});

test('temporary server failures and delayed content retry only the current chapter', async () => {
    const html = '<div class="custom-text"><p>' + 'Complete chapter text. '.repeat(10) + '</p></div>';
    for (const firstResponse of [() => new Response('Unavailable', { status: 503 }), () => new Response('<div class="custom-text">Loading...</div>')]) {
        let attempts = 0;
        const app = worker(2, [], { fetch: async () => ++attempts === 1 ? firstResponse() : new Response(html) });
        await app.startNovelSyncAsync('novel', 'user');
        assert.deepEqual(app.fetched.map(url => new URL(url).pathname), ['/1', '/1', '/2']);
        assert.equal(app.updates.at(-1).status, 'DONE');
        assert.deepEqual(app.sleeps, [500]);
    }
});

test('rate limits respect Retry-After and long waits or missing chapters stop without skipping', async () => {
    const html = '<div class="custom-text"><p>' + 'Complete chapter text. '.repeat(10) + '</p></div>';
    let attempt = 0;
    const limited = worker(2, [], { fetch: async () => ++attempt === 1
        ? new Response('Rate limited', { status: 429, headers: { 'Retry-After': '2' } }) : new Response(html) });
    await limited.startNovelSyncAsync('novel', 'user');
    assert.deepEqual(limited.sleeps, [2000]);
    assert.deepEqual(limited.fetched.map(url => new URL(url).pathname), ['/1', '/1', '/2']);
    for (const status of [404, 429]) {
        const app = worker(2, [], { fetch: async () => new Response('Unavailable', { status, headers: { 'Retry-After': '120' } }) });
        await app.startNovelSyncAsync('novel', 'user');
        assert.equal(app.fetched.length, 1);
        assert.equal(app.updates.at(-1).status, 'ERROR');
        assert.equal(app.updates.at(-1).allChapters[0].errorCode, 'HTTP_' + status);
        assert.equal(app.updates.at(-1).allChapters[0].attempts, 1);
        assert.equal(app.updates.at(-1).allChapters[1].status, 'pending');
    }
});

test('the next chapter cannot load until the current database save resolves', async () => {
    let release, started;
    const saving = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let first = true;
    const app = worker(3, [], { update: async data => {
        if (first && data.allChapters?.[0].status === 'done') {
            first = false;
            started();
            await gate;
        }
    } });
    const sync = app.startNovelSyncAsync('novel', 'user');
    await saving;
    assert.equal(app.fetched.length, 1);
    release();
    await sync;
    assert.equal(app.fetched.length, 3);
    assert.equal(app.updates.at(-1).status, 'DONE');
});

test('Stop waits for an in-flight save, leaves later chapters pending, and Sync resumes', async () => {
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const saving = new Promise(resolve => { started = resolve; });
    let first = true;
    const app = worker(3, [], { update: async data => {
        if (first && data.allChapters?.[0].status === 'done') { first = false; started(); await gate; }
    } });
    const sync = app.startNovelSyncAsync('novel', 'user');
    await saving;
    app.requestStop();
    assert.equal(app.stored().status, 'STOPPING');
    assert.equal(app.fetched.length, 1);
    release();
    await sync;
    assert.equal(app.stored().status, 'PAUSED');
    assert.equal(app.stored().allChapters[0].status, 'done');
    assert.equal(app.stored().allChapters[1].status, 'pending');
    assert.equal(app.fetched.length, 1);
    app.stored().status = 'SCRAPING';
    await app.startNovelSyncAsync('novel', 'user');
    assert.deepEqual(app.fetched.map(url => new URL(url).pathname), ['/1', '/2', '/3']);
    assert.equal(app.stored().status, 'DONE');
});

test('Stop during a failed chapter prevents further retries and remains paused', async () => {
    let app;
    app = worker(3, [], { fetch: async () => { app.requestStop(); return new Response('Unavailable', { status: 503 }); } });
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.fetched.length, 1);
    assert.equal(app.stored().status, 'PAUSED');
    assert.equal(app.stored().allChapters[0].status, 'pending');
});

test('stop endpoint requires auth and changes only an active job status', async () => {
    let authenticated = false, status = 'SCRAPING';
    const writes = [];
    const app = load('src/app/api/novelscraper/novels/[id]/stop/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: authenticated }) },
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/scraper-store': { writeScrapeProgress: async (_id, data, statuses) => {
            assert.deepEqual(Object.keys(data), ['status']);
            if (!statuses.includes(status)) return { count: 0 };
            status = data.status; writes.push(data); return { count: 1 };
        } },
        '@/lib/prisma': { prisma: { novel: {
            findUnique: async () => ({ status }),
            updateMany: async ({ where, data }) => {
                assert.deepEqual(Object.keys(data), ['status']);
                if (!where.status.in.includes(status)) return { count: 0 };
                status = data.status; writes.push(data); return { count: 1 };
            },
        } } },
    });
    const params = { params: Promise.resolve({ id: 'novel' }) };
    assert.equal((await app.POST({}, params)).status, 401);
    assert.equal(writes.length, 0);
    authenticated = true;
    assert.equal((await app.POST({}, params)).body.status, 'STOPPING');
    assert.equal((await app.POST({}, params)).body.status, 'STOPPING');
    assert.equal(writes.length, 1);
    status = 'DONE';
    assert.equal((await app.POST({}, params)).body.status, 'DONE');
    assert.equal(writes.length, 1);
});

test('a failed database save or incomplete chapter stops subsequent chapter requests', async () => {
    for (const options of [
        { update: async data => { if (data.allChapters?.[0].status === 'done') throw Error('Database unavailable'); } },
        { html: '<div class="custom-text">Loading...</div>' },
    ]) {
        const app = worker(3, [], options);
        await app.startNovelSyncAsync('novel', 'user');
        assert.equal(app.fetched.length, options.html ? 3 : 1);
        assert.equal(app.updates.at(-1).status, 'ERROR');
        assert.equal(app.updates.at(-1).allChapters[0].status, 'error');
        assert.equal(app.updates.at(-1).allChapters[1].status, 'pending');
    }
});

test('NovelFire extracts text directly inside chapter-container without a nested content element', async () => {
    const app = worker(1, [], {
        sourceWebsite: { url: 'https://novelfire.net/', tagsToExtract: {} },
        html: `<article id="chapter-article"><div id="chapter-container" class="d-chapter-content"><p>${'NovelFire text. '.repeat(10)}</p></div></article>`,
    });
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.updates.at(-1).status, 'DONE');
    assert.match(app.inserted[0].content[0].children[0].text, /NovelFire text/);
});

test('NovelFull block is reported clearly without retries or saving a fake novel', async () => {
    let attempts = 0;
    const app = linkRoute('', null, {
        source: 'https://novelfull.net/',
        fetch: async () => { attempts++; return new Response('<title>Just a moment...</title>', { status: 403 }); },
    });
    const res = await app.POST(request({ sourceUrl: 'https://novelfull.net/martial-world.html' }));
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'SOURCE_BLOCKED');
    assert.equal(res.body.retryable, false);
    assert.match(res.body.error, /403/);
    assert.equal(attempts, 1);
    assert.equal(app.saved.length, 0);
});

test('NovelFire chapter discovery follows pagination and extracts clean chapter titles', async () => {
    const fetched = [];
    const app = linkRoute('', null, {
        source: 'https://novelfire.net/', selector: '.chapter-list a',
        fetch: async url => {
            fetched.push(url);
            if (!url.includes('/chapters')) return new Response('<h1 class="novel-title">Story</h1>');
            const page = Number(new URL(url).searchParams.get('page'));
            return new Response(`<ul class="chapter-list"><li><a href="/book/story/chapter-${page}"><span class="chapter-no">${page}</span><strong class="chapter-title">Chapter ${page}</strong><time>yesterday</time></a></li></ul>${page === 1 ? '<a href="?page=2">Next</a>' : ''}`);
        },
    });
    const res = await app.POST(request({ sourceUrl: 'https://novelfire.net/book/story' }));
    assert.equal(res.status, 201);
    assert.equal(app.saved[0].create.allChapters.length, 2);
    assert.equal(app.saved[0].create.allChapters[0].title, 'Chapter 1');
    assert.equal(fetched.length, 3);
});

test('sync uses the authenticated Bearer user and rejects duplicate workers', async () => {
    const scheduled = [], synced = [];
    let claimed = false;
    const app = load('src/app/api/novelscraper/novels/[id]/sync/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { id: 'mobile-user' } }) },
        'next/server': { after: fn => scheduled.push(fn), NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/chapter-scraper': { startNovelSyncAsync: async (...args) => synced.push(args) },
        '@/lib/scraper-store': {
            readScrapeJobHeader: async () => ({ status: 'ERROR', chapterCount: 1837 }),
            claimScrapeJob: async () => { if (claimed) return { count: 0 }; claimed = true; return { count: 1 }; },
        },
    });
    const params = { params: Promise.resolve({ id: 'novel' }) };
    const result = await app.POST({}, params);
    assert.equal(result.body.novel.status, 'SCRAPING');
    assert.equal('allChapters' in result.body.novel, false);
    assert.ok(JSON.stringify(result.body).length < 200);
    assert.equal((await app.POST({}, params)).status, 409);
    assert.equal(scheduled.length, 1);
    await scheduled[0]();
    assert.deepEqual(synced, [['novel', 'mobile-user']]);
});


test('chapter persistence updates one array entry and never resends saved chapter text', async () => {
    const commands = [];
    let result = { n: 1, ok: 1 };
    const service = load('src/lib/scraper-store.ts', { './prisma': { prisma: {
        $runCommandRaw: async command => { commands.push(command); return result; },
    } } });
    await service.writeScrapeProgress('abc', { chapterIndex: 873, chapter: { title: '874', status: 'done', content: 'New chapter', hasSavedContent: false } });
    const write = commands[0].updates[0];
    assert.equal(write.q._id.$oid, 'abc');
    assert.deepEqual(Object.keys(write.u.$set), ['allChapters.873']);
    assert.equal(write.u.$set['allChapters.873'].content, 'New chapter');
    assert.equal('hasSavedContent' in write.u.$set['allChapters.873'], false);
    assert.equal(write.u.$currentDate.updatedAt, true);
    await service.writeScrapeProgress('abc', { status: 'PAUSED' }, 'STOPPING');
    assert.equal(commands[1].updates[0].q.status, 'STOPPING');
    assert.deepEqual(Object.keys(commands[1].updates[0].u.$set), ['status']);
    result = { n: 0, ok: 1 };
    assert.equal((await service.writeScrapeProgress('deleted', {})).count, 0);
    result = { n: 0, ok: 1, writeErrors: [{ errmsg: 'Document too large' }] };
    await assert.rejects(service.writeScrapeProgress('abc', {}), /Document too large/);
    result = { n: 1, ok: 1, writeConcernError: { errmsg: 'Unconfirmed' } };
    await assert.rejects(service.writeScrapeProgress('abc', {}), /could not confirm/);
});

test('job claiming is a single conditional write with no chapter payload', async () => {
    let command;
    const service = load('src/lib/scraper-store.ts', { './prisma': { prisma: {
        $runCommandRaw: async value => { command = value; return { n: 1, ok: 1 }; },
    } } });
    const cutoff = new Date('2026-10-21T15:00:00Z');
    assert.equal((await service.claimScrapeJob('abc', cutoff)).count, 1);
    const update = command.updates[0];
    assert.deepEqual(Array.from(update.q.$or[0].status.$nin), ['SCRAPING', 'STOPPING', 'IMPORTING']);
    assert.equal(update.q.$or[1].updatedAt.$lt.$date, cutoff.toISOString());
    assert.deepEqual(Object.keys(update.u.$set), ['status']);
    assert.equal(update.multi, false);
});


test('all saved chapters enter importing until the library batches finish', async () => {
    let started, release;
    const importing = new Promise(resolve => started = resolve);
    const gate = new Promise(resolve => release = resolve);
    const app = worker(55, [], { import: async () => { started(); await gate; } });
    const sync = app.startNovelSyncAsync('novel', 'user');
    await importing;
    assert.equal(app.stored().status, 'IMPORTING');
    assert.equal(app.stored().allChapters.filter(c => c.status === 'done').length, 55);
    assert.equal(app.inserted.length, 0);
    release();
    await sync;
    assert.equal(app.inserted.length, 55);
    assert.equal(app.stored().status, 'DONE');
});

test('library import errors retain all saved chapters and Sync retries import without downloads', async () => {
    let fail = true;
    const app = worker(2, [], { import: async () => { if (fail) throw new Error('Library temporarily unavailable'); } });
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.stored().status, 'IMPORT_ERROR');
    assert.equal(app.stored().allChapters.filter(c => c.status === 'done').length, 2);
    const fetched = app.fetched.length;
    fail = false;
    app.stored().status = 'SCRAPING';
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.stored().status, 'DONE');
    assert.equal(app.fetched.length, fetched);
    assert.equal(app.inserted.length, 2);
});


test('FreeWebNovel discovery reads all paginated chapters and rejects partial lists', async () => {
    const app = load('src/lib/freewebnovel.ts');
    const base = 'https://freewebnovel.com/novel/story';
    const page = (current, size, count) => '<link rel="canonical" href="' + base + '"><div id="indexListPage" data-current-page="' + current + '" data-page-size="' + size + '" data-total-chapters="201"></div><ul id="idData">' + Array.from({ length: count }, (_, i) => '<li><a href="/novel/story/chapter-' + ((current - 1) * size + i + 1) + '">Chapter ' + ((current - 1) * size + i + 1) + '</a></li>').join('') + '</ul><a href="/novel/other/chapter-1">Recommendation</a>';
    const requests = [];
    const chapters = await app.discoverFreeWebNovelChapters(page(1, 40, 40), base, async url => {
        requests.push(url);
        const current = Number(new URL(url).searchParams.get('page'));
        return new Response(page(current, 200, current === 1 ? 200 : 1));
    });
    assert.equal(requests.length, 2);
    assert.equal(chapters.length, 201);
    assert.equal(chapters[200].url, base + '/chapter-201');
    assert.equal(chapters[0].status, 'pending');
    await assert.rejects(app.discoverFreeWebNovelChapters(page(1, 200, 200), base, async () => new Response(page(2, 200, 0))), /incomplete chapter list/);
});


test('book metadata omits chapter bodies and content windows are bounded', async () => {
    let query;
    const mocks = {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { role: 'SUPERUSER' } }) },
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/prisma': { prisma: {
            book: { findUnique: async args => { query = args; return { id: 'book' }; } },
            chapter: { findMany: async args => { query = args; return [{ id: 'c', content: ['Saved text'] }]; } },
        } },
    };
    const details = load('src/app/api/books/[id]/route.ts', mocks);
    await details.GET({ nextUrl: new URL('http://localhost/api/books/book?chapters=metadata') }, { params: Promise.resolve({ id: 'book' }) });
    assert.deepEqual(Object.keys(query.include.chapters.select), ['id', 'title', 'order']);
    const chapters = load('src/app/api/books/[id]/chapters/route.ts', mocks);
    const params = { params: Promise.resolve({ id: 'book' }) };
    const result = await chapters.GET({ nextUrl: new URL('http://localhost/?start=500&limit=5') }, params);
    assert.equal(result.status, 200);
    assert.equal(query.skip, 500);
    assert.equal(query.take, 5);
    assert.equal(result.body.chapters[0].content[0], 'Saved text');
    assert.equal((await chapters.GET({ nextUrl: new URL('http://localhost/?start=-1&limit=500') }, params)).status, 400);
    await chapters.GET({ nextUrl: new URL('http://localhost/') }, params);
    assert.equal(query.take, undefined); // Bulk/offline clients keep the existing endpoint.
});

test('repeat Add to Library preserves existing chapters instead of deleting and rebuilding them', async () => {
    let imports = 0;
    const app = load('src/app/api/novelscraper/novels/[id]/add-to-db/route.ts', {
        '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { id: 'reader' } }) },
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/chapter-scraper': { importSavedNovelToLibrary: async (id, user) => { assert.equal(id, 'novel'); assert.equal(user, 'reader'); imports++; return true; } },
        '@/lib/prisma': { prisma: {
            novel: { findUnique: async args => { assert.equal(args.select.allChapters, undefined); return { status: 'DONE', title: 'Story', sourceLink: 'https://example.test/story' }; } },
            user: { findUnique: async () => ({ email: 'reader@example.test' }) },
            book: { findFirst: async args => { assert.equal(args.where.userName, 'reader@example.test'); return { id: 'book', _count: { chapters: 1837 } }; } },
        } },
    });
    const result = await app.POST({}, { params: Promise.resolve({ id: 'novel' }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.chaptersAdded, 0);
    assert.equal(result.body.bookId, 'book');
    assert.equal(imports, 1);
});

test('scraped chapter imports keep separate paragraphs and repeated dialogue', async () => {
    const paragraphs = load('src/lib/chapter-paragraphs.ts');
    const blocks = paragraphs.chapterParagraphBlocks('First paragraph.\r\n\r\nSecond paragraph.\n \nFirst paragraph.');
    assert.equal(blocks.length, 3);
    assert.deepEqual(Array.from(blocks, b => b.children[0].text), ['First paragraph.', 'Second paragraph.', 'First paragraph.']);
    const first = 'First source paragraph with enough text to validate the chapter.';
    const second = 'Second source paragraph with a separate sentence and paragraph.';
    const app = worker(1, [], { html: '<div class="custom-text"><p>' + first + '</p><p>' + second + '</p><p>' + first + '</p></div>' });
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.inserted[0].content.length, 3);
    assert.equal(app.inserted[0].content[0].children[0].text, first);
    assert.equal(app.inserted[0].content[1].children[0].text, second);
    assert.equal(app.inserted[0].content[2].children[0].text, first);
    assert.equal(app.stored().allChapters[0].content, [first, second, first].join('\n\n'));
});

test('chapters using break tags retain their original paragraph boundaries', async () => {
    const first = 'A full first paragraph written with break tags instead of paragraph tags.';
    const second = 'The second paragraph should remain separate after scraping and importing.';
    const app = worker(1, [], { html: '<div class="custom-text">' + first + '<br><br>' + second + '</div>' });
    await app.startNovelSyncAsync('novel', 'user');
    assert.equal(app.inserted[0].content.length, 2);
    assert.equal(app.inserted[0].content[1].children[0].text, second);
});
