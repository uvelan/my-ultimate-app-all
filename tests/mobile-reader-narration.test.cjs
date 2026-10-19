const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function transpile(source, fileName = 'test.ts') {
  return ts.transpileModule(source, { fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const helperModule = { exports: {} };
vm.runInNewContext(transpile(fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/lib/listen-audio.ts'), 'utf8')),
  { module: helperModule, exports: helperModule.exports, URL });
const { readerTitlePrefix, readerSpeechText } = helperModule.exports;

// Execute the reader's real speech callbacks with fake Speech/timers. This
// catches startup/resume index regressions without pretending to run native TTS.
const readerPath = path.resolve(__dirname, '../mobile-app/app/reader/[id].tsx');
const readerSource = fs.readFileSync(readerPath, 'utf8');
const ast = ts.createSourceFile(readerPath, readerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['goToNextChapter', 'speakNextSentence', 'toggleTTS', 'skipForward', 'skipBackward', 'stopTTS']);
const definitions = new Map();
let chapterReset;
function inspect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && wanted.has(node.name.text))
    definitions.set(node.name.text, node.initializer.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast) === '[id, chapterId]') chapterReset = node.arguments[0].getText(ast);
  ts.forEachChild(node, inspect);
}
inspect(ast);
assert.equal(definitions.size, wanted.size);
assert.ok(chapterReset);
const callbackCode = [...definitions].map(([name, value]) => `const ${name} = ${value};`).join('\n')
  + `\nmodule.exports = {${[...wanted].join(',')}, resetChapter: ${chapterReset}};`;

function readerHarness(chapters, saved) {
  const utterances = [], timers = new Map(), highlights = [];
  let timerId = 0;
  const ref = current => ({ current });
  const state = {
    module: { exports: {} }, useCallback: callback => callback,
    id: 'book', chapterId: '0', totalChapters: chapters.length,
    Platform: { OS: 'android' }, console: { log() {}, warn() {} }, alert: message => { throw new Error(message); },
    isSpeaking: false, isPaused: false, currentSentenceIndex: -1,
    isSpeakingRef: ref(false), shouldAutoStartTTSRef: ref(false), titlePendingRef: ref(true),
    titleBodyIndexRef: ref(null), speakingTitleRef: ref(false), utteranceRef: ref(0),
    chapterTitleRef: ref(chapters[0].title), sentencesRef: ref(chapters[0].body),
    sentenceParagraphsRef: ref(chapters[0].body.map((_, index) => chapters[0].paragraphs?.[index] ?? index)),
    currentIndexRef: ref(-1), ttsRateRef: ref(1), skipDirectionRef: ref(1), scrollViewRef: ref(null),
    flatSentences: chapters[0].body.map((text, index) => ({ text, paraIdx: chapters[0].paragraphs?.[index] ?? index })), paragraphStructure: [chapters[0].body],
    readerTitlePrefix, readerSpeechText,
    cacheService: { getObject: () => saved || null },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    setChapterId: value => { state.chapterId = value; },
    setIsSpeaking: value => { state.isSpeaking = value; },
    setIsPaused: value => { state.isPaused = value; },
    setCurrentSentenceIndex: value => { state.currentSentenceIndex = value; highlights.push(value); },
    setSentences() {},
    ttsService: {
      stop() {},
      speak(text, rate, done, error) { utterances.push({ text: text.trim(), rate, done, error }); },
    },
  };
  state.exports = state.module.exports;
  vm.runInNewContext(transpile(callbackCode), state);
  const callbacks = state.module.exports;
  return {
    state, utterances, highlights, callbacks,
    tick() { const next = timers.entries().next().value; assert.ok(next, 'expected a scheduled callback'); timers.delete(next[0]); next[1](); },
    start() { callbacks.toggleTTS(); this.tick(); },
    done() { utterances.at(-1).done(); },
    commitChapter() {
      callbacks.resetChapter();
      const chapter = chapters[Number(state.chapterId)];
      state.chapterTitleRef.current = chapter.title; state.sentencesRef.current = chapter.body;
      state.sentenceParagraphsRef.current = chapter.body.map((_, index) => chapter.paragraphs?.[index] ?? index);
      state.flatSentences = chapter.body.map((text, index) => ({ text, paraIdx: chapter.paragraphs?.[index] ?? index })); state.paragraphStructure = [chapter.body];
    },
  };
}

test('reader announces title before saved body position and leaves body indices unchanged', () => {
  const reader = readerHarness([{ title: 'The Crossing', body: ['First sentence.', 'Second sentence.', 'Saved sentence.'] }],
    { chapterIndex: 0, sentenceIndex: 2 });
  reader.start();
  assert.equal(reader.utterances[0].text, 'The Crossing');
  assert.equal(reader.state.currentSentenceIndex, -1, 'a title is not a body highlight/progress entry');
  reader.done();
  assert.equal(reader.utterances[1].text, 'Saved sentence.');
  assert.equal(reader.state.currentSentenceIndex, 2);
  assert.equal(reader.state.currentIndexRef.current, 2);
});

test('reader speaks a Markdown/HTML body heading once without adding another title utterance', () => {
  for (const heading of ['# **Chapter One**', '<h2>Chapter One</h2>', 'CHAPTER ONE.', 'Chapter One: The journey begins.']) {
    const reader = readerHarness([{ title: 'Chapter One', body: [heading, 'The next sentence.'] }]);
    reader.start();
    assert.equal(reader.utterances.length, 1);
    assert.equal(reader.utterances[0].text, readerSpeechText(heading));
    assert.equal(reader.state.currentSentenceIndex, 0);
    reader.done(); reader.tick();
    assert.equal(reader.utterances[1].text, 'The next sentence.');
    assert.equal(reader.state.currentSentenceIndex, 1);
  }
});

test('reader saved position after an existing opening header still announces the skipped chapter title', () => {
  const reader = readerHarness([{ title: 'Chapter One', body: ['# Chapter One', 'Opening.', 'Saved sentence.'] }],
    { chapterIndex: 0, sentenceIndex: 2 });
  reader.start(); assert.equal(reader.utterances[0].text, 'Chapter One');
  reader.done(); assert.equal(reader.utterances[1].text, 'Saved sentence.');
  assert.equal(reader.state.currentSentenceIndex, 2);
});

test('reader heading split by punctuation is read from its body sentences without a duplicate announcement', () => {
  const reader = readerHarness([{ title: 'Chapter 1. The Crossing',
    body: ['# Chapter 1.', 'The Crossing', 'The river was cold.'], paragraphs: [0, 0, 1] }]);
  reader.start();
  assert.equal(reader.utterances[0].text, 'Chapter 1.'); assert.equal(reader.state.currentSentenceIndex, 0);
  reader.done(); reader.tick();
  assert.equal(reader.utterances[1].text, 'The Crossing'); assert.equal(reader.state.currentSentenceIndex, 1);
  reader.done(); reader.tick();
  assert.equal(reader.utterances[2].text, 'The river was cold.'); assert.equal(reader.state.currentSentenceIndex, 2);
  assert.equal(reader.utterances.some(item => item.text === 'Chapter 1. The Crossing'), false);
});

test('reader pause/resume during introduction returns to the exact saved sentence and ignores stale completion', () => {
  const reader = readerHarness([{ title: 'The Crossing', body: ['Zero.', 'One.', 'Saved.'] }],
    { chapterIndex: 0, sentenceIndex: 2 });
  reader.start(); const obsolete = reader.utterances[0];
  reader.callbacks.toggleTTS(); assert.equal(reader.state.isPaused, true);
  obsolete.done(); assert.equal(reader.utterances.length, 1);
  reader.callbacks.toggleTTS(); assert.equal(reader.utterances[1].text, 'The Crossing');
  reader.done(); assert.equal(reader.utterances[2].text, 'Saved.');
  assert.equal(reader.state.currentSentenceIndex, 2);
});

test('reader body resume replays the current body sentence without repeating the announced title', () => {
  const reader = readerHarness([{ title: 'The Crossing', body: ['First sentence.', 'Second sentence.'] }]);
  reader.start(); reader.done();
  assert.equal(reader.state.currentSentenceIndex, 0);
  reader.callbacks.toggleTTS(); reader.callbacks.toggleTTS();
  assert.deepEqual(reader.utterances.map(item => item.text), ['The Crossing', 'First sentence.', 'First sentence.']);
  reader.done(); reader.tick();
  assert.equal(reader.utterances.at(-1).text, 'Second sentence.');
  assert.equal(reader.state.currentSentenceIndex, 1);
});

test('reader auto-next starts the new chapter with its title and body index zero', () => {
  const reader = readerHarness([{ title: 'First Chapter', body: ['First body.'] }, { title: 'Second Chapter', body: ['Next body.'] }]);
  reader.start(); reader.done(); reader.done(); reader.tick();
  assert.equal(reader.state.chapterId, '1'); assert.equal(reader.state.shouldAutoStartTTSRef.current, true);
  reader.commitChapter(); reader.start();
  assert.equal(reader.utterances.at(-1).text, 'Second Chapter');
  assert.equal(reader.state.currentSentenceIndex, -1);
  reader.done(); assert.equal(reader.utterances.at(-1).text, 'Next body.');
  assert.equal(reader.state.currentSentenceIndex, 0);
});

test('reader rapid pause before startup does not duplicate an existing heading on resume', () => {
  const reader = readerHarness([{ title: 'Chapter One', body: ['# Chapter One', 'Body.'] }]);
  reader.callbacks.toggleTTS(); reader.callbacks.toggleTTS(); reader.callbacks.toggleTTS();
  assert.equal(reader.utterances[0].text, 'Chapter One');
  assert.equal(reader.state.currentSentenceIndex, 0);
  reader.tick(); assert.equal(reader.utterances.length, 1, 'cancelled startup timer must not enqueue another utterance');
});

test('reader title normalization preserves a different title and does not match a partial word', () => {
  assert.equal(readerTitlePrefix('Chapter One', '# **Chapter One**'), '');
  assert.equal(readerTitlePrefix('<h1>The Crossing</h1>', 'The river was cold.'), 'The Crossing');
  assert.equal(readerTitlePrefix('One', 'Oneness matters.'), 'One');
});
