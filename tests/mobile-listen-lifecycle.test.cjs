const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
const pureModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/lib/listen-audio.ts'), 'utf8')),
  { module: pureModule, exports: pureModule.exports, URL });
const pure = pureModule.exports;
const filePath = path.resolve(__dirname, '../mobile-app/app/listen/[id].tsx');
const ast = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['registerCleanup', 'updateWindow', 'identityFor', 'applyFile', 'handleAudioEnded',
  'togglePlayPause', 'seekToSeconds', 'skipForward', 'skipBackward', 'changeSpeed', 'handleNextChapter', 'handlePrevChapter', 'fetchBook']);
const definitions = new Map(), effects = new Map();
let playerPosition, lifetimePosition;
function inspect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (wanted.has(node.name.text)) definitions.set(node.name.text, node.initializer.getText(ast));
    if (node.name.text === 'player') playerPosition = node.pos;
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const callback = node.arguments[0].getText(ast);
    if (callback.includes('alive.current = true')) { effects.set('lifetime', callback); lifetimePosition = node.pos; }
    else if (callback.includes('const start = updateWindow(currentChapterIndex)')) effects.set('generation', callback);
    else if (callback.includes('AppState.addEventListener')) effects.set('appState', callback);
    else if (callback.includes('subscribeEvictions')) effects.set('evictions', callback);
    else if (callback.includes('subscribeSync')) effects.set('sync', callback);
    else if (callback.includes('const interval = setInterval')) effects.set('timer', callback);
    else if (node.arguments[1]?.getText(ast) === '[status]') effects.set('readyStatus', callback);
    else if (node.arguments[1]?.getText(ast) === '[status.didJustFinish, status.playing, status.isLoaded]') effects.set('playStatus', callback);
  }
  ts.forEachChild(node, inspect);
}
inspect(ast);
assert.equal(definitions.size, wanted.size); assert.equal(effects.size, 8);
const code = [...definitions].map(([name, value]) => `const ${name} = ${value};`).join('\n')
  + '\nconst setup = {' + [...effects].map(([name, value]) => `${name}:${value}`).join(',') + '};'
  + '\nmodule.exports = {setup,' + [...wanted].join(',') + '};';

