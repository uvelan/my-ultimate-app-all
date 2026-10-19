const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Execute the real TSX and event handlers with lightweight hook/native doubles.
// This catches render-time expressions even inside an invisible native Modal;
// it does not simulate Android's native audio engine or request microphone access.
function harness(data = {}, options = {}) {
  const state = [], refs = [], effects = [], callbacks = [];
  let stateIndex, refIndex, effectIndex, callbackIndex, tree;
  const requests = [], nativeCalls = [], alerts = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    createElement(type, props, ...children) {
      const values = { ...props, children };
      return typeof type === 'function' ? type(values) : { type, props: values, children };
    }, Fragment: 'Fragment',
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useCallback(fn, deps) {
      const index = callbackIndex++;
      if (!same(callbacks[index]?.deps, deps)) callbacks[index] = { fn, deps };
      return callbacks[index].fn;
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      const previous = effects[index];
      if (!same(previous?.deps, deps)) effects[index] = { fn, deps, pending: true, cleanup: previous?.cleanup };
    },
  };
  const defaults = { overview: { topics: [], goals: [], completed: [], models: [], canManageModels: false },
    questions: { items: [], total: 0, page: 1, totalPages: 0 }, goals: [], deck: [], sessions: [], jobs: [] };
  const service = { async read(resource, params) { requests.push({ resource, params }); return data[resource] ?? defaults[resource]; },
    async act() { throw new Error('Unexpected mutation'); } };
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Modal', 'RefreshControl', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(name => [name, name]));
  native.Platform = { OS: 'android' };
  native.StyleSheet = { create: value => value };
  native.Alert = { alert: (...args) => alerts.push(args) };
  let released = false, recorderReleased = false, recordingListener;
  const player = Object.fromEntries(['pause', 'play', 'replace'].map(name => [name, (...args) => {
    if (released) throw new Error(`AudioPlayer.${name} called after release`);
    nativeCalls.push({ name, args });
  }]));
  const recorder = { get isRecording() { if (recorderReleased) throw new Error('Recorder property read after release'); return false; },
    async prepareToRecordAsync() { if (recorderReleased) throw new Error('Recorder prepared after release'); nativeCalls.push({ name: 'prepare' }); },
    record() { if (recorderReleased) throw new Error('Recorder started after release'); nativeCalls.push({ name: 'record' }); },
    async stop() { if (recorderReleased) throw new Error('Recorder stopped after release'); nativeCalls.push({ name: 'stop' }); } };
  const mocks = {
    react: React, 'react-native': native,
    '@/src/components/ui/Sidebar': { SidebarToggle: () => null },
    '@/src/services/interview.service': { interviewService: service },
    'expo-document-picker': {}, 'expo-file-system/legacy': {},
    'expo-audio': { RecordingPresets: { HIGH_QUALITY: {} },
      useAudioPlayer: () => { React.useEffect(() => () => { released = true; }, []); return player; },
      useAudioRecorder: (_options, listener) => { recordingListener = listener; React.useEffect(() => () => { recorderReleased = true; }, []); return recorder; },
      useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
      async requestRecordingPermissionsAsync() {
        if (!options.permission) throw new Error('Permission must only be requested by Record');
        return options.permission;
      },
      async setAudioModeAsync() { if (released) throw new Error('Audio mode changed after unmount'); nativeCalls.push({ name: 'audioMode' }); },
    },
  };
  const filename = path.resolve(__dirname, '../mobile-app/app/(protected)/interview.tsx');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({ module, exports: module.exports,
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unmocked native screen dependency ${name}`); },
    AbortController, setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, console,
  });
  function render() {
    stateIndex = refIndex = effectIndex = callbackIndex = 0;
    tree = module.exports.default();
    return tree;
  }
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(item => nodes(item));
    if (!value || typeof value !== 'object') return [];
    return [value, ...nodes(value.children)];
  }
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.children) : value == null || typeof value === 'boolean' ? '' : String(value);
  return { requests, nativeCalls, alerts, render,
    async settle() {
      for (let round = 0; round < 3; round++) {
        for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.fn(); }
        await new Promise(resolve => setImmediate(resolve));
        render();
      }
    },
    async press(label) {
      const button = nodes(tree).find(node => node.type === 'TouchableOpacity' && text(node) === label);
      assert.ok(button, `button ${label}`);
      await button.props.onPress();
      await new Promise(resolve => setImmediate(resolve));
      render();
    },
    text: () => text(tree),
    visibleModals: () => nodes(tree).filter(node => node.type === 'Modal' && node.props.visible),
    unmount() { for (const effect of effects) effect.cleanup?.(); },
    recordingStatus: status => recordingListener(status),
  };
}

test('Interview initially renders with empty practice and null transcription draft, including hidden modal children', async () => {
  const screen = harness();
  assert.doesNotThrow(screen.render);
  assert.equal(screen.visibleModals().length, 0);
  await screen.settle();
  assert.match(screen.text(), /No questions match these filters/);
  assert.deepEqual(screen.requests.map(item => item.resource), ['overview', 'questions']);
  assert.equal(screen.nativeCalls.length, 0, 'opening Interview does not operate audio or request recording permission');
});

test('empty Interview tabs and editor open/close transitions remain renderable', async () => {
  const screen = harness(); screen.render(); await screen.settle();
  for (const tab of ['Goals', 'Flashcards', 'Mock interviews', 'Manage', 'AI jobs', 'Explore']) {
    await screen.press(tab); await screen.settle();
    assert.equal(screen.visibleModals().length, 0, tab);
  }
  await screen.press('Goals'); await screen.settle();
  await screen.press('Add study goal');
  assert.equal(screen.visibleModals().length, 1);
  await screen.press('Cancel');
  assert.equal(screen.visibleModals().length, 0);
  assert.equal(screen.nativeCalls.length, 0);
});

test('question detail, session results and practice transitions accept the API response shapes', async () => {
  const question = { id: '507f1f77bcf86cd799439012', title: 'Closures', topic: 'JavaScript', difficulty: 'Medium', estimatedTime: 10,
    companies: ['Meta'], tags: [], problemStatement: 'Explain closures.', bestAnswer: 'Lexical scope.', mcqs: null };
  const session = { id: '507f1f77bcf86cd799439013', status: 'COMPLETED', createdAt: '2026-10-19T00:00:00Z',
    answers: [{ id: 'answer', question, transcript: 'Scope.', status: 'COMPLETED', aiScore: 80 }] };
  const screen = harness({ questions: { items: [question], total: 1, page: 1, totalPages: 1 }, question, deck: [question], sessions: [session], session });
  screen.render(); await screen.settle();
  await screen.press('Open');
  assert.equal(screen.visibleModals().length, 1);
  await screen.press('Back to questions');
  await screen.press('Mock interviews'); await screen.settle();
  await screen.press('Results');
  assert.equal(screen.visibleModals().length, 1);
  await screen.press('Back to sessions');
  await screen.press('Start practice'); await screen.settle();
  assert.equal(screen.visibleModals().length, 1);
  assert.match(screen.text(), /Explain closures/);
  assert.equal(screen.alerts.length, 0);
});

test('Interview cleanup invalidates callbacks before Expo releases its native objects', async () => {
  const screen = harness(); screen.render(); await screen.settle();
  assert.doesNotThrow(screen.unmount);
  screen.recordingStatus({ isFinished: true, hasError: true, error: 'late native callback', url: 'file:///late.m4a' });
  assert.equal(screen.alerts.length, 0);
  assert.equal(screen.nativeCalls.length, 0, 'cleanup leaves native release to Expo instead of calling released objects');
});

test('legacy malformed MCQ entries cannot crash question detail', async () => {
  for (const mcqs of [[null, 7, { question: { bad: 'shape' }, options: null }], 'legacy JSON string']) {
    const question = { id: '507f1f77bcf86cd799439012', title: 'Closures', topic: 'JavaScript', difficulty: 'Medium', companies: [], tags: [], problemStatement: 'Explain closures.', mcqs };
    const screen = harness({ questions: { items: [question], total: 1, page: 1, totalPages: 1 }, question });
    screen.render(); await screen.settle();
    await screen.press('Open');
    assert.equal(screen.visibleModals().length, 1);
    assert.match(screen.text(), /Explain closures/);
    screen.unmount();
  }
});

test('a permission response arriving after Interview unmount never prepares or starts recording', async () => {
  let grant;
  const permission = new Promise(resolve => { grant = resolve; });
  const question = { id: '507f1f77bcf86cd799439012', title: 'Closures', topic: 'JavaScript', difficulty: 'Medium', estimatedTime: 10, companies: [], tags: [], problemStatement: 'Explain closures.' };
  const screen = harness({ deck: [question] }, { permission });
  screen.render(); await screen.settle();
  await screen.press('Mock interviews'); await screen.settle();
  await screen.press('Start practice'); await screen.settle();
  await screen.press('Record answer');
  screen.unmount();
  grant({ granted: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(screen.nativeCalls.length, 0);
  assert.equal(screen.alerts.length, 0);
});
