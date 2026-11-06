import { bookService } from './book.service';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { cacheService } from '../lib/storage';
import { audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import { validNarrationSync, type NarrationSync } from '../lib/narration-sync';
import { kokoroNarration } from '../lib/kokoro-text';
import { cleanNarrationText } from '../lib/chapter-narration';
import type { NativeAudioFile } from './listen-audio.service';
import type { SyncConnection } from '../lib/sync-state';
export type { SyncConnection } from '../lib/sync-state';

interface Peer { id: string; name: string; host: string; port: number }
interface Artifact { key: string; userId: string; bookId: string; chapterId: string; chapterIndex: number; voice: string; chunkTarget: number; uri: string; bytes: number; sha256: string; sync: NarrationSync }
export interface SyncStatus { phase: string; message?: string; userId?: string; bookId?: string; voice?: string; chapterId?: string; chapterIndex?: number; rangeStart?: number; rangeEnd?: number; key?: string; progress?: number; setting?: string; downloadedBytes?: number; totalBytes?: number; batchTotal?: number; batchReady?: number; updatedAt?: number; retryAt?: number; retryAttempt?: number; connection?: SyncConnection }
export interface SyncSnapshot { paired: boolean; paused: boolean; status: SyncStatus; artifacts: Artifact[]; connection?: SyncConnection; cleanup?: { chapters?: number; bytes?: number; updatedAt?: number }; queue?: { key: string; chapterIndex: number; userId: string; bookId?: string; voice?: string; title?: string; state: string }[]; playback?: { userId: string; bookId: string; chapterId: string; chapterIndex: number; voice: string; uri: string; seconds: number; updated: number } }
interface Bridge {
    discover(): Promise<string>;
    pair(bundle: string, host: string, port: number): Promise<string>;
    snapshot(): Promise<string>;
    health(): Promise<string>;
    reconnect(host: string, automatic: boolean): Promise<string>;
    enqueue(batch: string, automatic: boolean): Promise<boolean>;
    pause(): Promise<boolean>;
    setAutomatic(enabled: boolean): Promise<boolean>;
    invalidateAudio(key: string): Promise<boolean>;
    addListener(name: string): void;
    removeListeners(count: number): void;
}
const bridge = NativeModules.LocalChapterSync as Bridge | undefined;
const emitter = bridge ? new NativeEventEmitter(bridge) : null;
const listeners = new Set<(status: SyncStatus) => void>();
let snapshot: SyncSnapshot = { paired: false, paused: true, status: { phase: 'idle' }, artifacts: [] };
let lastRead = 0;
let watching = false;
let preparingAutomatic = false;
let workRevision = 0;
let pausedAt = 0;
function runtime(): Bridge {
    if (!bridge || Platform.OS !== 'android') throw new Error('Install the latest Android APK to sync from your PC.');
    return bridge;
}
function notify(status: SyncStatus) { listeners.forEach(listener => listener(status)); }
function watch() {
    if (watching || !emitter) return;
    watching = true;
    emitter.addListener('LocalSync', (raw: string) => {
        try {
            const status = JSON.parse(raw) as SyncStatus;
            if (status.phase === 'connection-changed') { snapshot.connection = status.connection; notify(status); return; }
            if (status.updatedAt && status.updatedAt < pausedAt) return;
            if (snapshot.paused && snapshot.status.phase === 'paused' && ['queued', 'generating', 'downloading', 'batch-generating', 'batch-downloading', 'verifying', 'chapter-ready', 'complete'].includes(status.phase)) return;
            snapshot.status = status;
            if (status.phase === 'chapter-ready') void localSyncService.refresh().then(() => notify(status)).catch(() => notify(status));
            else notify(status);
        } catch { /* Ignore malformed native status events. */ }
    });
}
// Whole-chapter audio remains valid when JSON representation or passage size changes.
// Match actual spoken text, with account/book/chapter/voice isolation intact.
function compatibleArtifact(file: Artifact, identity: NativeAudioIdentity): boolean {
    if (file.userId !== identity.userId || file.bookId !== identity.bookId || file.chapterId !== identity.chapterId
        || file.voice !== identity.voice || !validNarrationSync(file.sync)) return false;
    if (file.key === audioIdentityKey(identity)) return true;
    try {
        const narration = kokoroNarration(identity.content, identity.title, identity.chunkTarget);
        return cleanNarrationText(file.sync.title) === cleanNarrationText(narration.title)
            && cleanNarrationText(file.sync.paragraphs.join(' ')) === cleanNarrationText(narration.paragraphs.join(' '));
    } catch { return false; }
}
export const localSyncService = {
    settings() {
        const rawCount = Number(cacheService.get('pc-sync-count') || 5);
        return { enabled: cacheService.get('pc-sync-enabled') === 'true', automatic: cacheService.get('pc-sync-auto') !== 'false',
            count: Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= 50 ? rawCount : 5,
            start: cacheService.get('pc-sync-start') === 'continue' ? 'continue' as const : 'current' as const,
            phoneFallback: cacheService.get('pc-sync-phone-fallback') === 'true' };
    },
    setSetting(name: 'enabled' | 'automatic' | 'count' | 'start' | 'phoneFallback', value: string | number | boolean) {
        const keys = { enabled: 'pc-sync-enabled', automatic: 'pc-sync-auto', count: 'pc-sync-count', start: 'pc-sync-start', phoneFallback: 'pc-sync-phone-fallback' };
        cacheService.set(keys[name], value);
        if (name === 'automatic') void bridge?.setAutomatic(value === true).catch(() => {});
        notify({ phase: 'settings-changed', setting: name });
    },
    subscribe(listener: (status: SyncStatus) => void) { watch(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh(): Promise<SyncSnapshot> {
        watch(); if (!bridge) return snapshot;
        const revision = workRevision;
        const result = JSON.parse(await bridge.snapshot());
        if (revision !== workRevision) return snapshot;
        if (!Array.isArray(result.artifacts)) throw new Error('Invalid local sync state');
        // Earlier APKs removed completed job payloads without retaining book/voice
        // metadata. Recover those scopes from the verified artifact index on upgrade.
        for (const entry of result.queue || []) {
            const artifact = result.artifacts.find((file: Artifact) => file.key === entry.key && file.userId === entry.userId);
            if (artifact) { entry.bookId ||= artifact.bookId; entry.voice ||= artifact.voice; }
        }
        if (result.status && !result.status.bookId) {
            const matches = result.artifacts.filter((file: Artifact) => result.status.key ? file.key === result.status.key
                : result.status.chapterId && file.chapterId === result.status.chapterId);
            if (matches.length === 1) {
                const artifact = matches[0];
                result.status = { ...result.status, userId: artifact.userId, bookId: artifact.bookId, voice: artifact.voice };
            }
        }
        snapshot = result; lastRead = Date.now(); return snapshot;
    },
    discover: async (): Promise<Peer[]> => JSON.parse(await runtime().discover()),
    async pair(code: string, host: string, port = 8766) {
        await runtime().pair(code.trim(), host.trim(), port);
        localSyncService.setSetting('enabled', true); return localSyncService.refresh();
    },
    health: async () => JSON.parse(await runtime().health()),
    preparationRevision: () => workRevision,
    isPreparationCurrent: (revision: number) => revision === workRevision,
    async reconnect(host = '') {
        const revision = workRevision;
        const result = JSON.parse(await runtime().reconnect(host.trim(), localSyncService.settings().automatic));
        if (revision !== workRevision) return result;
        await localSyncService.refresh(); notify(snapshot.status); return result;
    },
    async enqueue(entries: unknown[], automatic: boolean, revision = workRevision) {
        if (!entries.length || revision !== workRevision) return;
        snapshot.paused = false;
        watch(); const started = await runtime().enqueue(JSON.stringify(entries), automatic);
        if (revision === workRevision) {
            if (started) notify({ phase: 'queued' });
            else { await localSyncService.refresh(); if (revision === workRevision) notify(snapshot.status); }
        }
    },
    async pause() {
        ++workRevision;
        pausedAt = Date.now();
        // Cancel preparation before yielding to native work. A late text fetch must
        // never enqueue a batch and implicitly resume the just-paused transfer.
        localSyncService.setSetting('automatic', false);
        snapshot.paused = true; snapshot.status = { ...snapshot.status, phase: 'paused', retryAt: 0 };
        notify(snapshot.status);
        await runtime().pause();
        await localSyncService.refresh();
    },
    async cachedChapterIds(userId: string, bookId: string, voice: string): Promise<string[]> {
        const current = await localSyncService.refresh();
        const candidates = current.artifacts.filter(file => file.userId === userId && file.bookId === bookId
            && file.voice === voice && validNarrationSync(file.sync));
        const checked = await Promise.all(candidates.map(async file => {
            try {
                const info = await FileSystem.getInfoAsync(file.uri);
                return info.exists && info.size === file.bytes ? file.chapterId : null;
            } catch { return null; }
        }));
        return [...new Set(checked.filter((id): id is string => id !== null))];
    },
    async get(identity: NativeAudioIdentity): Promise<NativeAudioFile | null> {
        if (!bridge || identity.provider !== 'kokoro' || identity.grammarModel !== 'OFF') return null;
        if (Date.now() - lastRead > 2000) await localSyncService.refresh();
        const key = audioIdentityKey(identity);
        const candidates = snapshot.artifacts.filter(file => compatibleArtifact(file, identity));
        const exact = candidates.find(file => file.key === key);
        const preferred = exact ? [exact, ...candidates.filter(file => file !== exact).reverse()] : candidates.reverse();
        for (const artifact of preferred) {
            try {
                const info = await FileSystem.getInfoAsync(artifact.uri);
                if (!info.exists || info.size !== artifact.bytes) continue;
                return { key, requestKey: key, uri: artifact.uri, bytes: artifact.bytes, chapterId: identity.chapterId,
                    created: Date.now(), used: Date.now(), provider: 'kokoro', voice: identity.voice, fallback: '',
                    contentType: 'audio/wav', source: 'device', sync: artifact.sync };
            } catch { /* Try another compatible saved file. */ }
        }
        return null;
    },
    async prepareAhead(book: { id: string; chapters: { id: string; title: string; content?: unknown }[] }, userId: string, chapterIndex: number,
        requestedVoice: string, chunkTarget: number, isCurrent: () => boolean = () => true, playingUri?: string, afterEnd = false) {
        const revision = workRevision;
        const allowed = () => revision === workRevision && isCurrent() && localSyncService.settings().enabled && localSyncService.settings().automatic;
        if (preparingAutomatic || !userId || !allowed()) return;
        preparingAutomatic = true;
        try {
            const current = await localSyncService.refresh();
            if (!current.paired || !allowed()) return;
            const voice = requestedVoice; // A pending voice handoff applies to upcoming chapters.
            const count = localSyncService.settings().count, entries = [];
            const batchId = 'auto-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            const start = chapterIndex + (afterEnd ? 1 : 0);
            for (let index = start; index < Math.min(book.chapters.length, start + count); index++) {
                if (!allowed()) return;
                if (current.queue?.some(item => item.userId === userId && item.bookId === book.id && item.voice === voice && item.chapterIndex === index && item.state !== 'complete')) continue;
                const chapter = book.chapters[index];
                const loaded = chapter.content === undefined ? await bookService.getChapterContent(book.id, String(index)) : chapter;
                if (!allowed()) return;
                if (loaded.id !== chapter.id || loaded.content === undefined) throw new Error('Chapter list changed during automatic sync');
                const identity: NativeAudioIdentity = { userId, bookId: book.id, chapterId: chapter.id, title: chapter.title,
                    content: loaded.content, provider: 'kokoro', voice, grammarModel: 'OFF', chunkTarget };
                if (await localSyncService.get(identity)) continue;
                const narration = kokoroNarration(loaded.content, chapter.title, chunkTarget), requestKey = audioIdentityKey(identity);
                entries.push({ requestKey, userId, chapterIndex: index, chunkTarget, playbackIndex: chapterIndex, playbackRevision: Date.now(),
                    rangeStart: start, rangeEnd: Math.min(book.chapters.length, start + count),
                    batchId: index - chapterIndex >= 4 ? batchId : '',
                    payload: { requestKey, chapterId: chapter.id, bookId: book.id, title: chapter.title, voice, chunks: narration.chunks, paragraphs: narration.paragraphs } });
            }
            if (entries.length && allowed()) await localSyncService.enqueue(entries, true, revision);
        } finally { preparingAutomatic = false; }
    },
    async lastSynced(userId: string, bookId: string, voice: string, chunkTarget: number) {
        await localSyncService.refresh();
        return Math.max(-1, ...snapshot.artifacts.filter(file => file.userId === userId && file.bookId === bookId && file.voice === voice && file.chunkTarget === chunkTarget).map(file => file.chapterIndex));
    },
    async invalidate(identity: NativeAudioIdentity) {
        if (!bridge) return;
        await localSyncService.refresh();
        const keys = new Set([audioIdentityKey(identity), ...snapshot.artifacts.filter(file => compatibleArtifact(file, identity)).map(file => file.key)]);
        for (const key of keys) await bridge.invalidateAudio(key);
        lastRead = 0;
    },
    waitingError() { return Object.assign(new Error('Waiting for PC sync. Open Chapter Sync to prepare this chapter.'), { code: 'LOCAL_SYNC_PENDING' }); },
};
