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
