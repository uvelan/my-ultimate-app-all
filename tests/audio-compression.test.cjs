const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const encoderPromise = import('@breezystack/lamejs');

async function loadCompression({ encoder, yieldToLoop = setImmediate } = {}) {
  const actualEncoder = encoder || await encoderPromise;
  const filename = path.resolve(__dirname, '../src/lib/audio-compression.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  let imports = 0;
  vm.runInNewContext(source, { module, exports: module.exports, Buffer, Int16Array, Uint8Array,
    setImmediate: yieldToLoop, require(name) {
      assert.equal(name, '@breezystack/lamejs');
      imports++;
      return actualEncoder;
    } });
  return { ...module.exports, importCount: () => imports };
}

function riffChunk(id, payload) {
  const header = Buffer.alloc(8);
  header.write(id);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length % 2)]);
}

function sineWave({ rate = 24000, channels = 1, seconds = 2, junk = false, split = false } = {}) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1, 0);
  format.writeUInt16LE(channels, 2);
  format.writeUInt32LE(rate, 4);
  format.writeUInt32LE(rate * channels * 2, 8);
  format.writeUInt16LE(channels * 2, 12);
  format.writeUInt16LE(16, 14);
  const pcm = Buffer.alloc(Math.floor(rate * seconds) * channels * 2);
  for (let sample = 0; sample < pcm.length / (channels * 2); sample++) {
    for (let channel = 0; channel < channels; channel++) {
      pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (440 + channel * 110) * sample / rate) * 12000),
        (sample * channels + channel) * 2);
    }
  }
  const pieces = [riffChunk('fmt ', format)];
  if (junk) pieces.unshift(riffChunk('JUNK', Buffer.from('odd')));
  if (split) {
    const middle = Math.floor(pcm.length / (channels * 4)) * channels * 2;
    pieces.push(riffChunk('data', pcm.subarray(0, middle)), riffChunk('data', pcm.subarray(middle)));
  } else pieces.push(riffChunk('data', pcm));
  const body = Buffer.concat([Buffer.from('WAVE'), ...pieces]);
  const header = Buffer.alloc(8);
  header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

test('real encoder produces smaller MP3 from mono and stereo narration at supported rates', async () => {
  const helper = await loadCompression();
  for (const rate of [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]) {
    const wav = sineWave({ rate, channels: rate === 24000 ? 2 : 1 });
    const result = await helper.compressNarrationAudio(wav, 'audio/wav');
    assert.equal(result.contentType, 'audio/mpeg', `rate ${rate}`);
    assert.ok(result.audio.length < wav.length, `rate ${rate} is smaller`);
    assert.equal(result.audio[0], 0xff);
    assert.equal(result.audio[1] & 0xe0, 0xe0);
  }
});

test('real compressed output decodes as mono MP3 with the original sample rate', async t => {
  const helper = await loadCompression();
  const result = await helper.compressNarrationAudio(sineWave({ channels: 2, junk: true, split: true }), 'audio/wav');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', 'pipe:0'], {
    input: result.audio, encoding: 'utf8', windowsHide: true,
  });
  if (probe.error?.code === 'ENOENT') { t.skip('ffprobe is optional outside the validation workstation'); return; }
  assert.equal(probe.status, 0, probe.stderr);
  const stream = JSON.parse(probe.stdout).streams[0];
  assert.equal(stream.codec_name, 'mp3');
  assert.equal(Number(stream.sample_rate), 24000);
  assert.equal(stream.channels, 1);
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1'], {
    input: result.audio, windowsHide: true, maxBuffer: 5 * 1024 * 1024,
  });
  if (decoded.error?.code === 'ENOENT') return;
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert.ok(decoded.stdout.length >= 1.9 * 24000 * 2, 'complete two-second speech-equivalent signal decodes');
  let peak = 0;
  for (let offset = 0; offset + 2 <= decoded.stdout.length; offset += 2) {
    peak = Math.max(peak, Math.abs(decoded.stdout.readInt16LE(offset)));
  }
  assert.ok(peak > 5000, 'decoded signal contains the synthetic narration tone');
});

test('already MP3, unsupported WAV, and malformed RIFF preserve the original bytes without importing encoder', async () => {
  const helper = await loadCompression();
  const wav = sineWave();
  const unsupported = Buffer.from(wav); unsupported.writeUInt16LE(3, 20);
  const badRate = Buffer.from(wav); badRate.writeUInt32LE(12345, 24);
  const badAlignment = Buffer.from(wav); badAlignment.writeUInt16LE(4, 32);
  const truncated = wav.subarray(0, wav.length - 1);
  const badChunk = Buffer.from(wav); badChunk.writeUInt32LE(0xffffffff, 40);
  for (const [audio, type] of [[wav, 'audio/mpeg'], [unsupported, 'audio/wav'], [badRate, 'audio/wav'],
    [badAlignment, 'audio/wav'], [truncated, 'audio/wav'], [badChunk, 'audio/wav'], [Buffer.from('not wav'), 'audio/wav']]) {
    const result = await helper.compressNarrationAudio(audio, type);
    assert.strictEqual(result.audio, audio);
    assert.equal(result.contentType, type);
  }
  assert.equal(helper.importCount(), 0);
});

test('encoder failure and invalid frame output fail open to original WAV', async () => {
  const wav = sineWave();
  for (const encoder of [
    { Mp3Encoder: class { constructor() { throw new Error('Encoder unavailable'); } } },
    { Mp3Encoder: class { encodeBuffer() { return new Int8Array([1, 2, 3]); } flush() { return new Int8Array(); } } },
  ]) {
    const helper = await loadCompression({ encoder });
    const result = await helper.compressNarrationAudio(wav, 'audio/wav');
    assert.strictEqual(result.audio, wav);
    assert.equal(result.contentType, 'audio/wav');
  }
});

test('tiny WAV retains original when MP3 headers and encoder delay would make it larger', async () => {
  const helper = await loadCompression();
  const wav = sineWave({ seconds: 0.001 });
  const result = await helper.compressNarrationAudio(wav, 'audio/wav');
  assert.strictEqual(result.audio, wav);
});

test('abort before encoding and during event-loop yields propagates without returning partial audio', async () => {
  const early = new AbortController(); early.abort();
  const helper = await loadCompression();
  await assert.rejects(helper.compressNarrationAudio(sineWave(), 'audio/wav', early.signal), { name: 'AbortError' });
  assert.equal(helper.importCount(), 0);
  const controller = new AbortController();
  let yields = 0;
  const interruptible = await loadCompression({ yieldToLoop(callback) {
    yields++;
    controller.abort();
    return setImmediate(callback);
  } });
  await assert.rejects(interruptible.compressNarrationAudio(sineWave({ seconds: 10 }), 'audio/wav', controller.signal), { name: 'AbortError' });
  assert.equal(yields, 1);
});
