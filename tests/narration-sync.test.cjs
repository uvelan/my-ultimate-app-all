const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const webSource = fs.readFileSync('src/lib/narration-sync.ts', 'utf8');
const moduleCopy = { exports: {} };
new vm.Script(ts.transpileModule(webSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: moduleCopy, exports: moduleCopy.exports });
const { buildNarrationCues, activeNarrationCue, validNarrationSync } = moduleCopy.exports;
const metadata = segments => ({ version: 1, title: 'Title', paragraphs: ['Corrected body.'], segments });

test('Android and web use identical timing calculations', () => {
    assert.equal(fs.readFileSync('mobile-app/src/lib/narration-sync.ts', 'utf8'), webSource);
});
test('legacy timing includes the spoken title before chapter text', () => {
    const cues = buildNarrationCues(JSON.stringify(['A short sentence.', 'A much longer passage with many more words to read aloud.']), 'Chapter one');
    assert.equal(cues[0].text, 'Chapter one.');
    assert.ok(cues[2].end - cues[2].start > cues[1].end - cues[1].start);
    assert.equal(cues[0].start, 0);
    assert.equal(cues.at(-1).end, 1);
});
test('titles already present in the narrated body are not counted twice', () => {
    const cues = buildNarrationCues(['CHAPTER ONE!', 'Body text.'], 'Chapter one');
    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, 'CHAPTER ONE!');
});
test('measured provider chunk boundaries stop whole-chapter timing drift', () => {
    const sync = metadata([{ text: 'Title. First sentence.', start: 0, end: 8 }, { text: 'The slow final sentence.', start: 8, end: 40 }]);
    const cues = buildNarrationCues('Original text should not replace corrected audio.', 'Wrong title', sync);
    assert.equal(cues.at(-1).text, 'The slow final sentence.');
    assert.equal(cues.at(-1).start, 0.2);
    assert.equal(activeNarrationCue(cues, 7, 40), 1);
    assert.equal(activeNarrationCue(cues, 8, 40), 2);
});
test('seeking backward, forward and to the end selects the current passage immediately', () => {
    const cues = buildNarrationCues('', '', metadata([{ text: 'First.', start: 0, end: 10 }, { text: 'Second.', start: 10, end: 20 }]));
    assert.equal(activeNarrationCue(cues, 12, 20), 1);
    assert.equal(activeNarrationCue(cues, 2, 20), 0);
    assert.equal(activeNarrationCue(cues, 20, 20), 1);
    assert.equal(activeNarrationCue(cues, 90, 20), 1);
    assert.equal(activeNarrationCue(cues, -1, 20), 0);
});
test('duration scaling accounts for container padding without applying playback rate twice', () => {
    const cues = buildNarrationCues('', '', metadata([{ text: 'First.', start: 0, end: 10 }, { text: 'Second.', start: 10, end: 20 }]));
    assert.equal(activeNarrationCue(cues, 11, 22), 1);
    assert.equal(activeNarrationCue(cues, 5, 22), 0);
});
test('empty or unavailable media duration never highlights a fictitious line', () => {
    const cues = buildNarrationCues(['Text.']);
    for (const duration of [0, -1, NaN, Infinity]) assert.equal(activeNarrationCue(cues, 0, duration), -1);
    assert.equal(activeNarrationCue([], 1, 20), -1);
    assert.equal(activeNarrationCue(cues, NaN, 20), -1);
    assert.equal(buildNarrationCues(null, 'Title only').length, 0);
});
test('invalid or overlapping metadata safely uses cleaned legacy text', () => {
    for (const segments of [[{ text: 'Bad.', start: 1, end: 0 }], [{ text: 'Bad.', start: 0, end: NaN }], [{ text: 'First.', start: 0, end: 10 }, { text: 'Overlap.', start: 5, end: 20 }], []]) {
        const sync = metadata(segments);
        assert.equal(validNarrationSync(sync), false);
        const cues = buildNarrationCues(['<b>Original.</b>'], '', sync);
        assert.equal(cues[0].text, 'Original.');
    }
});
test('long passages have short readable follow targets without losing text', () => {
    const text = Array(90).fill('word').join(' ') + '.';
    const cues = buildNarrationCues([text]);
    assert.ok(cues.length >= 3);
    assert.ok(cues.every(cue => cue.text.length <= 180));
    assert.equal(cues.map(cue => cue.text).join(' '), text);
    for (let index = 1; index < cues.length; index++) assert.equal(cues[index].start, cues[index - 1].end);
});
