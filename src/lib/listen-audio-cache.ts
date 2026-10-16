// Browser-only, best-effort cache. Audio stays on this device, isolated by user
// and narration settings. Bump the version if the speech/cleaning pipeline changes.
const CACHE_NAME = 'listen-audio-v1';
const WINDOW_CACHE_NAME = 'listen-audio-window-v1';
const MAX_CHAPTERS = 2;
let activeWindow: Set<string> | null = null;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AudioCacheIdentity {
    userId: string;
    chapterId: string;
    content: unknown;
    provider: string;
    voice: string;
    grammarModel: string;
}

async function cacheRequest(identity: AudioCacheIdentity): Promise<Request | null> {
    if (!identity.userId || !globalThis.caches || !globalThis.crypto?.subtle) return null;
    const input = JSON.stringify(['v1', identity.userId, identity.chapterId, identity.content,
        identity.provider, identity.voice, identity.grammarModel]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return new Request(globalThis.location.origin + '/__listen_audio_cache__/' + hash);
}

async function retainedWindow(): Promise<Set<string> | null> {
    const metadata = await caches.open(WINDOW_CACHE_NAME);
    const response = await metadata.match(new Request(location.origin + '/__listen_audio_cache__/active-window'));
    if (!response) return activeWindow;
    const urls: unknown = await response.json();
    return Array.isArray(urls) ? new Set(urls.filter((url): url is string => typeof url === 'string').slice(0, MAX_CHAPTERS)) : activeWindow;
}

function validEntry(response: Response, now: number): boolean {
    const created = Number(response.headers.get('X-Audio-Created-At'));
    const size = Number(response.headers.get('X-Audio-Bytes'));
    return created > 0 && created <= now && now - created < MAX_AGE_MS && size > 0 && size <= MAX_BYTES;
}

async function readCachedChapterAudio(identity: AudioCacheIdentity): Promise<Blob | null> {
    try {
        const request = await cacheRequest(identity);
        if (!request) return null;
        const allowed = await retainedWindow();
        if (allowed && !allowed.has(request.url)) return null;
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(request);
        if (!response) return null;
        const now = Date.now();
        if (!validEntry(response, now)) {
            await cache.delete(request);
            return null;
        }
        const audio = await response.blob();
        if (!audio.size || !audio.type.startsWith('audio/')) {
            await cache.delete(request);
            return null;
        }
        // Refresh only the access time, retaining the original expiry.
        const headers = new Headers(response.headers);
        headers.set('X-Audio-Last-Used', String(now));
        await cache.put(request, new Response(audio, { headers })).catch(() => {});
        return audio;
    } catch {
        // Private mode, storage eviction, and unavailable browser APIs must never block listening.
        return null;
    }
}

async function storeChapterAudio(identity: AudioCacheIdentity, audio: Blob): Promise<void> {
    try {
        if (!audio.size || audio.size > MAX_BYTES || !audio.type.startsWith('audio/')) return;
        const request = await cacheRequest(identity);
        if (!request) return;
        const allowed = await retainedWindow();
        if (allowed && !allowed.has(request.url)) return;
        const cache = await caches.open(CACHE_NAME);
        const now = Date.now();
        const entries: { request: Request; bytes: number; lastUsed: number }[] = [];
        let total = 0;
        for (const existingRequest of await cache.keys()) {
            const response = await cache.match(existingRequest);
            if (!response) continue;
            if (existingRequest.url === request.url || !validEntry(response, now) || (allowed && !allowed.has(existingRequest.url))) {
                await cache.delete(existingRequest);
                continue;
            }
            const bytes = Number(response.headers.get('X-Audio-Bytes'));
            entries.push({ request: existingRequest, bytes,
                lastUsed: Number(response.headers.get('X-Audio-Last-Used')) || 0 });
            total += bytes;
        }
        entries.sort((a, b) => a.lastUsed - b.lastUsed);
        let count = entries.length;
        for (const entry of entries) {
            if (total + audio.size <= MAX_BYTES && count < MAX_CHAPTERS) break;
            await cache.delete(entry.request);
            total -= entry.bytes;
            count -= 1;
        }
        await cache.put(request, new Response(audio, { headers: {
            'Content-Type': audio.type,
            'X-Audio-Created-At': String(now),
            'X-Audio-Last-Used': String(now),
            'X-Audio-Bytes': String(audio.size),
        } }));
    } catch {
        // Quota exhaustion leaves audio playable; future visits can regenerate it.
    }
}

// Serialize writes and access-time updates. Web Locks also coordinate multiple
// tabs where supported, so they do not race past the storage budget.
let cacheQueue: Promise<unknown> = Promise.resolve();
function withCacheLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
        if (globalThis.navigator?.locks) return await navigator.locks.request(CACHE_NAME, operation);
        return await operation();
    };
    const result = cacheQueue.then(run, run);
    cacheQueue = result.then(() => undefined, () => undefined);
    return result;
}

export async function getCachedChapterAudio(identity: AudioCacheIdentity): Promise<Blob | null> {
    try { return await withCacheLock(() => readCachedChapterAudio(identity)); } catch { return null; }
}

export async function cacheChapterAudio(identity: AudioCacheIdentity, audio: Blob): Promise<void> {
    try { await withCacheLock(() => storeChapterAudio(identity, audio)); } catch { /* Best effort. */ }
}

// One active playback window per browser origin. Persisting the whitelist also
// rejects a late prefetch write from an older chapter or another open tab.
export async function retainChapterAudioWindow(identities: AudioCacheIdentity[]): Promise<void> {
    try {
        await withCacheLock(async () => {
            if (!globalThis.caches) return;
            const requests = await Promise.all(identities.slice(0, MAX_CHAPTERS).map(cacheRequest));
            const allowed = requests.filter((request): request is Request => request !== null).map(request => request.url);
            activeWindow = new Set(allowed);
            const metadata = await caches.open(WINDOW_CACHE_NAME);
            await metadata.put(new Request(location.origin + '/__listen_audio_cache__/active-window'),
                new Response(JSON.stringify(allowed), { headers: { 'Content-Type': 'application/json' } }));
            const cache = await caches.open(CACHE_NAME);
            for (const request of await cache.keys()) {
                if (!activeWindow.has(request.url)) await cache.delete(request);
            }
        });
    } catch { /* Storage is optional; the player still keeps only its two active tasks. */ }
}
