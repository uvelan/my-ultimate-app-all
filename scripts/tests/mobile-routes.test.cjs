// Run with: node --test scripts/tests/mobile-routes.test.cjs
// Routes execute against in-memory adapters. No network, database, import, or export runs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const id = '0123456789abcdef01234567';
let authenticated, role, category, task, calls, targetRole;
const delegate = { findFirst: async () => null, findMany: async () => [], count: async () => 0, create: async value => value.data, update: async value => value.data, delete: async () => ({}), updateMany: async () => ({ count: 0 }) };
const prisma = { transaction: { ...delegate }, category: { ...delegate, findFirst: async () => category }, budget: { ...delegate }, recurringTransaction: { ...delegate }, task: { ...delegate, findFirst: async () => task }, project: { ...delegate }, tag: { ...delegate }, $transaction: async values => Promise.all(values) };
prisma.user = { ...delegate, findUnique: async () => ({ id, role: targetRole }), update: async options => { calls.push(options); return { id, role: options.data.role || targetRole }; }, findMany: async () => { calls.push('user read'); return []; } };
for (const name of ['chapterAudio', 'ttsAudioCacheState', 'ttsAudioCacheChunk']) prisma[name] = { findMany: async () => { throw new Error(`Binary cache delegate ${name} must not be read`); } };
const actions = {
    getTransactions: async options => { calls.push(options); return { transactions: [], total: 0, totalPages: 0, page: options.page }; },
    getDashboardAggregates: async () => ({ totalIncome: 0, totalExpense: 0, netSavings: 0, categorySpending: {}, methodSpending: {}, dailyCashFlow: {} }), addTransaction: async data => { calls.push(data); return data; }, updateTransaction: async () => ({}), deleteTransaction: async () => ({}),
    getCategories: async () => [], getBudgets: async () => [], getRecurringTransactions: async () => [], upsertBudget: async data => data, addCategory: async data => data, updateCategory: async () => ({}), archiveCategory: async () => ({}), deleteBudget: async () => ({}), upsertRecurringTransaction: async data => data, deleteRecurringTransaction: async () => ({}),
    getAiModels: async () => [{ id, isActive: true }, { id: 'disabled', isActive: false }], addAiModel: async () => ({ success: true }), updateAiModel: async () => ({ success: true }), deleteAiModel: async () => ({ success: true }),
};
function compile(file) {
    const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    const mockedRequire = name => {
        if (name === 'next/server') {
            class NextResponse { constructor(body, options = {}) { this.body = body; this.status = options.status || 200; } static json(body, options) { return new NextResponse(body, options); } }
            return { NextResponse };
        }
        if (name === 'next/cache') return { revalidatePath: () => {} };
        if (name === '@/lib/auth-server') return { verifyAuth: async () => ({ isAuthenticated: authenticated, user: authenticated ? { id, role } : null }) };
        if (name === '@/lib/prisma') return { prisma };
        if (name === '@/lib/auth-node') return { hashPassword: async () => 'not-a-real-password-hash' };
        if (name === '@prisma/client') return { ...require('@prisma/client'), Prisma: { dmmf: { datamodel: { models: ['User', 'ChapterAudio', 'TtsAudioCacheState', 'TtsAudioCacheChunk'].map(name => ({ name })) } } } };
        if (name.startsWith('@/actions/')) return actions;
        if (name === '@/lib/tasks/task-schema') return compile('src/lib/tasks/task-schema.ts');
        if (name === '@/lib/tasks/task-service') return { getTasks: async () => [], getProjects: async () => [], getTags: async () => [], createTask: async (_, data) => data, updateTask: async (_, data) => { calls.push(data); return data; }, deleteTask: async () => {}, bulkDeleteTasks: async () => {} };
        return require(name);
    };
    vm.runInNewContext(output, { require: mockedRequire, module, exports: module.exports, console, Date, Set, Map }, { filename: file });
    return module.exports;
}
const finance = compile('src/app/api/mobile/finance/route.ts');
const tasks = compile('src/app/api/mobile/tasks/route.ts');
const settings = compile('src/app/api/mobile/settings/route.ts');
const users = compile('src/app/api/admin/users/route.ts');
const userDetails = compile('src/app/api/admin/users/[id]/route.ts');
const dataExport = compile('src/app/api/admin/data-sync/export/route.ts');
const dataImport = compile('src/app/api/admin/data-sync/import/route.ts');
const request = (method, body = {}, query = '') => ({ method, json: async () => body, nextUrl: new URL(`http://local/api?${query}`) });
const txn = { type: 'EXPENSE', amountPaise: 12300, categoryId: id, transactionDate: '2026-10-18T00:00:00Z', paymentMethod: 'UPI' };
beforeEach(() => { authenticated = true; role = 'USER'; targetRole = 'USER'; category = { id, userId: id, type: 'EXPENSE', isArchived: false }; task = null; calls = []; });

