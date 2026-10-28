const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const modules = new Map();
function load(name) {
 if (modules.has(name)) return modules.get(name);
 const module = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../mobile-app/src/lib/' + name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, require: dependency => load(dependency.slice(2)), Uint8Array, ArrayBuffer, AbortController, Error, setTimeout, clearTimeout, fetch });
 modules.set(name, module.exports); return module.exports;
}
const { googleAudioChunks, googleAudioUrl, generateNativeGoogleAudio } = load('google-audio');
const identity = { userId: 'user', bookId: 'book', chapterId: 'chapter', title: 'Chapter One', content: ['The story starts. '.repeat(120)], provider: 'google', voice: 'en', grammarModel: 'OFF' };
function frame(index) { const bytes = new Uint8Array(192); bytes.set([255,243,132,196]); bytes[10] = index; return bytes; }
function response(bytes) { return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => bytes.buffer }; }
test('Google chunks fit its limit without cutting surrogate pairs or losing text', () => {
 const text = ('A sentence with an emoji 🌟. ' + 'x'.repeat(230) + ' ').repeat(3);
 const chunks = googleAudioChunks(text);
 assert.ok(chunks.every(chunk => chunk.length <= 200 && !/[\uD800-\uDBFF]$/.test(chunk) && !/^[\uDC00-\uDFFF]/.test(chunk)));
 assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
 assert.equal(new URL(googleAudioUrl('A & B?', 'en-IN')).searchParams.get('q'), 'A & B?');
 assert.throws(() => googleAudioUrl('hello', 'unsupported'), /Invalid/);
});
test('out-of-order Google responses retain narration order, measured timing, and four-request concurrency', async () => {
 let active = 0, peak = 0; const texts = [];
 const result = await generateNativeGoogleAudio(identity, new AbortController().signal, async (url, options) => {
  assert.deepEqual(Object.keys(options), ['signal']); assert.equal(new URL(url).origin, 'https://translate.google.com');
  const index = texts.length; texts.push(new URL(url).searchParams.get('q')); active++; peak = Math.max(peak, active);
  await new Promise(resolve => setTimeout(resolve, index % 2 ? 0 : 4)); active--; return response(frame(index));
 });
 assert.equal(peak, 4); const bytes = new Uint8Array(result.data);
 texts.forEach((_, index) => assert.equal(bytes[index * 192 + 10], index));
 assert.equal(result.sync.segments.length, texts.length);
 assert.ok(result.sync.segments.every(segment => segment.end > segment.start));
 assert.equal(texts.filter(text => text.includes('Chapter One')).length, 1);
 assert.equal(result.headers['x-tts-voice'], 'en');
});
test('cancelling direct Google generation stops active requests and prevents a late result', async () => {
 const controller = new AbortController(); let calls = 0;
 const pending = generateNativeGoogleAudio(identity, controller.signal, async (_, options) => {
  calls++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
 });
 controller.abort(); await assert.rejects(pending, /cancelled/); assert.equal(calls, 4);
});
test('invalid provider responses and unsupported settings never become cached playable audio', async () => {
 await assert.rejects(generateNativeGoogleAudio(identity, new AbortController().signal, async () => ({ ok: true, headers: { get: () => 'text/html' } })), /playable audio/);
 for (const change of [{ provider: 'gemini' }, { grammarModel: 'gpt-4o-mini' }]) {
  await assert.rejects(generateNativeGoogleAudio({ ...identity, ...change }, new AbortController().signal, async () => { throw new Error('Must not send'); }), /only available/);
 }
});
