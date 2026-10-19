import * as FileSystem from 'expo-file-system/legacy';
import { api } from '../lib/api-client';
import { cacheService } from '../lib/storage';
import { actualAudioSelection, assertAudioActive, audioIdentityKey, bytesToBase64, retryNativeAudio, NativeAudioIdentity } from '../lib/listen-audio';
import { validNarrationSync, NarrationSync } from '../lib/narration-sync';

const DIRECTORY = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}listen-audio-v3/`;
const INDEX = 'listen-audio-files-v3';
const AGE = 7 * 24 * 60 * 60 * 1000;
const BUDGET = 100 * 1024 * 1024;
export interface NativeAudioFile {
    key: string; requestKey: string; uri: string; bytes: number; created: number; used: number;
    provider: NativeAudioIdentity['provider']; voice: string; fallback: string; chapterId: string;
    contentType: string; source: 'device' | 'database' | 'generated';
    audioId?: string; sync?: NarrationSync | null;
}
let queue: Promise<unknown> = Promise.resolve();
let allowed = new Set<string>();
let protectedIds = new Set<string>();
const evictionListeners = new Set<(uri: string) => void>();
const syncListeners = new Set<(file: NativeAudioFile) => void>();
const syncing = new Set<string>();
function locked<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation); queue = result.catch(() => {}); return result;
}
function readIndex(): NativeAudioFile[] { try { return cacheService.getObject<NativeAudioFile[]>(INDEX) || []; } catch { return []; } }
async function remove(entry: NativeAudioFile) {
    await FileSystem.deleteAsync(entry.uri, { idempotent: true }).catch(() => {});
    evictionListeners.forEach(listener => listener(entry.uri));
}
function hydrateSync(file: NativeAudioFile, identity: NativeAudioIdentity, signal: AbortSignal): void {
    // Legacy files lack a byte fingerprint, so new server metadata cannot safely
    // describe them. Optional timing requests must never gate audio playback.
    if (!file.audioId || file.sync !== undefined || signal.aborted || syncing.has(file.uri)) return;
    syncing.add(file.uri);
    void (async () => {
    try {
        const response = await api.get('/tts', { params: { chapterId: identity.chapterId, provider: identity.provider,
            voice: identity.voice, grammarModel: identity.grammarModel, sync: '1' }, signal, timeout: 8000 });
        assertAudioActive(signal);
        if (response.data?.audioId !== file.audioId || !validNarrationSync(response.data?.sync)) return;
        await locked(async () => {
            if (signal.aborted) return;
            const entries = readIndex();
            const entry = entries.find(item => item.uri === file.uri && item.audioId === file.audioId);
            if (!entry || (!allowed.has(entry.key) && !allowed.has(entry.requestKey))) return;
            entry.sync = response.data.sync;
            file.sync = entry.sync;
            cacheService.setObject(INDEX, entries);
            syncListeners.forEach(listener => listener({ ...entry }));
        });
    } catch { /* Optional metadata never makes a playable file fail. */ }
    finally { syncing.delete(file.uri); }
    })();
}
export const listenAudioService = {
    subscribeSync: (listener: (file: NativeAudioFile) => void) => {
        syncListeners.add(listener);
        return () => { syncListeners.delete(listener); };
    },
    subscribeEvictions: (listener: (uri: string) => void) => {
        evictionListeners.add(listener);
        return () => { evictionListeners.delete(listener); };
    },
    retain: (identities: NativeAudioIdentity[], currentId: string, nextId?: string) => locked(async () => {
        allowed = new Set(identities.slice(0, 5).map(audioIdentityKey));
        protectedIds = new Set([currentId, nextId || '']);
        const kept: NativeAudioFile[] = [];
        for (const entry of readIndex()) {
            if ((!allowed.has(entry.key) && !allowed.has(entry.requestKey)) || Date.now() - entry.created >= AGE) await remove(entry);
            else kept.push(entry);
        }
        cacheService.setObject(INDEX, kept);
    }),
    get: (identity: NativeAudioIdentity) => locked(async (): Promise<NativeAudioFile | null> => {
        const key = audioIdentityKey(identity);
        const entries = readIndex();
        const entry = entries.find(item => item.key === key || item.requestKey === key);
        if (!entry || Date.now() - entry.created >= AGE) return null;
        const info = await FileSystem.getInfoAsync(entry.uri);
        if (!info.exists || info.size !== entry.bytes) return null;
        entry.used = Date.now(); cacheService.setObject(INDEX, entries);
        return { ...entry, source: 'device' };
    }),
    activate: (chapterId: string, windowStart: string, signal: AbortSignal) => retryNativeAudio(async () => {
        await api.get('/tts', { params: { chapterId, windowStart, windowOnly: '1' }, signal });
    }, signal),
    load: async (identity: NativeAudioIdentity, windowStart: () => string, signal: AbortSignal, prefetch = false, bypass = false): Promise<NativeAudioFile> => {
        if (!bypass) {
            const cached = await listenAudioService.get(identity);
            assertAudioActive(signal);
            if (cached) {
                hydrateSync(cached, { ...identity, provider: cached.provider, voice: cached.voice }, signal);
                return cached;
            }
        }
        const response = await retryNativeAudio(async attempt => {
            const response = await api.get('/tts', { params: { chapterId: identity.chapterId, provider: identity.provider,
                voice: identity.voice, grammarModel: identity.grammarModel, windowStart: windowStart(),
                ...(prefetch ? { prefetch: '1' } : {}), ...(bypass && attempt === 0 ? { bypassCache: '1' } : {}) },
                responseType: 'arraybuffer', signal, timeout: 300000 });
            const length = Number(response.headers['content-length']);
            const bytes = new Uint8Array(response.data);
            if (!bytes.length || (Number.isFinite(length) && length > 0 && bytes.length !== length)) throw new Error('Incomplete audio download');
            return response;
        }, signal);
        assertAudioActive(signal);
        const selection = actualAudioSelection(response.headers as Record<string, unknown>, identity);
        const actualKey = audioIdentityKey({ ...identity, provider: selection.provider, voice: selection.voice });
        const audioId = typeof response.headers['x-tts-audio-id'] === 'string' ? response.headers['x-tts-audio-id'] : undefined;
        const contentType = String(response.headers['content-type'] || 'audio/mpeg');
        if (!contentType.startsWith('audio/')) throw new Error('The server did not return playable audio.');
        const bytes = new Uint8Array(response.data);
        await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
        const uri = `${DIRECTORY}${actualKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${contentType.includes('wav') ? 'wav' : 'mp3'}`;
        try { await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 }); }
        catch (error) { await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); throw error; }
        const entry: NativeAudioFile = { key: actualKey, requestKey: audioIdentityKey(identity), uri, bytes: bytes.length,
            chapterId: identity.chapterId, created: Date.now(), used: Date.now(), contentType, audioId, ...selection,
            source: response.headers['x-tts-cache'] === 'database' ? 'database' : 'generated' };
        const saved = await locked(async () => {
            if (signal.aborted || (!allowed.has(entry.key) && !allowed.has(entry.requestKey))) {
                await remove(entry); assertAudioActive(signal); throw new Error('Audio selection changed.');
            }
            const previous = readIndex();
            for (const existing of previous) {
                if (existing.key === entry.key || existing.requestKey === entry.requestKey) await remove(existing);
            }
            let entries = previous.filter(item => item.key !== entry.key && item.requestKey !== entry.requestKey);
            entries.push(entry);
            let total = entries.reduce((sum, item) => sum + item.bytes, 0);
            for (const candidate of [...entries].sort((a, b) => a.used - b.used)) {
                if (entries.length <= 5 && total <= BUDGET) break;
                if (protectedIds.has(candidate.chapterId)) continue;
                await remove(candidate); entries = entries.filter(item => item !== candidate); total -= candidate.bytes;
            }
            cacheService.setObject(INDEX, entries);
            if (!entries.includes(entry)) throw new Error('Ahead audio will load when it enters the device cache budget.');
            return entry;
        });
        hydrateSync(saved, { ...identity, provider: selection.provider, voice: selection.voice }, signal);
        return saved;
    },
};
