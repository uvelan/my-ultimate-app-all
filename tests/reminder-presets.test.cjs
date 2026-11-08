const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

const account = '123456789abcdef012345678';
const otherAccount = 'abcdef0123456789abcdef01';

function load(file, mocks) {
    const filename = path.resolve(__dirname, '..', file);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, console: { error() {} },
        require: name => name in mocks ? mocks[name] : require(name),
    }, { filename });
    return module.exports;
}

function harness() {
    const records = new Map();
    let userId = account;
    let failRead = false;
    const prisma = {
        user: { findUnique: async () => ({ isActive: true }) },
        reminderPreset: {
            async create({ data }) {
                if (records.has(data.id)) throw Object.assign(new Error('Duplicate ID'), { code: 'P2002' });
                records.set(data.id, data);
            },
            async updateMany({ where, data }) {
                const current = records.get(where.id);
                if (!current || current.userId !== where.userId || current.version !== where.version || current.deleted) {
                    return { count: 0 };
                }
                records.set(where.id, { ...current, ...data });
                return { count: 1 };
            },
            async findFirst({ where }) {
                const current = records.get(where.id);
                return current?.userId === where.userId ? current : null;
            },
            async findMany({ where }) {
                if (failRead) { failRead = false; throw new Error("Connection dropped"); }
                return [...records.values()].filter(row => row.userId === where.userId
                    && (where.deleted === undefined || row.deleted === where.deleted));
            },
        },
    };
    const groups = load('shared/activity-groups.ts', {});
    const service = load('src/lib/reminder-presets-server.ts', { '@/lib/prisma': { prisma }, '@shared/activity-groups': groups,
        '@shared/activity-duration': load('shared/activity-duration.ts', {}),
    });
    const handlers = load('src/lib/activity-tracker-api.ts', {
        'next/server': { NextResponse: Response },
        '@/lib/prisma': { prisma },
        '@/lib/auth-server': { verifyAuth: async () => ({ user: userId ? { id: userId } : null }) },
        '@/lib/reminder-presets-server': service,
        '@/lib/reminder-history-server': { listReminderSessions: async () => ({ sessions: [], truncated: false }) },
    });
    const route = load('src/app/api/reminders/route.ts', { '@/lib/activity-tracker-api': handlers });
    const activities = load('src/app/api/activities/route.ts', { '@/lib/activity-tracker-api': handlers });
    const request = (path, mutations, accountId) => new Request('https://example.test' + path, {
        method: 'POST', body: JSON.stringify({ accountId, mutations }),
    });
    return {
        records,
        failNextRead: () => { failRead = true; },
        as: id => { userId = id; },
        get: (query = '') => route.GET({ nextUrl: new URL('https://example.test/api/reminders' + query) }),
        sync: (mutations, accountId = userId) => route.POST(request('/api/reminders', mutations, accountId)),
        getActivities: () => activities.GET({ nextUrl: new URL('https://example.test/api/activities') }),
        syncActivities: mutations => activities.POST(request('/api/activities', mutations, userId)),
    };
}

function preset() {
    return {
        id: randomUUID(), expectedVersion: 0, operationId: randomUUID(), title: 'Office Hours',
        message: 'Take a break', durationMinutes: 45, extensionMinutes: 10,
        intervalMinutes: 15, routineEnabled: true, deleted: false,
    };
}

test('the endpoint lists all saved reminders and keeps date-range history separate', async () => {
    const api = harness();
    await api.sync([preset(), { ...preset(), title: 'Focus' }]);
    const list = await (await api.get()).json();
    assert.equal(list.reminders.length, 2);
    assert.equal(list.reminders[0].version, 1);
    assert.deepEqual(await (await api.get('?from=2026-11-01&to=2026-12-01')).json(), { sessions: [], truncated: false });
});

