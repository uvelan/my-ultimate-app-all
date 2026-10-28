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
  'changeKokoroVoice', 'commitVoice', 'playStreamChunk', 'failAudioLoad', 'runPlayerAction', 'retryAudio', 'togglePlayPause', 'seekToSeconds', 'skipForward', 'skipBackward', 'changeSpeed', 'handleNextChapter', 'handlePrevChapter', 'fetchBook', 'reCacheAudio', 'reconcileNativeChapter', 'handleBackgroundAudioStatus']);
const definitions = new Map(), effects = new Map();
let playerPosition, lifetimePosition;
function inspect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (wanted.has(node.name.text)) definitions.set(node.name.text, node.initializer.getText(ast));
    if (node.name.text === 'player') playerPosition = node.pos;
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') { const callback = node.arguments[0].arguments[0].getText(ast); effects.set(callback.includes('screen wake lock') ? 'followAwake' : 'focus', callback); }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const callback = node.arguments[0].getText(ast);
    if (callback.includes('alive.current = true')) { effects.set('lifetime', callback); lifetimePosition = node.pos; }
    else if (callback.includes('const start = updateWindow(currentChapterIndex)')) effects.set('generation', callback);
    else if (callback.includes('Adopt the source currently owned')) effects.set('nativeAdoption', callback);
    else if (callback.includes('const checkReady = async')) effects.set('pcSync', callback);
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
assert.equal(definitions.size, wanted.size); assert.equal(effects.size, 12);
const code = [...definitions].map(([name, value]) => `const ${name} = ${value};`).join('\n')
  + '\nconst setup = {' + [...effects].map(([name, value]) => `${name}:${value}`).join(',') + '};'
  + '\nmodule.exports = {setup,' + [...wanted].join(',') + '};';