test('finance rejects unauthenticated reads', async () => {
    authenticated = false;
    assert.equal((await finance.GET(request('GET'))).status, 401);
});
test('tasks rejects unauthenticated reads', async () => {
    authenticated = false;
    assert.equal((await tasks.GET()).status, 401);
});
test('finance validates month and pagination bounds', async () => {
    assert.equal((await finance.GET(request('GET', {}, 'month=2026-99'))).status, 400);
    assert.equal((await finance.GET(request('GET', {}, 'resource=transactions&limit=201'))).status, 400);
});
test('finance listing preserves pagination and has no implicit all-time date range', async () => {
    assert.equal((await finance.GET(request('GET', {}, 'resource=transactions&page=2&limit=50'))).status, 200);
    assert.equal(calls[0].page, 2);
    assert.equal(calls[0].limit, 50);
    assert.equal(calls[0].startDate, undefined);
});
test('finance listing validates and forwards category and search filters', async () => {
    assert.equal((await finance.GET(request('GET', {}, `resource=transactions&categoryId=${id}&search=coffee`))).status, 200);
    assert.equal(calls[0].categoryId, id);
    assert.equal(calls[0].search, 'coffee');
    assert.equal((await finance.GET(request('GET', {}, 'resource=transactions&categoryId=invalid'))).status, 400);
});
test('non-transaction resources ignore unrelated stale filters and pagination', async () => {
    for (const resource of ['categories', 'recurring']) {
        const response = await finance.GET(request('GET', {}, `resource=${resource}&month=invalid&page=0&limit=null&startDate=undefined&type=ALL`));
        assert.equal(response.status, 200, resource);
    }
    assert.equal((await finance.GET(request('GET', {}, 'resource=budgets&month=2026-10&page=0&limit=null&startDate=undefined'))).status, 200);
    assert.equal((await finance.GET(request('GET', {}, 'resource=stats&page=0&limit=null&type=ALL&categoryId=undefined'))).status, 200);
    assert.equal((await finance.GET(request('GET', {}, 'resource=transactions&page=0'))).status, 400, 'relevant transaction pagination is still validated');
});
test('all actual native finance services serialize valid default, period and pagination queries', async () => {
    const axios = require(path.join(root, 'mobile-app/node_modules/axios/dist/node/axios.cjs'));
    const observed = [];
    const nativeApi = { get: async (url, config = {}) => {
        const uri = axios.getUri({ baseURL: 'https://native.test/api', url, ...config });
        observed.push(uri);
        const response = await finance.GET({ nextUrl: new URL(uri) });
        assert.equal(response.status, 200, `${uri}: ${JSON.stringify(response.body)}`);
        return { data: response.body };
    } };
    const compileClient = (file, dependencies) => {
        const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const mod = { exports: {} };
        vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Map, Set, require: name => {
            assert.ok(Object.prototype.hasOwnProperty.call(dependencies, name), `unexpected dependency ${name}`);
            return dependencies[name];
        } }, { filename: file });
        return mod.exports;
    };
    const { financeService } = compileClient('mobile-app/src/services/finance.service.ts', { '../lib/api-client': { api: nativeApi } });
    const { expenseService, incomeService } = compileClient('mobile-app/src/services/features.service.ts', { '../lib/api-client': { api: nativeApi }, './finance.service': { financeService } });
    const startDate = new Date('2026-10-01T00:00:00+05:30').toISOString();
    const endDate = new Date('2026-10-31T23:59:59+05:30').toISOString();
    assert.equal((await financeService.categories()).length, 0);
    await financeService.categories(true);
    const snapshot = await financeService.snapshot({ month: '2026-10' });
    assert.ok(Array.isArray(snapshot.transactions));
    await financeService.snapshot();
    await expenseService.getExpenses(startDate, endDate);
    await incomeService.getIncomes(startDate, endDate);
    assert.equal((await expenseService.getStats(startDate, endDate)).totalExpense, 0);
    assert.ok(Array.isArray((await expenseService.getHistorical()).chartData));
    await nativeApi.get('/mobile/finance', { params: { resource: 'categories' } }); // SMS focus request
    await nativeApi.get('/mobile/finance', { params: { resource: 'transactions', type: undefined, categoryId: undefined, search: undefined, startDate: undefined, endDate: undefined, page: 1, limit: 50 } });
    assert.ok(observed.some(uri => uri.includes('includeArchived=false')));
    assert.ok(observed.some(uri => uri.includes('page=1&limit=200')));
    assert.ok(observed.every(uri => !uri.includes('undefined') && !uri.includes('null')), 'Axios omits absent native optional values');
});
test('finance rejects a category outside the current user', async () => {
    category = null;
    assert.equal((await finance.POST(request('POST', { resource: 'transactions', data: txn }))).status, 400);
    assert.equal(calls.length, 0);
});
test('finance rejects category/type mismatches', async () => {
    category.type = 'INCOME';
    assert.equal((await finance.POST(request('POST', { resource: 'transactions', data: txn }))).status, 400);
});
test('finance rejects nonpositive and fractional paise amounts', async () => {
    for (const amountPaise of [-1, 0, 1.5]) assert.equal((await finance.POST(request('POST', { resource: 'transactions', data: { ...txn, amountPaise } }))).status, 400);
});
test('finance converts ISO dates and preserves integer paise before calling web action', async () => {
    assert.equal((await finance.POST(request('POST', { resource: 'transactions', data: txn }))).status, 201);
    assert.equal(calls[0].transactionDate instanceof Date, true);
    assert.equal(calls[0].amountPaise, 12300);
});
test('finance deletion hides records not owned by current user', async () => {
    assert.equal((await finance.DELETE(request('DELETE', { resource: 'transactions', id }))).status, 404);
});
test('tasks rejects projects outside the current user', async () => {
    assert.equal((await tasks.POST(request('POST', { resource: 'tasks', data: { title: 'Task', projectId: id } }))).status, 400);
});
test('tasks rejects tags outside the current user', async () => {
    assert.equal((await tasks.POST(request('POST', { resource: 'tasks', data: { title: 'Task', tagIds: [id] } }))).status, 400);
});
test('tasks rejects malformed dates', async () => {
    assert.equal((await tasks.POST(request('POST', { resource: 'tasks', data: { title: 'Task', dueDate: 'invalid' } }))).status, 400);
});
test('tasks creates a task through the shared service', async () => {
    assert.equal((await tasks.POST(request('POST', { resource: 'tasks', data: { title: 'Task', tagIds: [] } }))).status, 201);
});
test('saving an already completed task does not spawn another recurrence', async () => {
    task = { id, userId: id, status: 'DONE', startDate: null, dueDate: null };
    assert.equal((await tasks.PATCH(request('PATCH', { resource: 'tasks', id, data: { status: 'DONE' } }))).status, 200);
    assert.equal(calls[0].status, undefined);
});
test('bulk task updates reject IDs outside the current user', async () => {
    assert.equal((await tasks.POST(request('POST', { resource: 'bulk', data: { taskIds: [id], status: 'DONE' } }))).status, 404);
});
test('ordinary users can read only active model choices', async () => {
    const result = await settings.GET();
    assert.equal(result.body.models.length, 1);
    assert.equal(result.body.canManageModels, false);
});
test('ordinary users cannot change global model settings', async () => {
    assert.equal((await settings.POST(request('POST', { data: { modelId: 'example', name: 'Example' } }))).status, 403);
});
test('administrators can view inactive model choices', async () => {
    role = 'ADMIN';
    assert.equal((await settings.GET()).body.models.length, 2);
});
test('admin user listing uses shared auth and rejects ordinary users', async () => {
    assert.equal((await users.GET()).status, 403);
    role = 'ADMIN';
    assert.equal((await users.GET()).status, 200);
});
test('administrators cannot delete users or grant superuser role', async () => {
    role = 'ADMIN';
    const params = { params: Promise.resolve({ id }) };
    assert.equal((await userDetails.DELETE(request('DELETE'), params)).status, 403);
    assert.equal((await userDetails.PATCH(request('PATCH', { role: 'SUPERUSER' }), params)).status, 403);
});
test('user update selects safe response fields and excludes password hash', async () => {
    role = 'SUPERUSER';
    assert.equal((await userDetails.PATCH(request('PATCH', { role: 'ADMIN' }), { params: Promise.resolve({ id }) })).status, 200);
    assert.equal(calls[0].select.email, true);
    assert.equal(calls[0].select.password, undefined);
});
test('database export excludes all three audio cache tables without reading them', async () => {
    role = 'SUPERUSER';
    const response = await dataExport.GET();
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(JSON.parse(response.body)), ['User']);
    assert.deepEqual(calls, ['user read']);
});
test('database import rejects an invalid mode before any mutation', async () => {
    role = 'SUPERUSER';
    const response = await dataImport.POST({ formData: async () => new Map([['mode', 'INVALID'], ['file', {}]]) });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
});
test('database import rejects empty replacement backup before clearing tables', async () => {
    role = 'SUPERUSER';
    const file = { text: async () => '{}', size: 2 };
    const response = await dataImport.POST({ formData: async () => new Map([['mode', 'REPLACE'], ['file', file]]) });
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
});
