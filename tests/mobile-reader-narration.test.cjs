const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, mocks = {}) { const module = { exports: {} }; vm.runInNewContext(compile(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')), { module, exports: module.exports, require: n => mocks[n], URL }); return module.exports; }
const helpers = load('mobile-app/src/lib/listen-audio.ts');
const speech = load('mobile-app/src/lib/reader-speech.ts', { './listen-audio': helpers });
const file = path.resolve(__dirname, '../mobile-app/app/reader/[id].tsx');
const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['speakNextSentence', 'toggleTTS', 'skipForward', 'skipBackward', 'stopTTS']);
const definitions = [];
function visit(n) { if (ts.isVariableDeclaration(n) && wanted.has(n.name.getText(ast)))
    definitions.push(`const ${n.name.getText(ast)}=${n.initializer.getText(ast)};`); ts.forEachChild(n, visit); }
visit(ast);
assert.equal(definitions.length, wanted.size);
const flush = () => new Promise(r => setImmediate(r));
function harness(chapters, saved, holdNext = false) {
    const ref = current => ({ current });
    const timers = [], played = [], nativeQueue = [];
    let callbacks, epoch = 0, resolveNext;
    const state = { ...helpers, ...speech, module: { exports: {} }, useCallback: f => f, id: 'book', chapterId: '0', rawContent: chapters[0].body,
        totalChapters: chapters.length, chapterList: chapters.map((c, i) => ({ order: i, title: c.title })), replacements: [], replacementsEnabled: false, bookTitleCache: 'Actual Book',
        isSpeaking: false, isPaused: false, isSpeakingRef: ref(false), isPausedRef: ref(false), utteranceRef: ref(0), titlePendingRef: ref(true), speakingTitleRef: ref(false), titleBodyIndexRef: ref(null),
        chapterTitleRef: ref(chapters[0].title), sentencesRef: ref(chapters[0].body), sentenceParagraphsRef: ref(chapters[0].body.map((_, i) => chapters[0].paragraphs?.[i] ?? i)),
        currentIndexRef: ref(-1), ttsRateRef: ref(1), speechChapterRef: ref(null), readerSelectionRef: ref({ bookId: 'book', chapterId: '0' }), queuedPromotionRef: ref(null), chapterLoadRef: ref(0), shouldAutoStartTTSRef: ref(false),
        flatSentences: chapters[0].body.map((text, i) => ({ text, paraIdx: chapters[0].paragraphs?.[i] ?? i })), paragraphStructure: [chapters[0].body],
        cacheService: { getObject: () => saved }, console: { log() { }, warn() { }, error() { } }, Alert: { alert(...a) { throw new Error(a.join(' ')); } }, alert(m) { throw new Error(m); },
        setTimeout: f => { timers.push(f); return timers.length; }, setSentences() { }, setIsSpeaking: v => state.isSpeaking = v, setIsPaused: v => { state.isPaused = v; state.isPausedRef.current = v; },
        setCurrentSentenceIndex: v => state.currentSentenceIndex = v, setRawContent() { }, setLoadedChapterTitle() { }, setLoading() { }, setChapterId: v => state.chapterId = v,
        clearPlayerState() { }, playbackNotificationService: { showNotification: async () => { }, stopNotification: async () => { } },
        offlineService: { getChapter: async (_, id) => holdNext ? await new Promise(r => resolveNext = r) : chapters[+id].body.join('\n'), saveChapter: async () => { } },
        bookService: { getChapterContent: async () => ({ content: [] }) },
        ttsService: { stop() { epoch++; nativeQueue.length = 0; }, async queue(items, rate, cb) { epoch++; callbacks = cb; nativeQueue.push(...items.map(item => ({ item, epoch }))); }, append(items) { nativeQueue.push(...items.map(item => ({ item, epoch }))); } },
    };
    vm.runInNewContext(compile(definitions.join('\n') + `\nmodule.exports={${[...wanted].join(',')}};`), state);
    const controls = state.module.exports;
    const begin = () => { const entry = nativeQueue.shift(); assert.ok(entry, 'expected queued native utterance'); played.push(entry.item.text); callbacks.onStart(entry.item); return entry; };
    return { state, controls, played, nativeQueue, async start() { await controls.toggleTTS(); timers.shift()(); await flush(); return begin(); }, begin,
        async done(entry) { if (entry.epoch === epoch) {
            callbacks.onDone(entry.item);
            if (!nativeQueue.length)
                callbacks.onComplete();
        } await flush(); }, async tick() { timers.shift()?.(); await flush(); }, releaseNext: v => resolveNext(v) };
}
test('reader queues heading and saved body position without changing body highlight during heading', async () => {
    const r = harness([{ title: 'The Crossing', body: ['Zero.', 'One.', 'Saved.'] }], { chapterIndex: 0, sentenceIndex: 2 });
    const title = await r.start();
    assert.equal(r.played[0], 'The Crossing');
    assert.equal(r.state.currentSentenceIndex, -1);
    await r.done(title);
    r.begin();
    assert.equal(r.played[1], 'Saved.');
    assert.equal(r.state.currentIndexRef.current, 2);
});
test('reader opening Markdown/HTML headers are spoken only once', async () => {
    for (const heading of ['# **Chapter One**', '<h2>Chapter One</h2>', 'CHAPTER ONE.']) {
        const r = harness([{ title: 'Chapter One', body: [heading, 'Body.'] }]);
        const first = await r.start();
        assert.equal(first.item.isTitle, undefined);
        assert.equal(r.played[0], helpers.readerSpeechText(heading));
        await r.done(first);
        r.begin();
        assert.equal(r.played[1], 'Body.');
    }
});
test('resuming beyond an existing header still announces the skipped title', async () => {
    const r = harness([{ title: 'Chapter One', body: ['# Chapter One', 'Opening.', 'Saved.'] }], { chapterIndex: 0, sentenceIndex: 2 });
    const t = await r.start();
    assert.equal(r.played[0], 'Chapter One');
    await r.done(t);
    r.begin();
    assert.equal(r.played[1], 'Saved.');
});
test('reader punctuation-split body heading has no duplicate title', async () => {
    const r = harness([{ title: 'Chapter 1. The Crossing', body: ['# Chapter 1.', 'The Crossing', 'Body.'], paragraphs: [0, 0, 1] }]);
    const t = await r.start();
    assert.equal(t.item.isTitle, undefined);
    assert.deepEqual([r.played[0], ...r.nativeQueue.map(e => e.item.text)], ['Chapter 1.', 'The Crossing', 'Body.']);
});
test('pause during introduction resumes heading and exact saved sentence, ignoring stale callbacks', async () => {
    const r = harness([{ title: 'Crossing', body: ['Zero.', 'One.', 'Saved.'] }], { chapterIndex: 0, sentenceIndex: 2 });
    const old = await r.start();
    await r.controls.toggleTTS();
    await r.done(old);
    assert.equal(r.nativeQueue.length, 0);
    await r.controls.toggleTTS();
    await flush();
    const t = r.begin();
    assert.equal(t.item.text, 'Crossing');
    await r.done(t);
    assert.equal(r.begin().item.text, 'Saved.');
});
test('body pause/resume replays current sentence without repeating heading', async () => {
    const r = harness([{ title: 'Crossing', body: ['First.', 'Second.'] }]);
    const t = await r.start();
    await r.done(t);
    r.begin();
    await r.controls.toggleTTS();
    await r.controls.toggleTTS();
    await flush();
    assert.equal(r.begin().item.text, 'First.');
    assert.deepEqual(r.played, ['Crossing', 'First.', 'First.']);
});
test('native successor promotes chapter title and body without restarting speech', async () => {
    const r = harness([{ title: 'First Chapter', body: ['First body.'] }, { title: 'Second Chapter', body: ['Next body.'] }]);
    let t = await r.start();
    await r.done(t);
    t = r.begin();
    await r.done(t);
    t = r.begin();
    assert.equal(t.item.text, 'Second Chapter');
    assert.equal(r.state.chapterId, '1');
    await r.done(t);
    assert.equal(r.begin().item.text, 'Next body.');
    assert.equal(r.state.currentIndexRef.current, 0);
});
test('reader starts current speech while successor fetch is pending', async () => {
    const r = harness([{ title: 'Current', body: ['Ready.'] }, { title: 'Later', body: ['Later body.'] }], null, true);
    const t = await r.start();
    assert.equal(t.item.text, 'Current');
    assert.equal(r.nativeQueue[0].item.text, 'Ready.');
    r.releaseNext('Later body.');
    await flush();
    assert.ok(r.nativeQueue.some(e => e.item.chapterId === '1'));
});
test('rapid pause before startup cancels stale timer and queues opening header once', async () => {
    const r = harness([{ title: 'Chapter One', body: ['# Chapter One', 'Body.'] }]);
    await r.controls.toggleTTS();
    await r.controls.toggleTTS();
    await r.controls.toggleTTS();
    await flush();
    assert.equal(r.begin().item.text, 'Chapter One');
    await r.tick();
    assert.equal(r.nativeQueue.length, 1);
});
