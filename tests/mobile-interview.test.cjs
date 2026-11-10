const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { z } = require('zod');
const USER = '507f1f77bcf86cd799439011';
const ID = '507f1f77bcf86cd799439012';
const OTHER = '507f1f77bcf86cd799439013';
function load(file, mocks, env = {}, fetchMock) {
  const filename = path.resolve(__dirname, '..', file);
  const module = { exports: {} };
  new vm.Script(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { filename }).runInNewContext({
    module, exports: module.exports, process: { env }, Buffer, AbortController, AbortSignal, setTimeout, clearTimeout,
    URL, Request, Response, Headers, console: { error() {}, log() {}, warn() {} },
    fetch: fetchMock || (() => { throw new Error('External API calls are forbidden in these tests'); }),
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unmocked interview dependency: ${name}`); },
  });
  return module.exports;
}
function harness({ authenticated = true, role = 'USER', questions = [], overrides = {}, realScopes = false, env = {}, transcript = ' Reviewed transcript. ', finishReason = 'STOP' } = {}) {
  const calls = [];
  const auth = { verifyAuth: async () => ({ isAuthenticated: authenticated, user: authenticated ? { id: USER, role, email: 'reader@example.test' } : null }) };
  const action = (name, value) => async (...args) => { calls.push({ name, args }); if (overrides[name]) return overrides[name](...args); return typeof value === 'function' ? value(...args) : value; };
  let interview = Object.fromEntries(['createQuestion', 'updateQuestion', 'deleteQuestion', 'bulkDeleteQuestions', 'bulkUploadQuestions', 'mergeQuestions'].map(name => [name, action(name, { success: true, id: ID })]));
  Object.assign(interview, { getTopics: action('getTopics', [{ id: 'React', name: 'React', count: 3 }]), getQuestions: action('getQuestions', () => [...questions]), getQuestionById: action('getQuestionById', questions[0] || null) });
  let goals = { getGoals: action('getGoals', []), getCompletedQuestions: action('getCompletedQuestions', []),
    ...Object.fromEntries(['addGoal', 'updateGoal', 'deleteGoal', 'toggleQuestionComplete'].map(name => [name, action(name, { completed: true })])) };
  let ai = { getAiModels: action('getAiModels', [{ id: ID, modelId: 'gemini-2.5-flash', name: 'Gemini', isActive: true }]), getAIJobs: action('getAIJobs', []),
    ...Object.fromEntries(['generateQuestionWithAI', 'startBulkBackgroundJob', 'deleteAIJob', 'cancelAIJob', 'addAiModel', 'updateAiModel', 'deleteAiModel'].map(name => [name, action(name, { success: true })])) };
  let mock = { getMockInterviewSessions: action('getMockInterviewSessions', []), getMockInterviewSessionById: action('getMockInterviewSessionById', null),
    ...Object.fromEntries(['submitMockInterview', 'retryMockInterviewAnswer', 'deleteMockInterviewSession'].map(name => [name, action(name, { success: true, sessionId: ID })])) };
  if (realScopes) {
    const db = {
      interviewGoal: { findMany: action('dbGoals', []), update: action('dbUpdateGoal', {}), delete: action('dbDeleteGoal', {}) },
      interviewProgress: { findMany: action('dbProgress', []) },
      mockInterviewSession: { findMany: action('dbSessions', []), findUnique: action('dbSession', null), delete: action('dbDeleteSession', {}) },
      aIGenerationJob: { findMany: action('dbJobs', []), delete: action('dbDeleteJob', {}) },
    };
    const shared = { '@/lib/prisma': { prisma: db }, '@/lib/auth-server': auth, 'next/cache': { revalidatePath() {} } };
    goals = load('src/actions/goal.ts', shared);
    mock = load('src/actions/mock-interview.ts', { ...shared, './ai': ai });
    ai = load('src/actions/ai.ts', { ...shared, 'next/server': { after() {} }, './interview': interview, '@/lib/utils': { normalizeQuestionTitle: value => value } });
  }
  const route = load('src/app/api/mobile/interview/route.ts', {
    '@/lib/auth-server': auth, zod: { z },
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@/actions/interview': interview, '@/actions/goal': goals, '@/actions/ai': ai, '@/actions/mock-interview': mock,
    '@/actions/interview-book': { syncInterviewBook: action('syncInterviewBook', { success: true }) },
    '@google/generative-ai': { GoogleGenerativeAI: class {
      constructor(key) { calls.push({ name: 'transcriptionKey', args: [key] }); }
      getGenerativeModel(options) {
        calls.push({ name: 'transcriptionModel', args: [options] });
        return { generateContent: action('transcribeAudio', { response: { candidates: [{ finishReason }], text: () => transcript } }) };
      }
    } },
  }, env);
  return { calls, get: query => route.GET(new Request(`https://app.test/api/mobile/interview?${query || ''}`)),
    post: value => route.POST(new Request('https://app.test/api/mobile/interview', { method: 'POST', body: typeof value === 'string' ? value : JSON.stringify(value) })) };
}
const question = overrides => ({ id: ID, title: 'Closures', topic: 'React', difficulty: 'Medium', estimatedTime: 10,
  companies: ['Meta'], tags: ['javascript'], problemStatement: 'Explain closures.', bestAnswer: 'A lexical scope is retained.', ...overrides });

test('unauthenticated reads and mutations are rejected without invoking actions', async () => {
  const app = harness({ authenticated: false });
  assert.equal((await app.get()).status, 401);
  assert.equal((await app.post({ operation: 'syncBook' })).status, 401);
  assert.equal(app.calls.length, 0);
});
test('overview is private and reports model management permission without exposing credentials', async () => {
  const app = harness();
  const response = await app.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.canManageModels, false);
  assert.equal(result.topics[0].name, 'React');
  assert.equal(JSON.stringify(result).includes('API_KEY'), false);
});
test('question lists paginate summaries while detail and decks retain study content', async () => {
  const questions = Array.from({ length: 35 }, (_, index) => question({ id: String(index).padStart(24, '0') }));
  const app = harness({ questions });
  const page = await (await app.get('resource=questions&page=2&topic=React&difficulty=Medium&search=closure')).json();
  assert.equal(page.items.length, 5); assert.equal(page.total, 35); assert.equal(page.totalPages, 2);
  assert.equal(page.items[0].problemStatement, undefined);
  assert.deepEqual(app.calls.find(call => call.name === 'getQuestions').args, ['React', 'Medium', 'closure']);
  const deck = await (await app.get('resource=deck&limit=3')).json();
  assert.equal(deck.length, 3); assert.equal(deck[0].bestAnswer, 'A lexical scope is retained.');
  assert.ok(app.calls.every(call => call.name !== 'generateQuestionWithAI'));
});
test('session, goal, progress, and job operations retain actual action user scoping', async () => {
  const app = harness({ realScopes: true });
  await app.get('resource=jobs&userId=' + OTHER);
  await app.get('resource=sessions&userId=' + OTHER);
  await app.get('resource=session&id=' + ID);
  await app.get('resource=progress');
  await app.post({ operation: 'saveGoal', id: ID, data: { title: 'Study', targetCount: 3, userId: OTHER } });
  await app.post({ operation: 'deleteSession', id: ID });
  await app.post({ operation: 'deleteJob', id: ID });
  for (const name of ['dbJobs', 'dbSessions', 'dbSession', 'dbProgress', 'dbUpdateGoal', 'dbDeleteSession', 'dbDeleteJob']) {
    const call = app.calls.find(item => item.name === name);
    assert.ok(call, name);
    assert.equal(call.args[0].where.userId, USER, name);
  }
  assert.equal(app.calls.find(call => call.name === 'dbUpdateGoal').args[0].data.userId, undefined);
});
test('goal progress uses its own filters and ignores leftover Explore search filters', async () => {
  const app = harness({ questions: [question(), question({ id: OTHER, topic: 'SQL', companies: ['Other'] })], overrides: {
    getGoals: () => [{ id: ID, title: 'React', targetCount: 4, topic: 'React', company: 'Meta', difficulty: 'Medium' }],
    getCompletedQuestions: () => [ID, OTHER],
  } });
  const result = await (await app.get('resource=goals&topic=wrong&search=wrong&company=wrong')).json();
  assert.equal(result[0].completedCount, 1);
  assert.deepEqual(app.calls.find(call => call.name === 'getQuestions').args, []);
});
test('malformed identifiers and request data are rejected before mutations', async () => {
  for (const body of [
    { operation: 'deleteQuestion', id: 'bad' }, { operation: 'saveQuestion', data: { title: 'Missing fields' } },
    { operation: 'saveGoal', data: { title: 'Study', targetCount: 0 } }, { operation: 'bulkDelete', ids: [] },
    { operation: 'mergeQuestions', keepId: ID, deleteId: ID, data: question() },
    { operation: 'submitMock', answers: [] }, null,
  ]) {
    const app = harness();
    assert.equal((await app.post(body)).status, 400);
    assert.equal(app.calls.length, 0);
  }
  const app = harness();
  assert.equal((await app.get('resource=session&id=bad')).status, 400);
  assert.equal((await app.post('{bad JSON')).status, 400);
});
test('question and goal saves validate fields and strip client-supplied ownership', async () => {
  const app = harness();
  assert.equal((await app.post({ operation: 'saveQuestion', data: question({ userId: OTHER }) })).status, 200);
  const saved = app.calls.find(call => call.name === 'createQuestion').args[0];
  assert.equal(saved.title, 'Closures'); assert.equal(saved.userId, undefined);
  assert.equal((await app.post({ operation: 'saveGoal', data: { title: 'Study', targetCount: '10', userId: OTHER } })).status, 200);
  assert.equal(app.calls.find(call => call.name === 'addGoal').args[0].targetCount, 10);
});
test('mock submission carries reviewed transcript and optional audio in the existing server action shape', async () => {
  const app = harness();
  const audioBase64 = 'data:audio/3gpp;base64,AQIDBA==';
  assert.equal((await app.post({ operation: 'submitMock', answers: [{ questionId: ID, transcript: ' My reviewed response. ', audioBase64 }] })).status, 200);
  const answer = app.calls.find(call => call.name === 'submitMockInterview').args[0][0];
  assert.equal(answer.questionId, ID); assert.equal(answer.transcript, 'My reviewed response.'); assert.equal(answer.audioBase64, audioBase64);
  for (const invalid of [
    { questionId: ID, transcript: ' ', audioBase64 }, { questionId: ID, transcript: 'ok', audioBase64: 'https://external.test/file' },
  ]) assert.equal((await app.post({ operation: 'submitMock', answers: [invalid] })).status, 400);
});
test('AI generation requires an active model and model administration requires an administrator', async () => {
  const app = harness();
  assert.equal((await app.post({ operation: 'generate', prompt: 'Explain closures', model: 'unknown' })).status, 400);
  assert.equal((await app.post({ operation: 'generate', prompt: 'Explain closures', model: 'gemini-2.5-flash' })).status, 200);
  assert.deepEqual(app.calls.find(call => call.name === 'generateQuestionWithAI').args, ['Explain closures', undefined, 'gemini-2.5-flash']);
  assert.equal((await app.post({ operation: 'saveModel', data: { name: 'Model', modelId: 'other' } })).status, 403);
  assert.equal((await app.post({ operation: 'deleteModel', id: ID })).status, 403);
  assert.equal(app.calls.some(call => call.name === 'addAiModel' || call.name === 'deleteAiModel'), false);
});
test('server exceptions and action failures never return raw provider or database diagnostics', async () => {
  const secret = 'mongodb://private-host API_KEY=secret';
  const app = harness({ overrides: { getTopics: () => { throw new Error(secret); }, createQuestion: () => ({ success: false, error: secret }) } });
  const failedRead = await app.get('resource=topics');
  assert.equal(failedRead.status, 500); assert.equal((await failedRead.text()).includes(secret), false);
  const failedWrite = await app.post({ operation: 'saveQuestion', data: question() });
  assert.equal(failedWrite.status, 400); assert.equal((await failedWrite.text()).includes(secret), false);
});