function harness() {
  const ref = current => ({ current });
  const nativeCalls = [], cleanupOrder = [], stateWrites = [], errors = [], callbacks = {}, timers = new Map(), deadlineTimers = new Map();
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
    get currentStatus() { native('status'); return { isLoaded: true, currentTime: state.nativeTime ?? 0, duration: 20, ...state.nativeStatus }; },
  };
  const book = { id: 'book', title: 'Book', chapters: [{ id: 'one', title: 'One', content: ['First.'] }, { id: 'two', title: 'Two', content: ['Next.'] }] };
  const state = {
    localSyncService: { refresh: async () => ({ artifacts: [] }), get: async () => null, settings: () => ({ enabled: false, phoneFallback: true }), invalidate: async () => {}, subscribe: () => () => {} },
    listenResumeService: { replaceFile() {}, get: () => null, restore: async () => null, saveFile() {}, savePiece() {}, savePosition() {}, voiceChange() {}, adopt() {}, clear() {}, compact() {} },
    normalizeChunkTarget: value => Number(value) >= 200 && Number(value) <= 2000 ? Number(value) : 1000, kokoroNarration: () => ({ chunks: ['One.', 'First.'] }), audioDiagnostics: { record() {} }, ...pure, ...require('./helpers/audiobook-load.cjs'), chapterWindow: { loading: false, error: null, retry() {} }, module: { exports: {} }, useCallback: callback => callback, AbortController, URL, Error,
    console: { error() {} }, player, book, bookId: book.id, currentChapter: book.chapters[0], currentChapterIndex: 0,
    provider: 'google', currentVoice: 'en', grammarModel: 'OFF', playbackSpeed: 1, userId: 'user', settingsReady: true, progressReady: true,
    ProgressiveAudio: require('./helpers/progressive-audio.cjs').ProgressiveAudio,
    stream: ref(null), streamPlay: ref(() => {}), pendingSeek: ref(null), updateStream: () => {},
    alive: ref(true), cancelGeneration: ref(null), lifetimeCleanups: ref(new Set()), playIntent: ref(true), activeKey: ref(null), promotedKey: ref(null),
    awaitingAudio: ref(null), refill: ref(() => {}), tasks: ref(new Map()), windowRef: ref(null),
    currentBookRef: ref(book.id), switching: ref(false), lastEndedKey: ref(null), indexRef: ref(0), bypassKeys: ref(new Set()),
    followAudio: true, screenAwakeGeneration: ref(0), screenAwakeOwner: ref('listen-follow-book-test'), activateKeepAwakeAsync: async tag => { callbacks.awakeTag = tag; }, deactivateKeepAwake: async tag => { cleanupOrder.push('awake:' + tag); }, nativeReconcile: ref(async () => false), backgroundNativeSyncScope: ref({bookId:'book',index:0}), nativeReconcilePending: ref(null), nativeScope: ref({ bookId: 'book', userId: 'user' }), Platform: { OS: 'android' }, nativeSleepDeadline: ref(0), waitingForPcIntent: ref(false), resumeCursor: ref(null), sourceUri: ref(null), preferredChunkTarget: 1000, sessionChunkTarget: 1000, chunkScope: ref({ chapterId: 'one', target: 1000 }), kokoroVoice: 'af_heart', voiceSwitchToken: ref(0), FileSystem: { deleteAsync: async () => {} }, activeAudio: null, handoffVoice: null, isPlaying: false, isRecaching: false, audioError: '', timeRemaining: 0, sleepTimer: null,
    status: { isLoaded: true, currentTime: 5, duration: 20, didJustFinish: false, playing: false },
    cacheService: { set() {}, get() { return null; } },
    saveProgressToDb() {},
    bookProgress: { getRevision: () => 0, getChapter: (_, fallback) => state.savedChapter ?? fallback, saveChapter: (_, value) => { state.savedChapter = value; }, acceptServer: (_, value) => value },
    bookService: { syncProgress: async id => state.bookProgress.getChapter(id, 0) },
    api: { get: async () => ({ data: { ...book, id: 'user' } }) },
    playbackNotificationService: { stopNotification: async () => { cleanupOrder.push('notification'); } },
    AppState: { currentState: 'active', addEventListener: (event, callback) => {
      callbacks.appState = callback;
      return { remove: () => { cleanupOrder.push('appState'); } };
    } },
    listenAudioService: {
      invalidateChapter: async () => {}, retain: async () => {}, activate: async () => {}, load: async (...args) => { if (args[5]) callbacks.chunk = args[5]; return pendingAudio; },
      subscribeEvictions: callback => { callbacks.evictions = callback; return () => { cleanupOrder.push('evictions'); }; },
      subscribeSync: callback => { callbacks.sync = callback; return () => { cleanupOrder.push('sync'); }; },
      subscribeProgress: callback => { callbacks.progress = callback; return () => {}; },
    },
    setTimeout: (callback, delay) => { const id = ++timerId; deadlineTimers.set(id, { callback, delay }); return id; },
    clearTimeout: id => { deadlineTimers.delete(id); },
    setInterval: callback => { const id = ++timerId; timers.set(id, callback); callbacks.timer = callback; return id; },
    clearInterval: id => { timers.delete(id); cleanupOrder.push('timer'); },
  };
  for (const name of ['HandoffVoice', 'ReadyAudioUri', 'ActiveAudio', 'Provider', 'KokoroVoice', 'TtsVoice', 'AudioNotice',
    'ProgressReady', 'IsGenerating', 'IsRecaching', 'RetryCount', 'SleepTimer', 'Book', 'UserId', 'Loading']) state['set' + name] = value => { stateWrites.push([name, value]); };
  state.setAudioError = value => { stateWrites.push(['AudioError', value]); errors.push(value); };
  state.setCurrentChapterIndex = value => { state.currentChapterIndex = value; stateWrites.push(['Chapter', value]); };
  state.setTimeRemaining = updater => { state.timeRemaining = updater(state.timeRemaining); stateWrites.push(['Timer', state.timeRemaining]); };
  state.exports = state.module.exports;
  vm.runInNewContext(compile(code), state);
  const functions = state.module.exports;
  state.nativeReconcile.current = () => functions.reconcileNativeChapter();
  state.streamPlay.current = () => functions.runPlayerAction(functions.playStreamChunk);
  const fileFor = index => {
    const identity = functions.identityFor(book.chapters[index]);
    const file = { chapterId: identity.chapterId, key: pure.audioIdentityKey(identity), uri: `file:///cache/${index}.mp3`,
      provider: 'google', voice: 'en', bytes: 20, audioId: 'hash-' + index };
    return { identity, file, controller: new AbortController(), promise: Promise.resolve(file) };
  };
  return { state, player, nativeCalls, cleanupOrder, stateWrites, errors, callbacks, timers, deadlineTimers, functions, resolveAudio, fileFor,
    release() { released = true; cleanupOrder.push('release'); }, failNative(error) { nativeFailure = error; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('offline Listen skips server activation and uses offline identity with a bounded generation wait', async () => {
  const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
  app.state.grammarModel = 'gpt-4o-mini';
  assert.equal(app.functions.identityFor(app.state.currentChapter).grammarModel, 'OFF');
  const ahead = app.fileFor(1); delete ahead.file;
  app.state.tasks.current.set(pure.audioIdentityKey(ahead.identity), ahead);
  let activation = 0; app.state.listenAudioService.activate = async () => { activation++; };
  app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
  assert.equal(activation, 0);
  assert.equal(ahead.controller.signal.aborted, true, 'foreground regeneration takes priority over local pre-generation');
  const deadline = [...app.deadlineTimers.values()].find(timer => timer.delay === 180000);
  assert.ok(deadline);
  app.callbacks.progress(app.state.currentChapter.id, { phase: 'generate', progress: 0.1 });
  assert.ok(![...app.deadlineTimers.values()].includes(deadline), 'completed passages refresh the stall timer');
  [...app.deadlineTimers.values()].find(timer => timer.delay === 180000).callback();
  assert.match(app.errors.at(-1), /stopped responding/);
  assert.equal(app.state.tasks.current.size, 0); stop();
});

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

test('native Play and Pause failures show a retryable error without escaping the button handler', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.isPlaying = true;
  const failure = new Error('Audio decoder failed'); app.failNative(failure);
  assert.doesNotThrow(() => app.functions.togglePlayPause());
  assert.equal(app.errors.at(-1), 'Audio decoder failed');
  assert.equal(app.state.playIntent.current, false);
  app.state.isPlaying = false; app.state.activeKey.current = 'chapter';
  assert.doesNotThrow(() => app.functions.togglePlayPause());
  assert.equal(app.errors.at(-1), 'Audio decoder failed');
  app.player.seekTo = () => Promise.reject(failure);
  app.functions.seekToSeconds(5); await flush();
  assert.equal(app.errors.at(-1), 'Audio decoder failed');
  app.player.seekTo = () => { throw failure; };
  assert.doesNotThrow(() => app.functions.seekToSeconds(5));
  assert.equal(app.errors.at(-1), 'Audio decoder failed');
});


test('a native pause failure exits generation and leaves a retryable error', () => {
  const app = harness(); app.functions.setup.lifetime();
  app.failNative(new Error('Cannot access native audio getter'));
  assert.doesNotThrow(() => app.functions.setup.generation());
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsGenerating').at(-1)[1], false);
  assert.equal(app.errors.at(-1), 'Cannot access native audio getter');
  assert.equal(app.state.activeKey.current, null);
});

test('a readiness getter failure clears loading and the pending source', () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.awaitingAudio.current = 'file:///cache/chapter.mp3';
  app.state.activeKey.current = 'chapter-key';
  app.failNative(new Error('AudioPlayer.currentStatus getter failed'));
  assert.doesNotThrow(() => app.functions.setup.readyStatus());
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsGenerating').at(-1)[1], false);
  assert.equal(app.state.awaitingAudio.current, null);
  assert.equal(app.state.activeKey.current, null);
  assert.equal(app.errors.at(-1), 'AudioPlayer.currentStatus getter failed');
});

