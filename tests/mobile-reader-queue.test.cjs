const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const module = { exports: {} };
  new vm.Script(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { filename }).runInNewContext({ module, exports: module.exports,
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unexpected speech dependency: ${name}`); },
  });
  return module.exports;
}
function harness({ limit = 4000, stop } = {}) {
  const queued = [], played = [], old = [];
  let stops = 0;
  const speech = { maxSpeechInputLength: limit,
    speak(text, options) { queued.push({ text, options }); },
    async stop() { stops++; old.push(...queued.splice(0)); if (stop) await stop(); },
    async isSpeakingAsync() { return queued.length > 0; }, async getAvailableVoicesAsync() { return []; },
  };
  const service = load('mobile-app/src/services/tts.service.ts', { 'expo-speech': speech }).ttsService;
  const helpers = load('mobile-app/src/lib/reader-speech.ts', { './listen-audio': load('mobile-app/src/lib/listen-audio.ts') });
  return { service, ...helpers, queued, played, old, stops: () => stops,
    // Native engine progresses even when JavaScript delivery is suspended.
    runNative(deliverEvents = false) {
      while (queued.length) {
        const utterance = queued.shift(); played.push(utterance.text);
        if (deliverEvents) { utterance.options.onStart?.(); utterance.options.onDone?.(); }
      }
    },
  };
}
const item = (text, chapterId = '0', sentenceIndex = 0) => ({ text, chapterId, sentenceIndex });

test('current chapter and its successor finish natively with every JavaScript callback suspended', async () => {
  const reader = harness();
  const current = reader.prepareReaderChapter('0', 'The Beginning', ['First sentence. Second sentence.'], [], true);
  const next = reader.prepareReaderChapter('1', 'The Crossing', ['Third sentence. Fourth sentence.'], [], true);
  let callbacks = 0;
  await reader.service.queue([...reader.readerChapterQueue(current), ...reader.readerChapterQueue(next)], 1.25,
    { onStart: () => callbacks++, onDone: () => callbacks++, onComplete: () => callbacks++ });
  assert.equal(reader.queued.length, 6, 'both headings and every sentence enter native QUEUE_ADD before any completion');
  assert.ok(reader.queued.every(utterance => utterance.options.rate === 1.25));
  reader.runNative(false);
  assert.deepEqual(reader.played, ['The Beginning', 'First sentence.', 'Second sentence.', 'The Crossing', 'Third sentence.', 'Fourth sentence.']);
  assert.equal(callbacks, 0);
});

test('native start callbacks can append a future chapter without replacing the prepared queue', async () => {
  const reader = harness();
  await reader.service.queue([item('Current.'), item('Next.', '1')], 1, {
    onStart(entry) { if (entry.chapterId === '1') reader.service.append([item('Following.', '2')]); },
  });
  reader.runNative(true);
  assert.deepEqual(reader.played, ['Current.', 'Next.', 'Following.']);
  assert.equal(reader.stops(), 1, 'refill never stops the engine');
});

test('pause/stop clears native successors and late callbacks cannot advance or complete an obsolete session', async () => {
  const reader = harness(); let done = 0;
  await reader.service.queue([item('Interrupted.'), item('Future.', '1')], 1, { onComplete: () => done++ });
  const stale = [...reader.queued];
  await reader.service.stop();
  for (const utterance of stale) { utterance.options.onStart(); utterance.options.onDone(); }
  assert.equal(reader.queued.length, 0); assert.equal(done, 0);
  assert.equal(reader.service.append([item('Not authorized to resume.')]), false);
  await reader.service.queue([item('Interrupted.'), item('Future.', '1')]);
  reader.runNative(true);
  assert.deepEqual(reader.played, ['Interrupted.', 'Future.']);
});

test('replacing a queue for skip/seek uses the chosen index and current voice without old utterances', async () => {
  const reader = harness();
  const chapter = reader.prepareReaderChapter('0', 'Heading', ['One. Two. Three.'], [], false);
  reader.service.selectVoice('device-voice-a');
  await reader.service.queue(reader.readerChapterQueue(chapter), 1);
  reader.service.selectVoice('device-voice-b');
  await reader.service.queue(reader.readerChapterQueue(chapter, 1, false), 1.5);
  assert.deepEqual(reader.queued.map(entry => entry.text), ['Two.', 'Three.']);
  assert.ok(reader.queued.every(entry => entry.options.voice === 'device-voice-b' && entry.options.rate === 1.5));
  reader.runNative(); assert.deepEqual(reader.played, ['Two.', 'Three.']);
});

test('a stop during asynchronous queue replacement prevents any subsequent native speak call', async () => {
  let release;
  const reader = harness({ stop: () => new Promise(resolve => { release = resolve; }) });
  const pending = reader.service.queue([item('Must never start.')]);
  const firstRelease = release;
  const stopping = reader.service.stop();
  firstRelease(); release();
  assert.equal(await pending, false); await stopping;
  assert.equal(reader.queued.length, 0);
});

test('headings are announced once and corrected/replaced text preserves paragraph and resume positions', () => {
  const reader = harness();
  const chapter = reader.prepareReaderChapter('2', 'Chapter 3. Crossing', ['Chapter 3. Crossing', 'Alice runs. Alice rests.'], [{ search: 'Alice', replace: 'Mia' }], true);
  const queue = reader.readerChapterQueue(chapter);
  assert.equal(queue.filter(entry => entry.isTitle).length, 0, 'heading already in opening paragraph');
  assert.deepEqual(Array.from(queue, entry => entry.text), ['Chapter 3.', 'Crossing', 'Mia runs.', 'Mia rests.']);
  const resumed = reader.readerChapterQueue(chapter, 3, false);
  assert.equal(resumed.length, 1); assert.equal(resumed[0].sentenceIndex, 3); assert.equal(resumed[0].text, 'Mia rests.');
  assert.equal(chapter.sentences[3].paraIdx, 1);
});

test('long Unicode sentences respect the native UTF-16 input limit and complete only after every piece', async () => {
  const reader = harness({ limit: 30 }); let complete = 0;
  const text = '\u{1f600}'.repeat(51);
  await reader.service.queue([item(text)], 1, { onComplete: () => complete++ });
  assert.ok(reader.queued.length > 1);
  for (const entry of reader.queued) { assert.ok(entry.text.length <= 30); assert.ok(!/[\uD800-\uDBFF]$/.test(entry.text)); }
  assert.equal(reader.queued.map(entry => entry.text).join(''), text);
  reader.runNative(true); assert.equal(complete, 1);
});
