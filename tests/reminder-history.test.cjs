const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const jwt = require('jsonwebtoken');

function load(file, mocks = {}) {
    const filename = path.resolve(__dirname, '..', file);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports,
        process: { env: { JWT_SECRET: 'reminder-regression-test-secret' } },
        require: name => name in mocks ? mocks[name] : require(name),
    }, { filename });
    return module.exports;
}

const owner = '123456789abcdef012345678';
const otherOwner = 'abcdef0123456789abcdef01';
const firstId = '58c3e253-dc65-4a80-8b3d-39241ba6c0e1';
const secondId = '03cfeac9-0c61-4eae-8ad3-f17692f67ed2';

function session(id = firstId, revision = 1) {
    return {
        id, revision, presetId: 'original', title: 'Office Hours', message: 'Time’s up',
        source: 'routine', status: 'running', recordedAt: 60_000, startedAt: 60_000,
        countdownStartedAt: 60_000, plannedEndAt: 180_000, endedAt: null,
    };
}

function harness() {
    const records = new Map();
    let failOnce;
    const prisma = {
        user: { findUnique: async ({ where }) => ({ isActive: [owner, otherOwner].includes(where.id) }) },
        reminderSession: {
            async updateMany({ where, data }) {
                const current = records.get(where.id);
                if (!current || current.userId !== where.userId || current.revision >= where.revision.lt) return { count: 0 };
                records.set(where.id, { ...current, ...data });
                return { count: 1 };
            },
            async create({ data }) {
                if (failOnce === data.sessionId) {
                    failOnce = undefined;
                    throw new Error('Simulated database interruption');
                }
                if (records.has(data.id)) throw Object.assign(new Error('Duplicate key'), { code: 'P2002' });
                records.set(data.id, data);
            },
        },
    };
    const service = load('src/lib/reminder-history-server.ts', { '@/lib/prisma': { prisma } });
    const route = load('src/app/api/mobile/reminders/sync/route.ts', {
        '@/lib/prisma': { prisma },
        '@/lib/reminder-history-server': service,
        'next/server': { NextResponse: Response },
    });
    const send = (sessions, token = service.issueReminderGrant(owner).token) => route.POST(new Request('https://example.test/api/mobile/reminders/sync', {
        method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify({ sessions }),
    }));
    return { records, send, service, interrupt: id => { failOnce = id; } };
}

test('an interrupted batch can be resent without duplicating a session', async () => {
    const { records, send, interrupt } = harness();
    const batch = [session(), session(secondId)];
    interrupt(secondId);
    assert.equal((await send(batch)).status, 503);
    assert.equal(records.size, 1);
    assert.deepEqual(await (await send(batch)).json(), { acknowledged: [firstId, secondId], rejected: [] });
    assert.deepEqual(await (await send(batch)).json(), { acknowledged: [firstId, secondId], rejected: [] });
    assert.equal(records.size, 2);
});

test('an older upload cannot undo a stop or overwrite another account', async () => {
    const { records, send, service } = harness();
    await send([{ ...session(firstId, 2), status: 'stopped', endedAt: 80_000 }]);
    await send([session()]);
    await send([session()], service.issueReminderGrant(otherOwner).token);
    assert.equal(records.size, 2);
    assert.equal(records.get(owner + ':' + firstId).status, 'stopped');
    assert.equal(records.get(otherOwner + ':' + firstId).status, 'running');
});

test('rejecting a malformed record does not hold up valid sessions', async () => {
    const { records, send } = harness();
    const response = await send([{ ...session(), title: '' }, session(secondId)]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { acknowledged: [secondId], rejected: [firstId] });
    assert.equal(records.size, 1);
});

test('account access tokens are not accepted as background upload grants', async () => {
    const { records, send } = harness();
    const access = jwt.sign({ id: owner, role: 'USER' }, 'reminder-regression-test-secret');
    assert.equal((await send([session()], access)).status, 401);
    assert.equal(records.size, 0);
});

test('calendar includes a cross-midnight session on both days and progress uses the latest extension', () => {
    const { calendarPeriod, sessionsOnDay, sessionProgress } = load('mobile-app/src/lib/reminder-calendar.ts');
    const started = new Date(2026, 10, 8, 23, 55).getTime();
    const extended = new Date(2026, 10, 9, 0, 5).getTime();
    const planned = new Date(2026, 10, 9, 0, 15).getTime();
    const row = { ...session(), recordedAt: started, startedAt: started, countdownStartedAt: extended, plannedEndAt: planned };
    assert.equal(sessionsOnDay([row], new Date(2026, 10, 8)).length, 1);
    assert.equal(sessionsOnDay([row], new Date(2026, 10, 9)).length, 1);
    assert.equal(sessionsOnDay([row], new Date(2026, 10, 10)).length, 0);
    assert.equal(calendarPeriod(new Date(2026, 10, 8), 'week').days.length, 7);
    const progress = sessionProgress(row, extended + 300_000);
    assert.equal(progress.remaining, '05:00');
    assert.equal(progress.percent, 50);
});