test('retry discards a failed task even when failure already cleared the active key', () => {
  const app = harness(); app.functions.setup.lifetime();
  const task = app.fileFor(0); app.state.tasks.current.set(task.file.key, task);
  app.functions.failAudioLoad(new Error('Decoder failed'));
  app.functions.retryAudio();
  assert.equal(task.controller.signal.aborted, true);
  assert.equal(app.state.tasks.current.has(task.file.key), false);
  assert.equal(app.state.bypassKeys.current.has(task.file.key), true);
  assert.equal(app.errors.at(-1), '');
  assert.ok(app.stateWrites.some(([key]) => key === 'RetryCount'));
});

test('transcript rendering uses hook status without invoking a native getter', () => {
  const declaration = ast.statements.flatMap(node => {
    const found = [];
    function find(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'transcriptStatus') found.push(n.initializer.getText(ast)); ts.forEachChild(n, find); }
    find(node); return found;
  });
  assert.deepEqual(declaration, ['status']);
});


test('a failed source replacement exits loading and retry starts a new request', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.functions.setup.generation(); await flush();
  app.failNative(new Error('Source replacement failed'));
  app.resolveAudio(app.fileFor(0).file); await flush();
  assert.equal(app.errors.at(-1), 'Source replacement failed');
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsGenerating').at(-1)[1], false);
  assert.equal(app.state.activeKey.current, null);
  app.functions.retryAudio();
  assert.equal(app.state.tasks.current.size, 0);
});

test('a failed book request leaves the initial loading screen', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.api.get = async () => { throw new Error('Network unavailable'); };
  await app.functions.fetchBook('book');
  assert.equal(app.stateWrites.filter(([key]) => key === 'Loading').at(-1)[1], false);
  assert.match(app.errors.at(-1), /connection/i);
});


test('play after an error retries instead of replaying a failed active source', () => {
  const app = harness(); app.functions.setup.lifetime();
  const task = app.fileFor(0); app.state.tasks.current.set(task.file.key, task);
  app.state.activeKey.current = task.file.key;
  app.state.audioError = 'Could not decode audio';
  app.functions.togglePlayPause();
  assert.equal(task.controller.signal.aborted, true);
  assert.equal(app.nativeCalls.some(([method]) => method === 'play'), false);
  assert.ok(app.stateWrites.some(([key]) => key === 'RetryCount'));
});


test('book loading distinguishes connection, session and server failures and always stops loading', async () => {
  for (const [status, expected] of [[undefined, /Request failed/], [401, /sign in again/], [403, /access/], [404, /not be found/], [500, /server/]]) {
    const app = harness(); app.functions.setup.lifetime();
    app.state.api.get = async () => { const error = new Error('Request failed'); if (status) error.response = { status }; throw error; };
    await app.functions.fetchBook('book');
    assert.match(app.errors.at(-1), expected);
    assert.equal(app.stateWrites.filter(([key]) => key === 'Loading').at(-1)[1], false);
    if (status !== 401) assert.doesNotMatch(app.errors.at(-1), /sign in again/);
  }
});

