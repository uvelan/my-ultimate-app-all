const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// In-memory Prisma adapter: commit both staged writes together; never accesses a database.
const userId = '0123456789abcdef01234567';
const categoryId = 'abcdef0123456789abcdef01';
const fingerprint = `sms-v1:${'a'.repeat(64)}`;
let authenticated, validCategory, receipts, ledger, failures, attempts, serial, categoryQueries, lookupQuery;
const key = (user, fp) => `${user}:${fp}`;
const prisma = {
    smsImport: {
        findUnique: async ({ where }) => receipts.get(key(where.userId_fingerprint.userId, where.userId_fingerprint.fingerprint)) || null,
        findMany: async ({ where }) => { lookupQuery = where; return [...receipts.values()].filter(item => item.userId === where.userId && where.fingerprint.in.includes(item.fingerprint)); },
    },
    transaction: { findFirst: async ({ where }) => { const item = ledger.get(where.id); return item?.userId === where.userId ? item : null; } },
    category: { findFirst: async ({ where }) => { categoryQueries.push(where); return validCategory ? { id: categoryId } : null; } },
    $transaction: async callback => {
        attempts++;
        const failure = failures.shift();
        if (failure) throw Object.assign(new Error('Internal database detail must never be exposed'), { code: failure });
        let record, receipt;
        const result = await callback({ transaction: { create: async ({ data }) => { record = { id: `txn-${++serial}`, ...data }; return record; } }, smsImport: { create: async ({ data }) => { receipt = data; return data; } } });
        const receiptKey = key(receipt.userId, receipt.fingerprint);
        if (receipts.has(receiptKey)) throw Object.assign(new Error('Duplicate key'), { code: 'P2002' });
        ledger.set(record.id, record);
        receipts.set(receiptKey, receipt);
        return result;
    },
};
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/api/mobile/sms/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(source, {
    exports: moduleUnderTest.exports, module: moduleUnderTest, Date, SyntaxError,
    console: { error: () => {} },
    require: name => {
        if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
        if (name === 'next/cache') return { revalidatePath: () => {} };
        if (name === '@/lib/auth-server') return { verifyAuth: async () => ({ isAuthenticated: authenticated, user: authenticated ? { id: userId } : null }) };
        if (name === '@/lib/prisma') return { prisma };
        return require(name);
    },
});
const post = data => moduleUnderTest.exports.POST({ json: async () => data });
const valid = overrides => ({ action: 'import', fingerprint, type: 'EXPENSE', amountPaise: 12345, categoryId, transactionDate: '2026-10-19T09:30:00.000Z', description: 'Reviewed transaction', paymentMethod: 'UPI', ...overrides });
const addReceipt = deleted => {
    receipts.set(key(userId, fingerprint), { userId, fingerprint, transactionId: 'previous' });
    if (deleted !== 'missing') ledger.set('previous', { id: 'previous', userId, deletedAt: deleted ? new Date() : null });
};
beforeEach(() => { authenticated = true; validCategory = true; receipts = new Map(); ledger = new Map(); failures = []; attempts = 0; serial = 0; categoryQueries = []; lookupQuery = null; });

