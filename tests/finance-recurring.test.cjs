const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { z } = require('zod');

const NOW = new Date('2026-10-16T12:00:00.000Z');
const enums = {
  Frequency: { DAILY: 'DAILY', WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY', YEARLY: 'YEARLY' },
  TransactionType: { INCOME: 'INCOME', EXPENSE: 'EXPENSE' },
};
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
  static now() { return NOW.getTime(); }
}

// Load the real action/page code while preventing real database/framework imports.
function loadTs(relativePath, mocks) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module, exports: module.exports, Date: ClockDate,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unmocked finance dependency: ${name}`);
    },
    console: { log() {}, warn() {}, error() {} },
  });
  new vm.Script(source, { filename }).runInContext(context);
  return module.exports;
}

function recurringRow(overrides = {}) {
  return {
    id: 'recurring-1', userId: 'reader-1', type: 'EXPENSE', amountPaise: 2500,
    categoryId: 'category-1', description: 'Daily expense', paymentMethod: 'UPI',
    frequency: 'DAILY', startDate: new Date('2026-10-15T12:00:00.000Z'),
    endDate: null, lastProcessed: null, isActive: true, ...overrides,
  };
}

function harness({ rows = [recurringRow()], auth = { isAuthenticated: true, user: { id: 'reader-1' } }, allowInvalidation = false, existing = false } = {}) {
  const calls = { reads: [], created: [], updates: [], schedulesCreated: [], schedulesUpdated: [], invalidations: [], order: [] };
  const prisma = {
    recurringTransaction: {
      async findMany(args) { calls.reads.push(args); calls.order.push('read-schedules'); return rows; },
      async create(args) {
        calls.schedulesCreated.push(args);
        calls.order.push('create-schedule');
        const row = recurringRow({ ...args.data });
        rows.push(row);
        return row;
      },
      async update(args) {
        const row = rows.find(value => value.id === args.where.id);
        assert.ok(row, 'the mutation targets an existing schedule');
        if (Object.hasOwn(args.data, 'lastProcessed')) {
          calls.updates.push(args);
          calls.order.push('mark-processed');
        } else {
          calls.schedulesUpdated.push(args);
          calls.order.push('update-schedule');
        }
        Object.assign(row, args.data);
        return row;
      },
    },
    transaction: {
      async findFirst() { return existing ? { id: 'existing-transaction' } : null; },
      async create(args) { calls.created.push(args); calls.order.push('create-transaction'); return { id: `transaction-${calls.created.length}`, ...args.data }; },
    },
  };
  const actions = loadTs('src/actions/recurring.ts', {
    '@/lib/prisma': { prisma },
    '@/lib/auth-server': { verifyAuth: async () => auth },
    '@prisma/client': enums,
    zod: { z },
    'next/cache': { revalidatePath(...args) {
      calls.invalidations.push(args);
      calls.order.push('invalidate');
      if (!allowInvalidation) throw new Error('revalidatePath is forbidden while a page is rendering');
    } },
  });
  return { actions, calls };
}

test('due recurring transactions are processed during rendering without cache invalidation', async () => {
  const { actions, calls } = harness();
  await actions.processRecurringTransactions();
  assert.equal(calls.created.length, 2);
  assert.deepEqual(calls.created.map(call => call.data.sourceId), ['recurring-1_2026-10-15', 'recurring-1_2026-10-16']);
  for (const { data } of calls.created) {
    assert.equal(data.userId, 'reader-1');
    assert.equal(data.amountPaise, 2500);
    assert.equal(data.sourceModel, 'RECURRING');
  }
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].data.lastProcessed.toISOString(), '2026-10-17T12:00:00.000Z');
  assert.equal(calls.reads[0].where.userId, 'reader-1');
  assert.equal(calls.reads[0].where.isActive, true);
  assert.equal(calls.invalidations.length, 0);
});

test('future schedules do not create transactions or move the processing cursor', async () => {
  const { actions, calls } = harness({ rows: [recurringRow({ startDate: new Date('2026-10-17T12:00:00.000Z') })] });
  await actions.processRecurringTransactions();
  assert.equal(calls.reads.length, 1);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.invalidations.length, 0);
});

test('unauthenticated processing never reads or mutates finance records', async t => {
  for (const auth of [{ isAuthenticated: false }, { isAuthenticated: true, user: {} }]) {
    await t.test(auth.isAuthenticated ? 'missing user ID' : 'not authenticated', async () => {
      const { actions, calls } = harness({ auth });
      await actions.processRecurringTransactions();
      assert.equal(calls.reads.length, 0);
      assert.equal(calls.created.length, 0);
      assert.equal(calls.updates.length, 0);
      assert.equal(calls.invalidations.length, 0);
    });
  }
});

test('existing generated transactions are not duplicated and processing remains render-safe', async () => {
  const { actions, calls } = harness({ existing: true });
  await actions.processRecurringTransactions();
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.invalidations.length, 0);
});

test('creating or updating a recurring schedule invalidates the finance layout after processing', async t => {
  for (const update of [false, true]) {
    await t.test(update ? 'update schedule' : 'create schedule', async () => {
      const { actions, calls } = harness({ rows: update ? [recurringRow()] : [], allowInvalidation: true });
      const input = recurringRow({ startDate: new Date(NOW), ...(update ? { id: 'recurring-1' } : { id: undefined }) });
      await actions.upsertRecurringTransaction(input);
      assert.equal(calls.schedulesCreated.length, update ? 0 : 1);
      assert.equal(calls.schedulesUpdated.length, update ? 1 : 0);
      const mutation = update ? calls.schedulesUpdated[0] : calls.schedulesCreated[0];
      assert.equal(update ? mutation.where.userId : mutation.data.userId, 'reader-1');
      assert.equal(calls.created.length, 1, 'a schedule due now is processed before the action completes');
      assert.equal(calls.updates.length, 1);
      assert.deepEqual(calls.invalidations, [['/finance', 'layout']]);
      assert.ok(calls.order.indexOf('invalidate') > calls.order.indexOf('mark-processed'));
    });
  }
});

test('unauthenticated upsert fails before database mutations or invalidation', async () => {
  const { actions, calls } = harness({ auth: { isAuthenticated: false }, allowInvalidation: true });
  await assert.rejects(actions.upsertRecurringTransaction(recurringRow()), /Unauthorized/);
  assert.equal(calls.reads.length, 0);
  assert.equal(calls.schedulesCreated.length, 0);
  assert.equal(calls.schedulesUpdated.length, 0);
  assert.equal(calls.invalidations.length, 0);
});

test('finance dashboard and transactions pages can render while processing due schedules', async t => {
  for (const page of ['dashboard', 'transactions']) {
    await t.test(page, async () => {
      const { actions, calls } = harness();
      const readFinanceData = () => {
        assert.equal(calls.created.length, 2, 'the page processes due schedules before reading finance data');
        assert.equal(calls.updates.length, 1);
      };
      const aggregates = { totalIncome: 0, totalExpense: 5000, netSavings: -5000, categorySpending: {}, methodSpending: {}, dailyCashFlow: {} };
      const client = () => {};
      const pageModule = loadTs(`src/app/(protected)/finance/${page}/page.tsx`, {
        '@/actions/recurring': actions,
        '@/actions/transaction': {
          async getDashboardAggregates() { readFinanceData(); return aggregates; },
          async getTransactions() { readFinanceData(); return { transactions: [], total: 2, totalPages: 1 }; },
        },
        '@/actions/category': { getCategories: async () => [] },
        './DashboardClient': { __esModule: true, default: client },
        './TransactionsClient': { __esModule: true, default: client },
        '@prisma/client': enums,
        'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
      });
      const rendered = await pageModule.default({ searchParams: Promise.resolve({}) });
      assert.equal(rendered.type, client);
      assert.equal(page === 'dashboard' ? rendered.props.totalExpense : rendered.props.total, page === 'dashboard' ? 5000 : 2);
      assert.equal(calls.invalidations.length, 0);
    });
  }
});