test('explicit transcription sends bounded inline audio and returns editable text without submitting a session', async () => {
  const app = harness({ env: { GEMINI_API_KEY: 'test-key' } });
  const response = await app.post({ operation: 'transcribe', audioBase64: 'data:audio/m4a;base64,AQIDBA==' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { transcript: 'Reviewed transcript.' });
  assert.equal(app.calls.find(call => call.name === 'transcriptionModel').args[0].model, 'gemini-2.5-flash');
  const [parts, options] = app.calls.find(call => call.name === 'transcribeAudio').args;
  assert.equal(parts[1].inlineData.mimeType, 'audio/m4a');
  assert.equal(parts[1].inlineData.data, 'AQIDBA==');
  assert.equal(options.signal.aborted, false);
  assert.equal(app.calls.some(call => call.name === 'submitMockInterview'), false);
});

test('transcription rejects missing configuration, malformed media, and oversized requests without provider calls', async () => {
  const missing = harness();
  assert.equal((await missing.post({ operation: 'transcribe', audioBase64: 'data:audio/m4a;base64,AQIDBA==' })).status, 503);
  assert.equal(missing.calls.length, 0);
  for (const audioBase64 of ['https://external.test/audio', 'data:audio/m4a;base64,A===', 'data:video/mp4;base64,AQIDBA==', 'data:audio/3gpp;base64,AQIDBA==']) {
    const app = harness({ env: { GEMINI_API_KEY: 'key' } });
    assert.equal((await app.post({ operation: 'transcribe', audioBase64 })).status, 400);
    assert.equal(app.calls.length, 0);
  }
  const app = harness({ env: { GEMINI_API_KEY: 'key' } });
  assert.equal((await app.post({ operation: 'transcribe', audioBase64: 'data:audio/m4a;base64,' + 'A'.repeat(4_200_000) })).status, 413);
  assert.equal(app.calls.length, 0);
});

test('failed, silent, or truncated transcription never replaces reviewed text with partial output or diagnostics', async () => {
  for (const options of [
    { transcript: '' }, { finishReason: 'MAX_TOKENS' },
    { overrides: { transcribeAudio: () => { throw new Error('API_KEY=secret upstream details'); } } },
  ]) {
    const app = harness({ ...options, env: { GEMINI_API_KEY: 'key' } });
    const response = await app.post({ operation: 'transcribe', audioBase64: 'data:audio/m4a;base64,AQIDBA==' });
    assert.ok([422, 502].includes(response.status));
    const body = await response.json();
    assert.equal(body.transcript, undefined);
    assert.equal(JSON.stringify(body).includes('secret'), false);
  }
});


test('mobile starts a bulk generation with the selected model and validated count', async () => {
  const app = harness({ overrides: { startBulkBackgroundJob: () => ({ success: true, count: 2 }) } });
  const submit = count => app.post({ operation: 'startBulkGeneration', model: 'selected-model', count });
  for (const count of [0, 11, 2.5, '2']) assert.equal((await submit(count)).status, 400);
  assert.equal(app.calls.length, 0);
  assert.deepEqual(await (await submit(3)).json(), { success: true, count: 2 });
  assert.deepEqual(app.calls[0].args, ['selected-model', 3]);
});

const generatedAnswer = () => Response.json({
  candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Generated title', bestAnswer: 'Generated answer.' }) }] } }],
});

function bulkHarness(getResponse = generatedAnswer) {
  const queued = [];
  const callbacks = [];
  const questions = [
    { id: 'a', title: 'First', bestAnswer: 'TODO' },
    { id: 'b', title: 'Second', bestAnswer: ' ' },
    { id: 'c', title: 'Answered', bestAnswer: 'A short but valid answer.' },
    { id: 'd', title: 'Already queued', bestAnswer: '(Please update via UI)' },
  ].map(item => ({ ...item, updatedAt: new Date(0), problemStatement: item.title }));
  queued.push({ id: 'existing', userId: OTHER, questionId: 'd', status: 'QUEUED', updatedAt: new Date() });

  const aIGenerationJob = {
    findMany: async () => queued,
    createMany: async ({ data }) => {
      queued.push(...data.map(job => ({ ...job, id: job.questionId, updatedAt: new Date() })));
      return { count: data.length };
    },
    findFirst: async ({ where }) => queued.find(job => job.userId === where.userId && job.status === 'RUNNING')
      || queued.find(job => job.userId === where.userId && job.status === 'QUEUED'),
    updateMany: async ({ where, data }) => {
      const job = queued.find(job => job.id === where.id && job.status === where.status);
      if (job) Object.assign(job, data);
      return { count: Number(!!job) };
    },
  };
  const interviewQuestion = {
    findMany: async () => questions,
    findUnique: async ({ where }) => questions.find(item => item.id === where.id),
    updateMany: async ({ where, data }) => {
      const item = questions.find(item => item.id === where.id && item.updatedAt === where.updatedAt);
      if (item) Object.assign(item, data);
      return { count: Number(!!item) };
    },
  };
  const db = { aIGenerationJob, interviewQuestion,
    aiModel: { findUnique: async ({ where }) => where.modelId === 'selected-model' && where.isActive ? where : null },
    $transaction: callback => callback(db),
  };
  const apiCalls = [];
  const ai = load('src/actions/ai.ts', {
    '@/lib/prisma': { prisma: db },
    '@/lib/auth-server': { verifyAuth: async () => ({ isAuthenticated: true, user: { id: USER } }) },
    'next/cache': { revalidatePath() {} },
    'next/server': { after(callback) { callbacks.push(callback); } },
    './interview': {},
    '@/lib/utils': {},
  }, { GEMINI_API_KEY: 'test-key' }, async url => {
    assert.match(url, /models\/selected-model:generateContent/);
    const running = queued.filter(job => job.status === 'RUNNING');
    assert.equal(running.length, 1);
    apiCalls.push(running[0].questionId);
    return getResponse(apiCalls);
  });
  return { ai, queued, callbacks, questions, apiCalls };
}

test('bulk generation queues only placeholders and saves them sequentially', async () => {
  const { ai, queued, callbacks, questions, apiCalls } = bulkHarness();
  assert.equal((await ai.startBulkBackgroundJob('inactive-model', 3)).success, false);
  assert.equal((await ai.startBulkBackgroundJob('selected-model', 3)).count, 2);
  assert.deepEqual(queued.slice(1).map(job => job.status), ['QUEUED', 'QUEUED']);
  assert.equal(apiCalls.length, 0);
  await callbacks[0]();
  assert.deepEqual(apiCalls.sort(), ['a', 'b']);
  assert.deepEqual(queued.slice(1).map(job => job.status), ['COMPLETED', 'COMPLETED']);
  assert.deepEqual(questions.map(item => item.bestAnswer), [
    'Generated answer.', 'Generated answer.', 'A short but valid answer.', '(Please update via UI)',
  ]);
  assert.equal(questions[0].title, 'First');
});


test('Gemini rate limits fail the current question immediately and the queue advances', async t => {
  for (const stage of ['generation', 'continuation', 'JSON repair']) {
    await t.test(stage, async () => {
      const { ai, queued, callbacks, apiCalls } = bulkHarness(calls => {
        if (calls.at(-1) !== calls[0]) return generatedAnswer();
        if (calls.length === 1 && stage !== 'generation') {
          return Response.json({
            candidates: [{
              finishReason: stage === 'continuation' ? 'MAX_TOKENS' : 'STOP',
              content: { parts: [{ text: 'incomplete response' }] },
            }],
          });
        }
        return new Response(null, { status: 429 });
      });

      await ai.startBulkBackgroundJob('selected-model', 2);
      await callbacks[0]();
      const [first, second] = queued.slice(1);
      assert.deepEqual(apiCalls, [
        first.questionId,
        ...(stage === 'generation' ? [] : [first.questionId]),
        second.questionId,
      ]);
      assert.equal(first.status, 'FAILED');
      assert.match(first.errorReason, /HTTP 429/);
      assert.equal(second.status, 'COMPLETED');
    });
  }
});
