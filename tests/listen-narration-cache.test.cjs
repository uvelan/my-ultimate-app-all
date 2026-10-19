const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const identity = { userId: 'user-1', chapterId: 'chapter-1', title: 'Title', content: ['Text.'], provider: 'google', voice: 'en', grammarModel: 'OFF' };
const sync = { version: 1, title: 'Title', paragraphs: ['Corrected text.'], segments: [{ text: 'Title.', start: 0, end: 1 }, { text: 'Corrected text.', start: 1, end: 3 }] };
function setup({ unavailable = false } = {}) {
    const entries = new Map();
    const clock = { now: 1_800_000_000_000 };
    class ClockDate extends Date { static now() { return clock.now; } }
    const cache = {
        match: async request => entries.get(request.url)?.clone(),
        put: async (request, response) => { entries.set(request.url, response.clone()); },
        delete: async request => entries.delete(request.url),
        keys: async () => [...entries.keys()].map(key => new Request(key)),
    };
    const common = { crypto: webcrypto, caches: { open: async () => { if (unavailable) throw new Error('Storage denied'); return cache; } }, navigator: {}, location: { origin: 'https://listen.test' }, Date: ClockDate, Blob, Request, Response, Headers, Uint8Array, TextEncoder, console };
    const compile = file => {
        const filename = path.join(__dirname, '../src/lib', file);
        const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        const mod = { exports: {} };
        vm.runInNewContext(source, { ...common, module: mod, exports: mod.exports, require: name => name === './narration-sync' ? compile('narration-sync.ts') : require(name) }, { filename });
        return mod.exports;
    };
    return { ...compile('listen-narration-cache.ts'), entries, clock };
}
test('narration cache identity binds exact audio bytes and all playback settings', async () => {
    const cache = setup();
    const audio = new Blob(['audio bytes'], { type: 'audio/mpeg' });
    const original = await cache.narrationCacheIdentity(identity, audio);
    for (const change of [{ userId: 'user-2' }, { chapterId: 'chapter-2' }, { title: 'New title' }, { content: ['New text.'] }, { provider: 'gemini' }, { voice: 'Kore' }, { grammarModel: 'correction-model' }]) {
        assert.notEqual((await cache.narrationCacheIdentity({ ...identity, ...change }, audio)).key, original.key);
    }
    assert.notEqual((await cache.narrationCacheIdentity(identity, new Blob(['other bytes']))).key, original.key);
    assert.equal(original.audioId, require('node:crypto').createHash('sha256').update('audio bytes').digest('hex'));
});
test('trusted binary audio hash uses same key as hashing the device blob', async () => {
    const cache = setup();
    const audio = new Blob(['same audio']);
    const computed = await cache.narrationCacheIdentity(identity, audio);
    const trusted = await cache.narrationCacheIdentity(identity, audio, computed.audioId);
    assert.equal(trusted.key, computed.key);
});
test('narration cache persists corrected spoken text separately from legacy null metadata', async () => {
    const cache = setup();
    await cache.writeNarrationCache('corrected', sync);
    await cache.writeNarrationCache('legacy', null);
    assert.equal((await cache.readNarrationCache('corrected')).sync.segments[1].text, 'Corrected text.');
    assert.equal((await cache.readNarrationCache('legacy')).sync, null);
    assert.equal(await cache.readNarrationCache('missing'), null);
    assert.equal((await cache.readNarrationCache('corrected')).sync.version, 1, 'reading does not consume the stored response');
});
test('narration cache isolates audio regeneration even for unchanged source content', async () => {
    const cache = setup();
    const oldAudio = await cache.narrationCacheIdentity(identity, new Blob(['old recording']));
    const newAudio = await cache.narrationCacheIdentity(identity, new Blob(['new recording']));
    await cache.writeNarrationCache(oldAudio.key, sync);
    assert.equal(await cache.readNarrationCache(newAudio.key), null);
});
test('narration cache bounds retention to five records and expires old timing', async () => {
    const cache = setup();
    for (let index = 0; index < 8; index++) { await cache.writeNarrationCache(String(index), sync); cache.clock.now++; }
    assert.equal(cache.entries.size, 5);
    assert.equal(await cache.readNarrationCache('0'), null);
    cache.clock.now += 8 * 24 * 60 * 60 * 1000;
    assert.equal(await cache.readNarrationCache('7'), null);
});
test('unavailable storage and invalid metadata remain safe cache misses', async () => {
    const denied = setup({ unavailable: true });
    await denied.writeNarrationCache('key', sync);
    assert.equal(await denied.readNarrationCache('key'), null);
    const cache = setup();
    await cache.writeNarrationCache('invalid', { ...sync, segments: [{ text: 'Bad', start: 5, end: 1 }] });
    assert.equal(await cache.readNarrationCache('invalid'), null);
    assert.equal(await cache.narrationCacheIdentity({ ...identity, userId: '' }, new Blob(['audio'])), null);
});
