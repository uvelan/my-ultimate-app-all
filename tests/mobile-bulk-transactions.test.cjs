const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const { z } = require('zod');

const categoryId = 'a'.repeat(24);
const transaction = { type: 'EXPENSE', amountPaise: 12345, categoryId, transactionDate: '2026-10-19T00:00:00.000Z', paymentMethod: 'UPI' };
function harness({ authenticated = true, categories = [{ id: categoryId, type: 'EXPENSE' }], fail = false } = {}) {
    const calls = [];
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/app/api/mobile/transactions/bulk/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new vm.Script(source).runInNewContext({ module, exports: module.exports, require(name) {
        if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
        if (name === 'zod') return { z };
        if (name === '@/lib/auth-server') return { verifyAuth: async () => ({ isAuthenticated: authenticated, user: authenticated ? { id: 'owner' } : null }) };
        if (name === '@/lib/prisma') return { prisma: { category: { findMany: async args => { calls.push({ query: args }); return categories; } } } };
        if (name === '@/actions/transaction') return { addBulkTransactions: async items => { calls.push({ items }); if (fail) throw Error('private database details'); return items; } };
        throw Error(name);
    } });
    return { calls, post: body => module.exports.POST(new Request('https://app.test/api/mobile/transactions/bulk', { method: 'POST', body: JSON.stringify(body) })) };
}
test('bulk transaction authentication happens before database access', async () => {
    const app = harness({ authenticated: false });
    assert.equal((await app.post({ transactions: [transaction] })).status, 401);
    assert.equal(app.calls.length, 0);
});
test('bulk import validates count, integer amounts and real ISO input before writing', async () => {
    for (const transactions of [[], Array(101).fill(transaction), [{ ...transaction, amountPaise: 1.2 }], [{ ...transaction, amountPaise: 2147483648 }], [{ ...transaction, transactionDate: 'bad' }]]) {
        const app = harness();
        assert.equal((await app.post({ transactions })).status, 400);
        assert.equal(app.calls.length, 0);
    }
});
test('bulk import rejects missing or wrong-type categories and scopes lookup to active owned categories', async () => {
    for (const categories of [[], [{ id: categoryId, type: 'INCOME' }]]) {
        const app = harness({ categories });
        assert.equal((await app.post({ transactions: [transaction] })).status, 400);
        assert.equal(app.calls.length, 1);
        assert.equal(app.calls[0].query.where.userId, 'owner');
        assert.equal(app.calls[0].query.where.isArchived, false);
    }
});
test('bulk import delegates all reviewed rows once to the atomic action with Date values', async () => {
    const app = harness();
    assert.equal((await app.post({ transactions: [transaction, { ...transaction, amountPaise: 999 }] })).status, 201);
    assert.equal(app.calls.length, 2);
    assert.equal(app.calls[1].items.length, 2);
    assert.equal(app.calls[1].items[0].transactionDate.toISOString(), transaction.transactionDate);
});
test('bulk import returns a generic retry response after atomic failure', async () => {
    const app = harness({ fail: true });
    const response = await app.post({ transactions: [transaction] });
    assert.equal(response.status, 503);
    assert.doesNotMatch(JSON.stringify(await response.json()), /private database/);
});
