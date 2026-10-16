const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadPlayback() {
  const filename = path.resolve(__dirname, '../src/lib/listen-playback.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new vm.Script(source, { filename }).runInNewContext({ module, exports: module.exports });
  return module.exports;
}

test('ready audio requests playback synchronously within the chapter-ended callback', () => {
  const { handoffPreparedAudio } = loadPlayback();
  const events = ['ended callback'];
  const media = {
    set src(value) { events.push(['src', value]); },
    load() { events.push('load'); },
    set playbackRate(value) { events.push(['rate', value]); },
    play() { events.push('play'); return new Promise(() => {}); },
  };
  handoffPreparedAudio(media, 'blob:ready-next-chapter', 1.75, () => assert.fail('unexpected playback failure'));
  events.push('callback returns');
  assert.deepEqual(events, ['ended callback', ['src', 'blob:ready-next-chapter'], 'load', ['rate', 1.75], 'play', 'callback returns']);
});

test('a successful playback promise does not report an error', async () => {
  const { handoffPreparedAudio } = loadPlayback();
  const errors = [];
  const media = { src: '', playbackRate: 1, load() {}, play: async () => {} };
  handoffPreparedAudio(media, 'blob:next', 0.8, error => errors.push(error));
  assert.equal(media.src, 'blob:next');
  assert.equal(media.playbackRate, 0.8);
  await Promise.resolve();
  assert.deepEqual(errors, []);
});

test('consecutive prepared handoffs reuse the media element and preserve the chosen speed', () => {
  const { handoffPreparedAudio } = loadPlayback();
  const played = [];
  const media = {
    src: '', playbackRate: 1,
    load() { this.playbackRate = 1; }, // Browsers may reset rate when loading a new resource.
    play() { played.push({ src: this.src, rate: this.playbackRate }); return Promise.resolve(); },
  };
  for (const chapter of [1, 2, 3]) {
    handoffPreparedAudio(media, `blob:chapter-${chapter}`, 1.5, () => assert.fail('unexpected handoff failure'));
    assert.equal(played.length, chapter, 'each prepared chapter requests playback immediately');
  }
  assert.deepEqual(played, [
    { src: 'blob:chapter-1', rate: 1.5 },
    { src: 'blob:chapter-2', rate: 1.5 },
    { src: 'blob:chapter-3', rate: 1.5 },
  ]);
});

test('browser playback rejection is handled without an unhandled promise or synchronous throw', async () => {
  const { handoffPreparedAudio } = loadPlayback();
  const rejection = new Error('Background playback was blocked');
  const errors = [];
  const media = { src: '', playbackRate: 1, load() {}, play: () => Promise.reject(rejection) };
  assert.doesNotThrow(() => handoffPreparedAudio(media, 'blob:next', 1, error => errors.push(error)));
  await Promise.resolve();
  assert.deepEqual(errors, [rejection]);
});

test('synchronous media failures are reported to the caller', async t => {
  for (const failingOperation of ['load', 'play']) {
    await t.test(failingOperation, () => {
      const { handoffPreparedAudio } = loadPlayback();
      const failure = new Error(`${failingOperation} failed`);
      const errors = [];
      const media = {
        src: '', playbackRate: 1,
        load() { if (failingOperation === 'load') throw failure; },
        play() { throw failure; },
      };
      assert.doesNotThrow(() => handoffPreparedAudio(media, 'blob:next', 1.2, error => errors.push(error)));
      assert.deepEqual(errors, [failure]);
    });
  }
});

test('the Android pause guard recognizes a finished track without treating buffering or midtrack pauses as ended', () => {
  const { isAudioAtEnd } = loadPlayback();
  assert.equal(isAudioAtEnd({ ended: true, duration: NaN, currentTime: 0 }), true, 'the native ended flag is sufficient');
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 9.9 }), true);
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 9.85 }), true, '150ms boundary');
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 9.849 }), false);
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 10 }), true);
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 10.1 }), true, 'a media clock slightly beyond duration is finished');
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 0 }), false);
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 9.8 }), false);
  assert.equal(isAudioAtEnd({ ended: false, duration: 10, currentTime: 5 }), false);
  for (const duration of [NaN, Infinity, 0, -1]) {
    assert.equal(isAudioAtEnd({ ended: false, duration, currentTime: 0 }), false, 'unknown or invalid duration must not trigger the next chapter');
  }
});
