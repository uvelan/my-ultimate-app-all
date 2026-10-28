const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProgressiveAudio } = require('./helpers/progressive-audio.cjs');
const piece = (index, start, end) => ({ index, start, end, text: 'Passage ' + index, uri: 'file:///piece' + index + '.wav', bytes: 100 });
test('first measured passage plays before completion; EOF buffers rather than advancing the chapter', () => {
    const stream = new ProgressiveAudio('chapter-and-voice');
    assert.equal(stream.append(piece(0, 0, 2), {}), true);
    assert.equal(stream.advance().index, 0);
    assert.equal(stream.complete, false);
    assert.equal(stream.advance(), undefined);
    assert.equal(stream.waiting, true);
    assert.equal(stream.append(piece(1, 2, 9), {}), true);
    assert.equal(stream.advance().index, 1);
    assert.equal(stream.offset, 2);
    assert.equal(stream.duration, 9);
    stream.complete = true;
    assert.equal(stream.current.index, 1, 'merging does not restart the playing passage');
    assert.equal(stream.advance(), undefined);
});
test('chapter timeline seeks across passages with exact PCM offsets and clamps to generated audio', () => {
    const stream = new ProgressiveAudio('chapter');
    stream.append(piece(0, 0, 2), {}); stream.append(piece(1, 2, 9), {});
    assert.equal(stream.seek(5).seconds, 3); assert.equal(stream.current.index, 1);
    assert.equal(stream.seek(2).seconds, 0); assert.equal(stream.current.index, 1);
    assert.equal(stream.seek(-5).seconds, 0); assert.equal(stream.current.index, 0);
    assert.ok(stream.seek(500).seconds < 7); assert.equal(stream.current.index, 1);
    assert.equal(stream.seek(NaN), null);
});
test('duplicate and out-of-order pieces never change the narration timeline', () => {
    const stream = new ProgressiveAudio('chapter');
    assert.equal(stream.append(piece(1, 0, 2), {}), false);
    assert.equal(stream.append(piece(0, 0, 2), {}), true);
    assert.equal(stream.append(piece(0, 0, 2), {}), false);
    assert.equal(stream.append(piece(1, 3, 5), {}), false);
    assert.equal(stream.append(piece(1, 2, Infinity), {}), false);
    assert.equal(stream.duration, 2);
});

test('voice switching keeps the playing passage and drops only future pieces and timing', () => {
  const stream = new ProgressiveAudio('chapter');
  for (let i = 0; i < 3; i++) stream.append(piece(i, i * 2, i * 2 + 2), { segments: Array.from({ length: i + 1 }, (_, j) => piece(j, j * 2, j * 2 + 2)) });
  stream.advance(); stream.complete = true; stream.truncateAfterCurrent();
  assert.equal(stream.current.index, 0); assert.equal(stream.pieces.length, 1); assert.equal(stream.sync.segments.length, 1);
  assert.equal(stream.complete, false); assert.equal(stream.append(piece(1, 2, 5), {}), true);
  assert.equal(stream.advance().end, 5);
});