function harness() {
  const ref = current => ({ current });
  const nativeCalls = [], cleanupOrder = [], stateWrites = [], errors = [], callbacks = {}, timers = new Map();
  let released = false, nativeFailure = null, resolveAudio, timerId = 0;
  const pendingAudio = new Promise(resolve => { resolveAudio = resolve; });
  const native = (method, ...args) => {
    if (released) throw new Error(`AudioPlayer.${method}: Cannot use shared object that was already released`);
    if (nativeFailure) throw nativeFailure;
    nativeCalls.push([method, ...args]);
  };
  const player = {
    pause: () => native('pause'), play: () => native('play'), replace: source => native('replace', source.uri),
    setPlaybackRate: rate => native('rate', rate), setActiveForLockScreen: active => native('lockScreen', active),
    seekTo: seconds => { native('seekTo', seconds); return Promise.resolve(); },
    get currentStatus() { native('status'); return { isLoaded: true, currentTime: 0, duration: 20 }; },
  };
  const book = { id: 'book', title: 'Book', chapters: [{ id: 'one', title: 'One', content: ['First.'] }, { id: 'two', title: 'Two', content: ['Next.'] }] };
  const state = {
    ...pure, module: { exports: {} }, useCallback: callback => callback, AbortController, URL,
    console: { error() {} }, player, book, bookId: book.id, currentChapter: book.chapters[0], currentChapterIndex: 0,
    provider: 'google', currentVoice: 'en', grammarModel: 'OFF', playbackSpeed: 1, userId: 'user', settingsReady: true,
    alive: ref(true), lifetimeCleanups: ref(new Set()), playIntent: ref(true), activeKey: ref(null), promotedKey: ref(null),
    awaitingAudio: ref(null), refill: ref(() => {}), tasks: ref(new Map()), windowRef: ref(null),
    switching: ref(false), lastEndedKey: ref(null), indexRef: ref(0), bypassKeys: ref(new Set()),
    isPlaying: false, audioError: '', timeRemaining: 0, sleepTimer: null,
    status: { isLoaded: true, currentTime: 5, duration: 20, didJustFinish: false, playing: false },
    cacheService: { set() {}, get() { return null; } },
    saveProgressToDb() {},
    api: { get: async () => ({ data: { ...book, id: 'user' } }) },
    playbackNotificationService: { stopNotification: async () => { cleanupOrder.push('notification'); } },
    AppState: { addEventListener: (event, callback) => {
      callbacks.appState = callback;
      return { remove: () => { cleanupOrder.push('appState'); } };
    } },
    listenAudioService: {
      retain: async () => {}, activate: async () => {}, load: async () => pendingAudio,
      subscribeEvictions: callback => { callbacks.evictions = callback; return () => { cleanupOrder.push('evictions'); }; },
      subscribeSync: callback => { callbacks.sync = callback; return () => { cleanupOrder.push('sync'); }; },
    },
    setInterval: callback => { const id = ++timerId; timers.set(id, callback); callbacks.timer = callback; return id; },
    clearInterval: id => { timers.delete(id); cleanupOrder.push('timer'); },
  };
  for (const name of ['ReadyAudioUri', 'ActiveAudio', 'Provider', 'GeminiVoice', 'MimoVoice', 'TtsVoice', 'AudioNotice',
    'IsGenerating', 'RetryCount', 'SleepTimer', 'Book', 'UserId', 'Loading']) state['set' + name] = value => { stateWrites.push([name, value]); };
  state.setAudioError = value => { stateWrites.push(['AudioError', value]); errors.push(value); };
  state.setCurrentChapterIndex = value => { state.currentChapterIndex = value; stateWrites.push(['Chapter', value]); };
  state.setTimeRemaining = updater => { state.timeRemaining = updater(state.timeRemaining); stateWrites.push(['Timer', state.timeRemaining]); };
  state.exports = state.module.exports;
  vm.runInNewContext(compile(code), state);
  const functions = state.module.exports;
  const fileFor = index => {
    const identity = functions.identityFor(book.chapters[index]);
    const file = { chapterId: identity.chapterId, key: pure.audioIdentityKey(identity), uri: `file:///cache/${index}.mp3`,
      provider: 'google', voice: 'en', bytes: 20, audioId: 'hash-' + index };
    return { identity, file, controller: new AbortController(), promise: Promise.resolve(file) };
  };
  return { state, player, nativeCalls, cleanupOrder, stateWrites, errors, callbacks, timers, functions, resolveAudio, fileFor,
    release() { released = true; cleanupOrder.push('release'); }, failNative(error) { nativeFailure = error; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('listen cancels JS ownership before Expo hook release and performs no native unmount operations', () => {
  assert.ok(lifetimePosition < playerPosition, 'lifetime cleanup must be registered before useAudioPlayer auto-release');
  const app = harness(); const { setup } = app.functions;
  const stopLifetime = setup.lifetime();
  const stops = [setup.appState(), setup.evictions(), setup.sync(), setup.timer()];
  const task = app.fileFor(0); app.state.tasks.current.set(task.file.key, task);
  app.state.activeKey.current = task.file.key; app.state.awaitingAudio.current = task.file.uri;
  stopLifetime();
  assert.equal(task.controller.signal.aborted, true);
  assert.equal(app.state.tasks.current.size, 0); assert.equal(app.state.playIntent.current, false);
  assert.equal(app.state.activeKey.current, null); assert.equal(app.state.awaitingAudio.current, null);
  assert.deepEqual(app.cleanupOrder, ['appState', 'evictions', 'sync', 'timer', 'notification']);
  app.release();
  for (const stop of stops) stop();
  assert.equal(app.cleanupOrder.filter(name => name === 'appState').length, 1, 'later hook cleanup is idempotent');
  assert.equal(app.nativeCalls.length, 0, 'Expo owns native disposal; cleanup must not pause an already released object');
});

test('listen queued app events, timer, metadata, statuses and controls cannot touch a released player', () => {
  const app = harness(), { setup } = app.functions;
  const stop = setup.lifetime(); setup.appState(); setup.evictions(); setup.sync(); setup.timer();
  const task = app.fileFor(0); app.state.tasks.current.set(task.file.key, task);
  app.state.activeKey.current = task.file.key;
  stop(); app.release(); const writes = app.stateWrites.length;
  app.callbacks.appState('active'); app.callbacks.timer(); app.callbacks.evictions(task.file.uri); app.callbacks.sync(task.file);
  setup.readyStatus(); setup.playStatus();
  app.functions.togglePlayPause(); app.functions.skipForward(); app.functions.skipBackward(); app.functions.changeSpeed(2);
  app.functions.handleNextChapter(); app.functions.handlePrevChapter(); app.functions.handleAudioEnded();
  assert.equal(app.functions.applyFile(task, task.identity, 0), null);
  assert.equal(app.stateWrites.length, writes); assert.equal(app.nativeCalls.length, 0);
});

test('listen pending chapter download is aborted before release and its late completion cannot start playback', async () => {
  const app = harness(), { setup } = app.functions;
  const stop = setup.lifetime(); const stopGeneration = setup.generation();
  await flush();
  const pending = [...app.state.tasks.current.values()][0]; assert.ok(pending);
  const before = app.nativeCalls.length;
  stop(); app.release();
  assert.equal(pending.controller.signal.aborted, true);
  const writes = app.stateWrites.length;
  app.resolveAudio(app.fileFor(0).file); await flush();
  stopGeneration();
  assert.equal(app.nativeCalls.length, before); assert.equal(app.stateWrites.length, writes);
});

test('listen ready-next handoff still synchronously replaces and plays the next source while active', () => {
  const app = harness(); app.functions.setup.lifetime();
  const current = app.fileFor(0), next = app.fileFor(1);
  app.state.tasks.current.set(current.file.key, current); app.state.tasks.current.set(next.file.key, next);
  app.state.activeKey.current = current.file.key;
  app.functions.handleAudioEnded();
  assert.deepEqual(app.nativeCalls.map(call => call[0]), ['replace', 'rate', 'lockScreen', 'play']);
  assert.equal(app.nativeCalls[0][1], next.file.uri);
  assert.equal(app.state.activeKey.current, next.file.key); assert.equal(app.state.indexRef.current, 1);
  assert.equal(app.state.currentChapterIndex, 1);
});

test('listen active native failures are surfaced instead of being blanket-swallowed', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.isPlaying = true;
  const failure = new Error('Audio decoder failed'); app.failNative(failure);
  assert.throws(() => app.functions.togglePlayPause(), error => error === failure);
  app.player.seekTo = () => Promise.reject(failure);
  app.functions.seekToSeconds(5); await flush();
  assert.deepEqual(app.errors, ['Audio decoder failed']);
});