test('retrying an initial book load clears its previous error and succeeds', async () => {
  const app = harness(); app.functions.setup.lifetime();
  const get = app.state.api.get;
  app.state.api.get = async () => { throw new Error('Connection interrupted'); };
  await app.functions.fetchBook('book');
  app.state.api.get = get;
  await app.functions.fetchBook('book');
  assert.equal(app.errors.at(-1), '');
  assert.equal(app.stateWrites.filter(([key]) => key === 'Loading').at(-1)[1], false);
  assert.ok(app.stateWrites.some(([key]) => key === 'Book'));
});


test('listener resumes an earlier shared chapter instead of choosing the highest server chapter', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.bookProgress.getRevision = (() => { let revision = 0; return () => revision++; })();
  app.state.bookProgress.getChapter = () => 0;
  app.state.api.get = async url => ({ data: url === '/auth/profile' ? { id: 'user' } : { ...app.state.book, chapterId: 1 } });
  await app.functions.fetchBook('book');
  assert.equal(app.state.currentChapterIndex, 0);
});


test('initial listener request uses chapter metadata and avoids a redundant progress download', async () => {
  const app = harness(); app.functions.setup.lifetime();
  const urls = [];
  app.state.api.get = async url => { urls.push(url); return { data: url === '/auth/profile' ? { id: 'user' } : { ...app.state.book, chapterId: 1 } }; };
  app.state.bookService.syncProgress = async () => { throw new Error('Redundant full-book request'); };
  await app.functions.fetchBook('book');
  assert.deepEqual(urls, ['/books/book?chapters=metadata', '/auth/profile']);
  assert.equal(app.state.currentChapterIndex, 1);
  assert.equal(app.errors.at(-1), '');
});

test('chapter loading stops old playback and does not generate narration for missing content', () => {
  const app = harness(); app.functions.setup.lifetime();
  app.state.chapterWindow.loading = true;
  app.functions.setup.generation();
  assert.equal(app.nativeCalls.at(-1)[0], 'pause');
  assert.equal(app.state.tasks.current.size, 0);
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsGenerating').at(-1)[1], false);
});


test('a stalled audio request exits generation at the overall deadline and ignores late completion', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.functions.setup.generation(); await flush();
  const task = [...app.state.tasks.current.values()][0];
  const deadline = [...app.deadlineTimers.values()][0];
  assert.equal(deadline.delay, 120000);
  deadline.callback();
  assert.equal(task.controller.signal.aborted, true);
  assert.equal(app.state.tasks.current.size, 0);
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsGenerating').at(-1)[1], false);
  assert.match(app.errors.at(-1), /timed out/);
  app.resolveAudio(app.fileFor(0).file); await flush();
  assert.equal(app.nativeCalls.some(([method]) => method === 'replace'), false);
  assert.match(app.errors.at(-1), /timed out/);
});
test('Cancel stops an in-flight generation and Retry can start a fresh task', async () => {
  const app = harness(); app.functions.setup.lifetime();
  app.functions.setup.generation(); await flush();
  const task = [...app.state.tasks.current.values()][0];
  app.state.cancelGeneration.current();
  assert.equal(task.controller.signal.aborted, true);
  assert.equal(app.deadlineTimers.size, 0);
  assert.match(app.errors.at(-1), /cancelled/);
  assert.equal(app.state.cancelGeneration.current, null);
  app.functions.retryAudio(); app.functions.setup.generation(); await flush();
  assert.equal(app.state.tasks.current.size, 1);
  assert.notEqual([...app.state.tasks.current.values()][0], task);
});


test('Re-cache aborts the current task, invalidates its saved chapter, and requests a bypassed reload', async () => {
  const app = harness(); app.functions.setup.lifetime(); app.functions.setup.generation(); await flush();
  const task = [...app.state.tasks.current.values()][0]; const cleared = [];
  app.state.listenAudioService.invalidateChapter = async chapterId => { cleared.push(chapterId); };
  await app.functions.reCacheAudio();
  assert.equal(task.controller.signal.aborted, true); assert.deepEqual(cleared, ['one']);
  assert.equal(app.state.bypassKeys.current.has(pure.audioIdentityKey(app.functions.identityFor(app.state.currentChapter))), true);
  assert.ok(app.stateWrites.some(([key]) => key === 'RetryCount'));
  assert.equal(app.stateWrites.filter(([key]) => key === 'IsRecaching').at(-1)[1], false);
});

