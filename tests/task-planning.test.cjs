const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}) {
 const module = { exports: {} };
 const source = fs.readFileSync(file, 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, Date, require: name => dependencies[name] });
 return module.exports;
}

test('web and Android use the same calendar day and planning rules', () => {
 assert.equal(fs.readFileSync('src/lib/tasks/task-planning.ts', 'utf8'), fs.readFileSync('mobile-app/src/lib/task-planning.ts', 'utf8'));
 const { matchesTaskPlan, parseTaskDay, comparePlannedTasks, taskDay } = load('src/lib/tasks/task-planning.ts');
 const now = new Date(2026, 10, 6, 14);
 const task = (dueDate, status = 'TODO', priority = 'MEDIUM') => ({ dueDate, status, priority });
 assert.equal(taskDay(parseTaskDay('2026-11-06')), '2026-11-06');
 assert.equal(parseTaskDay('2026-02-30'), null);
 assert.equal(matchesTaskPlan(task('2026-11-06T00:00:00.000Z'), 'today', now), true);
 assert.equal(matchesTaskPlan(task('2026-11-05T00:00:00.000Z', 'DONE'), 'overdue', now), false);
 assert.equal(matchesTaskPlan(task('2026-11-13T00:00:00.000Z'), 'upcoming', now), true);
 assert.equal(matchesTaskPlan(task('2026-11-14T00:00:00.000Z'), 'upcoming', now), false);
 assert.equal(matchesTaskPlan(task(null), 'undated', now), true);
 assert.ok(comparePlannedTasks(task('2026-11-06T00:00:00.000Z'), task(null, 'TODO', 'URGENT')) < 0);
 assert.ok(comparePlannedTasks(task(null, 'TODO', 'URGENT'), task(null, 'TODO', 'LOW')) < 0);
});

test('bulk completion carries area into one recurring successor even if the task is reopened', async () => {
 let task = { id: 'task', userId: 'owner', status: 'TODO', area: 'OFFICE', title: 'Weekly review',
  frequency: 'WEEKLY', dueDate: new Date('2026-11-06T00:00:00Z'), tagIds: ['office-tag'] };
 const successors = [];
 const delegate = {
  findMany: async () => [{ id: task.id }],
  findUniqueOrThrow: async () => task,
  update: async ({ data }) => (task = { ...task, ...data }),
  create: async ({ data }) => { successors.push(data); },
 };
 const prisma = { task: delegate, $transaction: operation => operation({ task: delegate }) };
 const { bulkUpdateTaskStatus, updateTask } = load('src/lib/tasks/task-service.ts', { '@/lib/prisma': { prisma }, 'date-fns': require('date-fns') });
 await bulkUpdateTaskStatus('owner', { taskIds: ['task'], status: 'DONE' });
 await updateTask('owner', { id: 'task', status: 'DONE', title: 'Edited after completion' });
 await updateTask('owner', { id: 'task', status: 'TODO' });
 await updateTask('owner', { id: 'task', status: 'DONE' });
 assert.equal(successors.length, 1);
 assert.equal(successors[0].area, 'OFFICE');
 assert.equal(successors[0].dueDate.toISOString(), '2026-11-13T00:00:00.000Z');
 assert.deepEqual(successors[0].tagIds, ['office-tag']);
});


test('office sharing restricts visibility and uses the same task for a retried save', async () => {
 const rows = new Map();
 const delegate = {
  findUnique: async ({ where }) => rows.get(where.id)?.userId === where.userId ? rows.get(where.id) : null,
  findMany: async ({ where }) => [...rows.values()].filter(task => where.OR.some(scope =>
   Object.entries(scope).every(([key, value]) => task[key] === value))),
  create: async ({ data }) => {
   const task = { ...data, project: { name: 'Private project' }, tags: [{ name: 'Private tag' }] };
   rows.set(task.id, task);
   return task;
  },
  update: async ({ where, data }) => {
   const current = rows.get(where.id);
   if (!current || !Object.entries(where).every(([key, value]) => current[key] === value)) throw Error('Record not found');
   const task = { ...current, ...data };
   rows.set(task.id, task);
   return task;
  },
 };
 const prisma = {
  task: delegate,
  user: { findUnique: async () => ({ id: 'colleague', isActive: true }) },
 };
 const { createTask, getTasks, updateTask } = load('src/lib/tasks/task-service.ts', {
  '@/lib/prisma': { prisma }, 'date-fns': require('date-fns'), 'node:crypto': require('node:crypto'),
 });
 const draft = { title: 'Review work', area: 'OFFICE', jiraKey: 'OPS-142', colleague: 'Alex', shareWith: 'alex@example.test' };
 const office = await createTask('owner', draft, 'same-request');
 assert.equal((await createTask('owner', draft, 'same-request')).id, office.id);
 assert.equal((await getTasks('colleague')).length, 1);
 assert.equal((await getTasks('colleague'))[0].project, null);
 assert.equal((await getTasks('stranger')).length, 0);
 assert.equal(rows.size, 1);
 await assert.rejects(updateTask('stranger', { id: office.id, status: 'IN_PROGRESS' }, true), /not found/i);
 await updateTask('colleague', { id: office.id, status: 'IN_PROGRESS' }, true);
 assert.equal((await getTasks('owner'))[0].status, 'IN_PROGRESS');
 await updateTask('owner', { id: office.id, area: 'HEALTH' });
 assert.equal((await getTasks('colleague')).length, 0);
 assert.equal((await getTasks('owner'))[0].jiraKey, null);
});