test('SMS import and lookup require authentication', async () => {
    authenticated = false;
    assert.equal((await post(valid())).status, 401);
    assert.equal((await post({ action: 'lookup', fingerprints: [] })).status, 401);
    assert.equal(attempts, 0);
});
test('SMS request validates JSON and strict financial schema before writing', async () => {
    assert.equal((await post(null)).status, 400);
    for (const overrides of [{ amountPaise: 0 }, { amountPaise: -1 }, { amountPaise: 1.5 }, { amountPaise: 2147483648 }, { categoryId: 'invalid' }, { type: 'TRANSFER' }, { transactionDate: 'not-date' }, { fingerprint: 'bad' }, { rawBody: 'not uploaded' }, { paymentMethod: '' }]) assert.equal((await post(valid(overrides))).status, 400);
    assert.equal((await moduleUnderTest.exports.POST({ json: async () => { throw new SyntaxError('bad JSON'); } })).status, 400);
    assert.equal(attempts, 0);
});
test('SMS lookup rejects more than 500 fingerprints and malformed fingerprints', async () => {
    assert.equal((await post({ action: 'lookup', fingerprints: Array(501).fill(fingerprint) })).status, 400);
    assert.equal((await post({ action: 'lookup', fingerprints: ['invalid'] })).status, 400);
});
test('SMS lookup only requests current user receipts', async () => {
    addReceipt(false);
    receipts.set(key('another-user', fingerprint), { userId: 'another-user', fingerprint, transactionId: 'foreign' });
    const result = await post({ action: 'lookup', fingerprints: [fingerprint] });
    assert.equal(result.status, 200);
    assert.equal(result.body.imports.length, 1);
    assert.equal(lookupQuery.userId, userId);
});
test('SMS category query enforces ownership, active status and matching type', async () => {
    validCategory = false;
    assert.equal((await post(valid())).status, 400);
    assert.deepEqual(JSON.parse(JSON.stringify(categoryQueries[0])), { id: categoryId, userId, type: 'EXPENSE', isArchived: false });
    assert.equal(attempts, 0);
});
test('SMS import atomically commits reviewed integer paise and durable receipt', async () => {
    const result = await post(valid());
    assert.equal(result.status, 201);
    assert.equal(result.body.duplicate, false);
    assert.equal(ledger.size, 1);
    assert.equal(receipts.size, 1);
    const record = ledger.get(result.body.transactionId);
    assert.equal(record.amountPaise, 12345);
    assert.equal(record.sourceModel, 'SMS');
    assert.equal(record.sourceId, fingerprint);
    assert.equal(record.transactionDate instanceof Date, true);
});
test('SMS repeat import returns original receipt without another write', async () => {
    addReceipt(false);
    const result = await post(valid());
    assert.equal(result.body.duplicate, true);
    assert.equal(result.body.deleted, false);
    assert.equal(result.body.transactionId, 'previous');
    assert.equal(attempts, 0);
});
test('SMS deleted or missing transaction remains imported and is never recreated', async () => {
    for (const deleted of [true, 'missing']) {
        ledger.clear(); addReceipt(deleted);
        const result = await post(valid());
        assert.equal(result.body.duplicate, true);
        assert.equal(result.body.deleted, true);
    }
    assert.equal(attempts, 0);
});
test('concurrent SMS imports commit one transaction; duplicate transaction is rolled back', async () => {
    const results = await Promise.all([post(valid()), post(valid())]);
    assert.deepEqual(results.map(item => item.status).sort(), [200, 201]);
    assert.equal(results.filter(item => item.body.duplicate).length, 1);
    assert.equal(ledger.size, 1);
    assert.equal(receipts.size, 1);
    assert.equal(results[0].body.transactionId, results[1].body.transactionId);
});
test('SMS retries P2002 and P2034 without leaking intermediate writes', async () => {
    failures = ['P2002', 'P2034'];
    assert.equal((await post(valid())).status, 201);
    assert.equal(attempts, 3);
    assert.equal(ledger.size, 1);
    assert.equal(receipts.size, 1);
});
test('SMS stops after three conflicts with generic retryable 503', async () => {
    failures = ['P2034', 'P2034', 'P2034'];
    const result = await post(valid());
    assert.equal(result.status, 503);
    assert.equal(attempts, 3);
    assert.equal(ledger.size, 0);
    assert.doesNotMatch(JSON.stringify(result.body), /Internal database detail|P2034/);
});
test('SMS database failures return generic 503 without writes', async () => {
    failures = ['DATABASE_DOWN'];
    const result = await post(valid());
    assert.equal(result.status, 503);
    assert.equal(attempts, 1);
    assert.equal(ledger.size, 0);
    assert.doesNotMatch(JSON.stringify(result.body), /DATABASE_DOWN|Internal database detail/);
});