test('Listen plays a chunk before the load resolves, buffers at its end, and never restarts on merge', async () => {
  const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
  app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
  const first = { index: 0, text: 'One.', uri: 'file:///piece0.wav', bytes: 100, start: 0, end: 2 };
  const second = { index: 1, text: 'First.', uri: 'file:///piece1.wav', bytes: 100, start: 2, end: 10 };
  const sync = { version: 1, title: 'One', paragraphs: ['First.'], segments: [first] };
  app.callbacks.chunk(first, sync);
  assert.ok(app.nativeCalls.some(call => call[0] === 'replace' && call[1] === first.uri));
  assert.ok(app.nativeCalls.some(call => call[0] === 'play'));
  app.state.switching.current = false;
  app.functions.handleAudioEnded();
  assert.equal(app.state.stream.current.waiting, true);
  assert.equal(app.state.currentChapterIndex, 0, 'piece EOF is not chapter EOF');
  app.callbacks.chunk(second, { ...sync, segments: [first, second] });
  assert.equal(app.state.stream.current.current.uri, second.uri);
  const replacements = app.nativeCalls.filter(call => call[0] === 'replace').length;
  app.resolveAudio({ uri: 'file:///merged.wav', bytes: 200, provider: 'kokoro', voice: 'af_heart' });
  await flush();
  assert.equal(app.state.stream.current.complete, true);
  assert.equal(app.nativeCalls.filter(call => call[0] === 'replace').length, replacements);
  app.state.listenAudioService.load = async () => new Promise(() => {});
  stop();
});
test('obsolete chunk callbacks cannot play after chapter cleanup or unmount', async () => {
  const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
  const unmount = app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
  const chunk = app.callbacks.chunk; stop(); unmount(); app.release(); const calls = app.nativeCalls.length;
  chunk({ index: 0, text: 'Old.', uri: 'file:///old.wav', bytes: 100, start: 0, end: 2 }, {});
  assert.equal(app.nativeCalls.length, calls);
});

test('a cached chapter voice change retains its position and generates from the next measured passage', async () => {
  const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
  const identity = app.functions.identityFor(app.state.currentChapter), key = pure.audioIdentityKey(identity);
  const sync = { version: 1, title: 'One', paragraphs: ['First.'], segments: [
    { text: 'One.', start: 0, end: 2 }, { text: 'First.', start: 2, end: 9 }, { text: 'Next.', start: 9, end: 15 } ] };
  const file = { key, uri: 'file:///kokoro-cache.wav', chapterId: 'one', provider: 'kokoro', voice: 'af_heart', sync };
  const task = { identity, file, controller: new AbortController(), promise: Promise.resolve(file) };
  app.state.tasks.current.set(key, task); app.state.activeKey.current = key; app.state.activeAudio = { key, file };
  app.state.listenAudioService.splitOfflinePrefix = async (uri, segments) => segments.map((segment, index) => ({ ...segment, index, uri: 'file:///prefix' + index + '.wav', bytes: 100 }));
  let continuation;
  app.state.listenAudioService.load = async (...args) => { continuation = args[6]; return new Promise(() => {}); };
  app.state.nativeTime = 6;
  await app.functions.changeKokoroVoice('af_bella');
  assert.equal(continuation.voice, 'af_bella'); assert.equal(continuation.index, 2); assert.equal(continuation.seconds, 9);
  assert.equal(app.state.stream.current.index, 1); assert.equal(app.state.pendingSeek.current.seconds, 4);
  assert.ok(app.nativeCalls.some(call => call[0] === 'replace' && call[1] === 'file:///prefix1.wav'));
  assert.equal(app.state.currentChapterIndex, 0);
});
test('resting offline generation disarms the stall timeout and Kokoro does not prefetch the next chapter', async () => {
  const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
  let loads = 0; const load = app.state.listenAudioService.load;
  app.state.listenAudioService.load = (...args) => { loads++; return load(...args); };
  app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
  app.callbacks.progress(app.state.currentChapter.id, { phase: 'waiting', progress: 0 });
  assert.equal(app.deadlineTimers.size, 0, 'a paused/buffered worker is not stalled');
  app.resolveAudio({ uri: 'file:///kokoro-cache.wav', bytes: 100, provider: 'kokoro', voice: 'af_heart' }); await flush();
  assert.equal(loads, 1, 'the next chapter is not synthesized speculatively'); stop();
});

