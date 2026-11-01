const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const secret = 'test-drive-key-that-has-more-than-32-characters';
function load(file, dependencies = {}) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../', file), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 vm.runInNewContext(code, { module, exports: module.exports, Buffer, process: { env: { DRIVE_SESSION_SECRET: secret } },
  Request, Response, Headers, URL, URLSearchParams, ReadableStream, Uint8Array,
  require: name => name.startsWith('node:') ? require(name) : name in dependencies ? dependencies[name] : (() => { throw Error(name); })() });
 return module.exports;
}
const crypto = load('src/lib/drive-stream.ts');
const token = 'private-google-token-never-placed-in-a-playback-url';
const grant = () => crypto.sealDrive({ owner: 'user', exp: Date.now() + 600000, token }, 'session');
const ticket = () => crypto.sealDrive({ owner: 'user', exp: Date.now() + 600000, file: 'drive-audio-file-123', size: 100, version: '3', sha256: 'a'.repeat(64) }, 'stream');

test('Drive grants/tickets are encrypted, authenticated, purpose-bound, owner-bound and expiring', () => {
 const key = crypto.driveKey(secret), now = 1000;
 const value = crypto.sealDrive({ owner: 'u', exp: 2000, token }, 'session', key);
 assert.ok(!value.includes(token));
 assert.equal(crypto.openDrive(value, 'session', 'u', key, now).token, token);
 assert.throws(() => crypto.openDrive(value, 'stream', 'u', key, now));
 assert.throws(() => crypto.openDrive(value, 'session', 'other', key, now));
 assert.throws(() => crypto.openDrive(value, 'session', 'u', key, 2001));
 assert.throws(() => crypto.openDrive((value[0] === 'A' ? 'B' : 'A') + value.slice(1), 'session', 'u', key, now));
 assert.throws(() => crypto.driveKey('default-secret'));
});
test('Drive byte ranges support open ends and suffixes and reject multi/invalid/out-of-bounds requests', () => {
 for (const range of ['bytes=0-', 'bytes=2-5', 'bytes=-20', null]) assert.equal(crypto.validAudioRange(range, 100), true);
 for (const range of ['bytes=100-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=foo', 'bytes=-']) assert.equal(crypto.validAudioRange(range, 100), false);
 assert.deepEqual(Array.from(crypto.expectedAudioRange('bytes=-20', 100)), [80, 99]);
 assert.deepEqual(Array.from(crypto.expectedAudioRange('bytes=2-999', 100)), [2, 99]);
});
function streamHarness({ auth = true, changed = false, badRange = false } = {}) {
 let reads = 0, cancelled = false; const requests = [];
 const body = new ReadableStream({ pull(controller) { reads++; controller.enqueue(Uint8Array.from([1, 2, 3, 4])); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
 const route = load('src/app/api/drive/stream/route.ts', {
  'next/headers': { cookies: async () => ({ get: () => ({ value: grant() }) }) },
  '@/lib/auth-server': { verifyAuth: async () => ({ user: auth ? { id: 'user' } : null }) }, '@/lib/drive-stream': crypto,
  '@/lib/drive-api-server': { driveJson: async () => ({ size: 100, version: changed ? '4' : '3', sha256Checksum: 'a'.repeat(64) }),
   driveFetch: async (access, path, options) => { requests.push({ access, path, options }); return new Response(body, { status: 206, headers: { 'Content-Length': '4', 'Content-Range': badRange ? 'bytes 3-6/100' : 'bytes 2-5/100' } }); } },
 });
 return { route, requests, reads: () => reads, cancelled: () => cancelled,
  request: range => new Request(`https://app.example/api/drive/stream?ticket=${ticket()}`, { headers: range ? { Range: range } : {} }) };
}
test('web Drive streaming starts without buffering a chapter and forwards ranges/cancellation', async () => {
 const h = streamHarness(); const response = await h.route.GET(h.request('bytes=2-5'));
 assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/100');
 assert.equal(h.reads(), 0); assert.equal(h.requests[0].options.headers.Range, 'bytes=2-5');
 const reader = response.body.getReader(); assert.deepEqual(Array.from((await reader.read()).value), [1, 2, 3, 4]);
 await reader.cancel(); assert.equal(h.cancelled(), true);
});
test('stream rejects unauthenticated requests, changed files and incorrect upstream byte ranges', async () => {
 const unauth = streamHarness({ auth: false }); assert.equal((await unauth.route.GET(unauth.request('bytes=2-5'))).status, 401); assert.equal(unauth.requests.length, 0);
 const invalid = streamHarness(); assert.equal((await invalid.route.GET(invalid.request('bytes=100-'))).status, 416); assert.equal(invalid.requests.length, 0);
 const changed = streamHarness({ changed: true }); assert.equal((await changed.route.GET(changed.request('bytes=2-5'))).status, 400); assert.equal(changed.requests.length, 0);
 const bad = streamHarness({ badRange: true }); assert.equal((await bad.route.GET(bad.request('bytes=2-5'))).status, 400); assert.equal(bad.cancelled(), true);
});

function prepareHarness({ mismatch = false, badHeader = false } = {}) {
 const content = load('src/lib/chapter-content.ts');
 const narration = load('src/lib/narration-sync.ts', { './chapter-content': content });
 const chapterText = load('src/lib/chapter-narration.ts');
 const matching = load('src/lib/drive-audio.ts', { './chapter-narration': chapterText, './narration-sync': narration });
 const identity = 'c'.repeat(64), hash = 'a'.repeat(64), size = 48044;
 const record = { identity, chapterId: 'portable-chapter', title: 'Chapter 1', chapterIndex: 0, voice: 'af_bella', format: 'wav',
  audioFile: `chapters/${identity}.wav`, manifestFile: `chapters/${identity}.json`, bytes: size, sha256: hash };
 const catalog = { schema: 'ultimate-drive-audio', schemaVersion: 1, bookId: 'epub-' + 'd'.repeat(64), chapters: [], recordings: { [identity]: record } };
 const manifest = { identity, bookId: catalog.bookId, chapterId: record.chapterId, voice: 'af_bella', format: 'wav', model: 'kokoro-v1.0', sampleRate: 24000, bytes: size, sha256: hash,
  sync: { version: 1, title: 'Chapter 1', paragraphs: [mismatch ? 'Wrong prose.' : 'Actual prose.'], segments: [{ text: 'Chapter 1. Actual prose.', start: 0, end: 1 }] } };
 const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(size - 8, 4); header.write('WAVEfmt ', 8);
 header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24);
 header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(size - 44, 40);
 let probes = 0;
 const helpers = {
  driveChildren: async (token, parent) => parent === 'folder-id-123' ? [
   { id: 'catalog-file-id', name: 'book.json', mimeType: 'application/json' },
   { id: 'chapters-folder', name: 'chapters', mimeType: 'application/vnd.google-apps.folder' },
  ] : [
   { id: 'manifest-file-id', name: `${identity}.json`, mimeType: 'application/json' },
   { id: 'drive-audio-file-123', name: `${identity}.wav`, mimeType: 'audio/wav', size: String(size), version: '3', sha256Checksum: hash },
  ],
  oneDriveChild: (rows, name) => rows.find(row => row.name === name),
  driveMediaJson: async (token, file) => file === 'catalog-file-id' ? catalog : manifest,
  driveFetch: async () => { probes++; return new Response(badHeader ? Buffer.alloc(44) : header, { status: 206 }); },
  driveJson: async () => { throw Error('Unexpected token validation'); },
 };
 const route = load('src/app/api/drive/route.ts', {
  'next/headers': { cookies: async () => ({ get: () => ({ value: grant() }) }) },
  'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
  '@/lib/auth-server': { verifyAuth: async () => ({ user: { id: 'user' } }) }, '@/lib/drive-stream': crypto,
  '@/lib/prisma': { prisma: { chapter: { findUnique: async () => ({ id: '1'.repeat(24), bookId: '2'.repeat(24), title: 'Chapter 1', content: ['Actual prose.'] }), findMany: async () => [{ id: '1'.repeat(24) }] } } },
  '@/lib/chapter-content': content, '@/lib/chapter-narration': chapterText, '@/lib/drive-audio': matching, '@/lib/drive-api-server': helpers,
 });
 return { route, probes: () => probes, request: () => new Request(`https://app.example/api/drive?op=prepare&folderId=folder-id-123&chapterId=${'1'.repeat(24)}`) };
}
test('prepare matches actual chapter text and timings and probes WAV before issuing an opaque stream URL', async () => {
 const h = prepareHarness(); const response = await h.route.GET(h.request());
 assert.equal(response.status, 200); const data = await response.json();
 assert.equal(h.probes(), 1); assert.equal(data.checksumVerified, true);
 assert.ok(!data.url.includes(token));
 const value = new URL(data.url, 'https://app.example').searchParams.get('ticket');
 assert.equal(crypto.openDrive(value, 'stream', 'user').file, 'drive-audio-file-123');
});
test('prepare refuses wrong chapter text and invalid WAV; connection endpoint rejects foreign origins', async () => {
 const mismatch = prepareHarness({ mismatch: true }); assert.equal((await mismatch.route.GET(mismatch.request())).status, 400); assert.equal(mismatch.probes(), 0);
 const bad = prepareHarness({ badHeader: true }); assert.equal((await bad.route.GET(bad.request())).status, 400);
 assert.equal((await bad.route.POST(new Request('https://app.example/api/drive', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status, 403);
});
test('logging out clears the path-scoped encrypted Drive grant as well as app credentials', async () => {
 const calls = [];
 const route = load('src/app/api/auth/logout/route.ts', {
  'next/headers': { cookies: async () => ({ delete: name => calls.push(['delete', name]), set: (name, value, options) => calls.push(['set', name, value, options]) }) },
  'next/server': { NextResponse: { json: value => Response.json(value) } },
 });
 await route.POST();
 const cleared = calls.find(row => row[1] === 'ultimate-drive-session');
 assert.equal(cleared[2], ''); assert.equal(cleared[3].path, '/api/drive'); assert.equal(cleared[3].maxAge, 0);
});
