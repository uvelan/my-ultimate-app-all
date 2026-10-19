import type { AudioCacheIdentity } from './listen-audio-cache';
import { validNarrationSync, type NarrationSync } from './narration-sync';

const CACHE_NAME = 'listen-narration-v1';
const MAX_ENTRIES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Bind transcript timing to both the full playback identity and exact audio bytes. */
export async function narrationCacheIdentity(identity: AudioCacheIdentity, audio: Blob, knownAudioId?: string): Promise<{ key: string; audioId: string } | null> {
    try {
        if (!identity.userId || !globalThis.crypto?.subtle) return null;
        const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
        const audioId = knownAudioId && /^[a-f\d]{64}$/.test(knownAudioId) ? knownAudioId
            : hex(await crypto.subtle.digest('SHA-256', await audio.arrayBuffer()));
        const input = JSON.stringify(['v1', identity.userId, identity.chapterId, identity.title, identity.content,
            identity.provider, identity.voice, identity.grammarModel, audioId]);
        const key = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
        return { key, audioId };
    } catch { return null; }
}
const requestFor = (key: string) => new Request(location.origin + '/__listen_narration_cache__/' + key);
function validEntry(response: Response): boolean {
    const created = Number(response.headers.get('X-Narration-Created'));
    const size = Number(response.headers.get('X-Narration-Bytes'));
    return created > 0 && created <= Date.now() && Date.now() - created < MAX_AGE && size > 0 && size <= MAX_ENTRY_BYTES;
}
export async function readNarrationCache(key: string): Promise<{ sync: NarrationSync | null } | null> {
    try {
        if (!globalThis.caches) return null;
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(requestFor(key));
        if (!response) return null;
        if (!validEntry(response)) { await cache.delete(requestFor(key)); return null; }
        const value = await response.json();
        if (!value || !Object.prototype.hasOwnProperty.call(value, 'sync') || value.sync !== null && !validNarrationSync(value.sync)) {
            await cache.delete(requestFor(key)); return null;
        }
        return value;
    } catch { return null; }
}
let writes: Promise<void> = Promise.resolve();
export async function writeNarrationCache(key: string, sync: NarrationSync | null): Promise<void> {
    const write = async () => {
        try {
            if (!globalThis.caches || sync !== null && !validNarrationSync(sync)) return;
            const body = JSON.stringify({ sync });
            const size = new TextEncoder().encode(body).byteLength;
            if (size > MAX_ENTRY_BYTES) return;
            const cache = await caches.open(CACHE_NAME);
            const request = requestFor(key);
            const entries: { request: Request; bytes: number; created: number }[] = [];
            for (const existing of await cache.keys()) {
                const response = await cache.match(existing);
                if (!response) continue;
                if (existing.url === request.url || !validEntry(response)) { await cache.delete(existing); continue; }
                entries.push({ request: existing, bytes: Number(response.headers.get('X-Narration-Bytes')), created: Number(response.headers.get('X-Narration-Created')) });
            }
            entries.sort((a, b) => a.created - b.created);
            let bytes = entries.reduce((total, entry) => total + entry.bytes, 0);
            while (entries.length >= MAX_ENTRIES || bytes + size > MAX_BYTES) {
                const oldest = entries.shift();
                if (!oldest) break;
                await cache.delete(oldest.request); bytes -= oldest.bytes;
            }
            await cache.put(request, new Response(body, { headers: { 'Content-Type': 'application/json',
                'X-Narration-Created': String(Date.now()), 'X-Narration-Bytes': String(size) } }));
        } catch { /* Storage failure must never block audio. */ }
    };
    const run = async (): Promise<void> => {
        if (globalThis.navigator?.locks) await navigator.locks.request(CACHE_NAME, write);
        else await write();
    };
    const pending = writes.then(run, run);
    writes = pending.then(() => undefined, () => undefined);
    await writes;
}