test('opening a completed saved chapter seeks to its bookmark before playback starts', async () => {
 const app = harness(); const saved = app.fileFor(0);
 app.state.listenResumeService.get = () => ({ position: 8, index: 1 });
 app.state.listenResumeService.restore = async () => ({ position: 8, index: 1, file: saved.file });
 app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
 assert.equal(app.state.pendingSeek.current.seconds, 8);
 assert.equal(app.nativeCalls.some(call => call[0] === 'play'), false, 'do not play the chapter opening before the seek');
 app.functions.setup.readyStatus(); await flush();
 assert.ok(app.nativeCalls.some(call => call[0] === 'seekTo' && call[1] === 8));
 assert.equal(app.nativeCalls.filter(call => call[0] === 'play').length, 1); stop();
});
test('partial chapter resumes a saved chunk immediately and generates only after the saved prefix', async () => {
 const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
 const pieces = [0, 1].map(index => ({ index, uri: 'file:///saved' + index + '.wav', bytes: 100, text: index ? 'First.' : 'One.', start: index * 5, end: index * 5 + 5 }));
 const sync = { version: 1, title: 'One', paragraphs: ['First.'], segments: pieces };
 app.state.listenResumeService.restore = async () => ({ position: 7, index: 1, pieces, sync, texts: ['One.', 'First.', 'Unfinished.'], voice: 'af_heart' });
 app.state.listenAudioService.joinOfflinePrefix = async () => 'file:///rebuilt-prefix.wav';
 let continuation;
 app.state.listenAudioService.load = async (...args) => { continuation = args[6]; return new Promise(() => {}); };
 app.functions.setup.lifetime(); const stop = app.functions.setup.generation(); await flush();
 assert.equal(app.state.stream.current.index, 1); assert.equal(app.state.pendingSeek.current.seconds, 2);
 assert.ok(app.nativeCalls.some(call => call[0] === 'replace' && call[1] === pieces[1].uri));
 assert.equal(continuation.index, 2); assert.equal(continuation.seconds, 10);
 assert.equal(continuation.uri, 'file:///rebuilt-prefix.wav'); stop();
});
test('app closure flushes the last cursor without accessing a released native player', () => {
 const app = harness(), writes = [];
 app.state.resumeCursor.current = { identity: app.functions.identityFor(app.state.currentChapter), seconds: 12.5, index: 2 };
 app.state.listenResumeService.savePosition = (...args) => writes.push(args);
 const stop = app.functions.setup.lifetime(); stop(); app.release();
 assert.equal(writes[0][1], 12.5); assert.equal(writes[0][2], 2); assert.equal(writes[0][3], true);
 assert.equal(app.nativeCalls.length, 0);
});