test('retrying a save is idempotent and a stale device cannot overwrite a newer edit', async () => {
    const api = harness();
    const draft = preset();
    const created = await (await api.sync([draft])).json();
    assert.equal(created.outcomes[0].status, 'applied');
    const edited = { ...draft, operationId: randomUUID(), expectedVersion: 1, title: 'Updated', durationMinutes: 60 };
    assert.equal((await (await api.sync([edited])).json()).reminders[0].version, 2);
    const retry = await (await api.sync([edited])).json();
    assert.equal(retry.outcomes[0].status, 'applied');
    assert.equal(retry.reminders[0].version, 2);
    const stale = await (await api.sync([{ ...edited, operationId: randomUUID(), title: 'Older edit' }])).json();
    assert.equal(stale.outcomes[0].status, 'conflict');
    assert.equal(stale.reminders[0].title, 'Updated');
    assert.equal(api.records.size, 1);
});

test('deleting on one device leaves a sync marker and removes the preset from the list', async () => {
    const api = harness();
    const draft = preset();
    await api.sync([draft]);
    await api.sync([{ ...draft, operationId: randomUUID(), expectedVersion: 1, deleted: true }]);
    assert.deepEqual((await (await api.get()).json()).reminders, []);
    assert.equal((await (await api.sync([])).json()).reminders[0].deleted, true);
});

test('account switches cannot upload queued settings to another user', async () => {
    const api = harness();
    const draft = preset();
    await api.sync([draft]);
    api.as(otherAccount);
    assert.deepEqual((await (await api.get()).json()).reminders, []);
    assert.equal((await api.sync([preset()], account)).status, 409);
    api.as(null);
    assert.equal((await api.get()).status, 401);
    assert.equal(api.records.size, 1);
});

test('Activity Tracker returns groups and the legacy endpoint preserves them on updates', async () => {
    const api = harness();
    const office = { ...preset(), title: 'Office timer', group: 'OFFICE' };
    const first = await (await api.syncActivities([office])).json();
    assert.equal(first.activities[0].group, 'OFFICE');
    assert.equal(first.activities[0].version, 1);
    const { group, ...legacy } = office;
    const edit = { ...legacy, expectedVersion: 1, operationId: randomUUID(), title: 'Updated office timer' };
    assert.equal((await (await api.sync([edit])).json()).reminders[0].group, 'OFFICE');
    await api.sync([preset()]);
    const current = await (await api.getActivities()).json();
    assert.deepEqual(current.activities.map(activity => activity.group).sort(), ['OFFICE', 'REMINDERS']);
    assert.equal((await api.syncActivities([{ ...preset(), group: 'OTHER' }])).status, 400);
});


test('Office weekly saves survive a lost response and return a retryable error', async () => {
    const api = harness();
    const draft = { ...preset(), group: 'OFFICE', kind: 'TIMER', durationMode: 'WEEKLY', durationMinutes: 2 * 1440 + 4 * 60 };
    api.failNextRead();
    const failure = await api.syncActivities([draft]);
    assert.equal(failure.status, 503);
    assert.match((await failure.json()).error, /try again/i);
    const retried = await (await api.syncActivities([draft])).json();
    assert.equal(retried.outcomes[0].status, 'applied');
    assert.equal(retried.activities[0].durationMode, 'WEEKLY');
    assert.equal(retried.activities[0].durationMinutes, 3120);
    assert.equal(retried.activities[0].kind, 'TIMER');
    assert.equal(api.records.size, 1);
    assert.equal((await api.syncActivities([{ ...preset(), durationMode: 'WEEKLY', durationMinutes: 61 }])).status, 400);
    assert.equal((await api.syncActivities([{ ...preset(), group: 'HEALTH', durationMode: 'WEEKLY', durationMinutes: 10080 }])).status, 200);
    assert.equal((await api.syncActivities([{ ...preset(), group: 'CAREER', durationMode: 'DAILY', durationMinutes: 90 }])).status, 200);
});