test('each completed PC chapter wakes playback immediately while the rest of the batch remains pending', async () => {
 const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart'; app.state.waitingForPcIntent.current = true;
 let ready = null, event;
 app.state.localSyncService.get = async () => ready;
 app.state.localSyncService.subscribe = callback => { event = callback; return () => {}; };
 app.functions.setup.lifetime(); const stop = app.functions.setup.pcSync(); await flush();
 assert.equal(app.stateWrites.filter(([key]) => key === 'RetryCount').length, 0);
 ready = { uri: 'file:///local-pc-audio/chapter.wav' };
 event({ phase: 'chapter-ready', chapterId: app.state.currentChapter.id, key: 'old-representation-key' }); await flush();
 assert.equal(app.state.playIntent.current, true); assert.equal(app.state.waitingForPcIntent.current, false);
 assert.equal(app.stateWrites.filter(([key]) => key === 'RetryCount').length, 1);
 stop(); event({ phase: 'chapter-ready', chapterId: app.state.currentChapter.id }); await flush();
 assert.equal(app.stateWrites.filter(([key]) => key === 'RetryCount').length, 1);
});
test('missed background completion is recovered by checking the saved library even when sync is paused', async () => {
 const app = harness(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_heart';
 let ready = null;
 app.state.localSyncService.get = async () => ready;
 app.functions.setup.lifetime(); const stop = app.functions.setup.pcSync(); await flush();
 ready = { uri: 'file:///local-pc-audio/chapter.wav' };
 for (const tick of app.timers.values()) tick(); await flush();
 assert.equal(app.stateWrites.filter(([key]) => key === 'RetryCount').length, 1);
 stop(); assert.equal(app.timers.size, 0);
});


test('PC playback configures the native chapter queue without changing notification ownership', () => {
 const app=harness();app.functions.setup.lifetime();app.state.provider='kokoro';app.state.currentVoice='af_bella';
 const current=app.fileFor(0);current.identity.provider='kokoro';current.identity.voice='af_bella';
 current.file={...current.file,provider:'kokoro',voice:'af_bella',uri:'file:///files/local-pc-audio/chapter.wav'};
 let config;app.player.setLocalChapterQueue=value=>{config=JSON.parse(value)};
 app.functions.applyFile(current,current.identity,0);
 assert.equal(config.voice,'af_bella');assert.equal(config.chapters.length,app.state.book.chapters.length);
 assert.equal(config.endOfChapter,false);assert.equal(config.deadline,0);
 assert.equal(app.nativeCalls.filter(([name])=>name==='lockScreen').length,1);
});
test('chapter-end sleep timer disables native queue advancement', () => {
 const app=harness();app.functions.setup.lifetime();app.state.sleepTimer='EOC';
 const current=app.fileFor(0);current.file.uri='file:///files/local-pc-audio/chapter.wav';
 let config;app.player.setLocalChapterQueue=value=>{config=JSON.parse(value)};
 app.functions.applyFile(current,current.identity,0);assert.equal(config.endOfChapter,true);
});

function advancedNative(app, index = 3) {
 const chapters = app.state.book.chapters;
 while (chapters.length <= index) { const position = chapters.length; chapters.push({ id: 'chapter-' + position, title: 'Chapter ' + position, content: ['Text ' + position] }); }
 const chapter = chapters[index], uri = 'file:///documents/local-pc-audio/' + index + '.wav';
 const artifact = { userId: 'user', bookId: 'book', chapterId: chapter.id, chapterIndex: index, voice: 'af_bella', chunkTarget: 400, uri, bytes: 200,
  sync: { version: 1, title: chapter.title, paragraphs: ['Text ' + index], segments: [{ text: 'Text ' + index, start: 0, end: 100 }] } };
 app.state.nativeStatus = { localChapterId: chapter.id, localChapterIndex: index, localChapterUri: uri, currentTime: 37, playing: true, isLoaded: true };
 return artifact;
}
test('returning after three native chapters adopts the live source and time without replacing or seeking', async () => {
 const app = harness(); app.functions.setup.lifetime(); app.state.provider = 'kokoro';
 const artifact = advancedNative(app);
 app.state.localSyncService.refresh = async () => ({ artifacts: [artifact] });
 const saved = []; app.state.listenResumeService.savePosition = (...args) => saved.push(args);
 const stop = app.functions.setup.appState();
 await app.callbacks.appState('active');
 assert.equal(app.state.currentChapterIndex, 3); assert.equal(app.state.indexRef.current, 3);
 assert.equal(app.state.sourceUri.current, artifact.uri); assert.equal(app.state.savedChapter, 3);
 assert.equal(app.state.resumeCursor.current.seconds, 37); assert.equal(saved.at(-1)[1], 37);
 assert.equal(app.state.chunkScope.current.target, 400);
 assert.equal(app.nativeCalls.some(([name]) => ['replace', 'seekTo', 'pause'].includes(name)), false);
 stop();
});
test('queued old chapter notifications cannot rewind the live native chapter', async () => {
 const app = harness(); app.functions.setup.lifetime(); app.state.provider = 'kokoro';
 const artifact = advancedNative(app);
 app.state.status = { ...app.state.status, localChapterId: 'one', localChapterIndex: 0, localChapterUri: 'file:///old.wav', currentTime: 1 };
 app.state.localSyncService.refresh = async () => ({ artifacts: [artifact] });
 app.functions.setup.nativeAdoption(); await flush();
 assert.equal(app.state.currentChapterIndex, 3);
 app.functions.setup.nativeAdoption(); await flush();
 assert.equal(app.state.currentChapterIndex, 3);
 assert.equal(app.nativeCalls.some(([name]) => ['replace', 'seekTo', 'pause'].includes(name)), false);
});
test('late progress responses cannot overwrite a native chapter that advances during the request', async () => {
 const app = harness(); app.functions.setup.lifetime();
 let resolveProgress; app.state.bookService.syncProgress = () => new Promise(resolve => { resolveProgress = resolve; });
 const stop = app.functions.setup.focus(); await flush();
 const artifact = advancedNative(app); app.state.localSyncService.refresh = async () => ({ artifacts: [artifact] });
 app.state.savedChapter = 0; resolveProgress(0); await flush(); await flush();
 assert.equal(app.state.currentChapterIndex, 3); assert.equal(app.state.savedChapter, 3);
 stop();
});
test('reconciliation reads the current native chapter after waiting for the library, and ignores late results on unmount', async () => {
 const app = harness(); const cleanup = app.functions.setup.lifetime();
 const previous = advancedNative(app, 2); let resolveSnapshot;
 app.state.localSyncService.refresh = () => new Promise(resolve => { resolveSnapshot = resolve; });
 const work = app.functions.reconcileNativeChapter();
 const latest = advancedNative(app, 3); resolveSnapshot({ artifacts: [previous, latest] }); await work;
 assert.equal(app.state.currentChapterIndex, 3);
 const next = advancedNative(app, 4); const late = app.functions.reconcileNativeChapter();
 cleanup(); const writes = app.stateWrites.length; resolveSnapshot({ artifacts: [next] }); await late;
 assert.equal(app.stateWrites.length, writes);
});
test('a stale generation effect cannot replace native audio when the screen returns to an earlier chapter', async () => {
 const app = harness(); app.functions.setup.lifetime(); app.state.provider = 'kokoro'; app.state.currentVoice = 'af_bella';
 const artifact = advancedNative(app); app.state.localSyncService.refresh = async () => ({ artifacts: [artifact] });
 app.functions.setup.generation(); await flush();
 assert.equal(app.state.currentChapterIndex, 3);
 assert.equal(app.nativeCalls.some(([name]) => ['replace', 'seekTo', 'pause'].includes(name)), false);
});

test('Follow audio holds a screen wake lock only while Listen is visible and releases it on background or blur', async () => {
 const app=harness(); const stop=app.functions.setup.followAwake(); await flush();
 const first=app.callbacks.awakeTag;assert.match(first,/listen-follow-book-/);
 app.state.AppState.currentState='background';app.callbacks.appState('background');await flush();
 assert.ok(app.cleanupOrder.includes('awake:'+first));
 app.state.AppState.currentState='active';app.callbacks.appState('active');await flush();
 const second=app.callbacks.awakeTag;assert.notEqual(first,second);
 stop();await flush();assert.ok(app.cleanupOrder.includes('awake:'+second));
 app.state.followAudio=false;assert.equal(app.functions.setup.followAwake(),undefined);
});
test('a late keep-awake activation is released after Follow audio is turned off', async () => {
 const app=harness();let finish;
 app.state.activateKeepAwakeAsync=tag=>{app.callbacks.awakeTag=tag;return new Promise(resolve=>{finish=resolve;})};
 const stop=app.functions.setup.followAwake(),tag=app.callbacks.awakeTag;
 stop();finish();await flush();
 assert.ok(app.cleanupOrder.filter(value=>value==='awake:'+tag).length>=1);
});

test('a delayed old chapter load cannot replace audio already advanced by Android', async () => {
 const app=harness();app.functions.setup.lifetime();app.state.provider='kokoro';app.state.currentVoice='af_heart';
 const stop=app.functions.setup.generation();await flush();
 const artifact=advancedNative(app);app.state.localSyncService.refresh=async()=>({artifacts:[artifact]});
 app.resolveAudio({...app.fileFor(0).file,provider:'kokoro',voice:'af_heart'});await flush();await flush();
 assert.equal(app.state.currentChapterIndex,3);
 assert.equal(app.nativeCalls.some(([name])=>name==='replace'),false);
 stop();
});
test('generation cleanup leaves a later native chapter playing', async () => {
 const app=harness();app.functions.setup.lifetime();app.state.provider='kokoro';app.state.currentVoice='af_heart';
 const stop=app.functions.setup.generation();await flush();
 const key=app.functions.identityFor(app.state.currentChapter);app.state.activeKey.current=app.state.audioIdentityKey(key);
 advancedNative(app);const before=app.nativeCalls.length;stop();
 assert.equal(app.nativeCalls.slice(before).some(([name])=>name==='pause'),false);
});

test('an old end-of-chapter event is ignored even after the UI adopts the current native chapter', async () => {
 const app=harness();app.functions.setup.lifetime();app.state.provider='kokoro';
 advancedNative(app,4);const artifact=advancedNative(app,3);
 app.state.localSyncService.refresh=async()=>({artifacts:[artifact]});
 await app.functions.reconcileNativeChapter();
 app.state.currentChapter=app.state.book.chapters[3];
 app.state.status={...app.state.status,localChapterId:'one',didJustFinish:true,playing:false};
 app.functions.setup.playStatus();await flush();
 assert.equal(app.state.indexRef.current,3);assert.equal(app.state.currentChapterIndex,3);
 assert.equal(app.state.playIntent.current,true);
 assert.equal(app.nativeCalls.some(([name])=>name==='replace'),false);
});

test('hidden native PC chapter events do not render or control a later chapter',()=>{
 const app=harness();app.functions.setup.lifetime();const artifact=advancedNative(app,3);
 const before=app.stateWrites.length;app.functions.handleBackgroundAudioStatus({...app.state.nativeStatus,isLoaded:true});
 assert.equal(app.stateWrites.length,before);assert.equal(app.nativeCalls.some(([name])=>name!=='status'),false);
 app.state.awaitingAudio.current='file:///old.wav';app.state.pendingSeek.current={uri:'file:///old.wav',seconds:2};
 app.functions.handleBackgroundAudioStatus({localChapterId:'one',localChapterUri:'file:///old.wav',isLoaded:true});
 assert.equal(app.nativeCalls.some(([name])=>['seekTo','replace','pause'].includes(name)),false);
 assert.equal(app.state.sourceUri.current,null);
});
test('background audio readiness still applies a saved seek before starting playback',async()=>{
 const app=harness();app.functions.setup.lifetime();const uri='file:///saved.wav';
 app.state.awaitingAudio.current=uri;app.state.sourceUri.current=uri;app.state.pendingSeek.current={uri,seconds:7};app.state.switching.current=true;
 app.functions.handleBackgroundAudioStatus({isLoaded:true,playing:false,didJustFinish:false,currentTime:0,duration:20});await flush();
 assert.ok(app.nativeCalls.some(([name,value])=>name==='seekTo'&&value===7));assert.ok(app.nativeCalls.some(([name])=>name==='play'));
 assert.equal(app.state.pendingSeek.current,null);
});
