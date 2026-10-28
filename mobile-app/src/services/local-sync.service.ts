import { bookService } from './book.service';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { cacheService } from '../lib/storage';
import { audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import { validNarrationSync, type NarrationSync } from '../lib/narration-sync';
import { kokoroNarration } from '../lib/kokoro-text';
import { cleanNarrationText } from '../lib/chapter-narration';
import type { NativeAudioFile } from './listen-audio.service';

interface Peer { id: string; name: string; host: string; port: number }
interface Artifact { key: string; userId: string; bookId: string; chapterId: string; chapterIndex: number; voice: string; chunkTarget: number; uri: string; bytes: number; sha256: string; sync: NarrationSync }
export interface SyncStatus { phase: string; message?: string; chapterId?: string; chapterIndex?: number; key?: string; progress?: number; setting?: string; downloadedBytes?: number; totalBytes?: number; batchTotal?: number; batchReady?: number }
export interface SyncSnapshot { paired: boolean; paused: boolean; status: SyncStatus; artifacts: Artifact[]; queue?: { key: string; chapterIndex: number; userId: string; state: string }[]; playback?: { userId: string; bookId: string; chapterId: string; chapterIndex: number; voice: string; uri: string; seconds: number; updated: number } }
interface Bridge {
    discover(): Promise<string>;
    pair(bundle: string, host: string, port: number): Promise<string>;
    snapshot(): Promise<string>;
    health(): Promise<string>;
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
        const result = JSON.parse(await bridge.snapshot());
        if (!Array.isArray(result.artifacts)) throw new Error('Invalid local sync state');
        snapshot = result; lastRead = Date.now(); return snapshot;
    },
    discover: async (): Promise<Peer[]> => JSON.parse(await runtime().discover()),
    async pair(code: string, host: string, port = 8766) {
        await runtime().pair(code.trim(), host.trim(), port);
        localSyncService.setSetting('enabled', true); return localSyncService.refresh();
    },
    health: async () => JSON.parse(await runtime().health()),
    async enqueue(entries: unknown[], automatic: boolean) {
        if (!entries.length) return;
        watch(); await runtime().enqueue(JSON.stringify(entries), automatic); notify({ phase: 'queued' });
    },
    async pause() { await runtime().pause(); localSyncService.setSetting('automatic', false); await localSyncService.refresh(); notify({ phase: 'paused' }); },
    async get(identity: NativeAudioIdentity): Promise<NativeAudioFile | null> {
        if (!bridge || identity.provider !== 'kokoro' || identity.grammarModel !== 'OFF') return null;
        if (Date.now() - lastRead > 2000) await localSyncService.refresh();
        const key = audioIdentityKey(identity);
        const candidates = snapshot.artifacts.filter(file => compatibleArtifact(file, identity));
        const artifact = candidates.find(file => file.key === key) || candidates.at(-1);
        if (!artifact || !validNarrationSync(artifact.sync)) return null;
        const info = await FileSystem.getInfoAsync(artifact.uri);
        if (!info.exists || info.size !== artifact.bytes) return null;
        return { key, requestKey: key, uri: artifact.uri, bytes: artifact.bytes, chapterId: identity.chapterId,
            created: Date.now(), used: Date.now(), provider: 'kokoro', voice: identity.voice, fallback: '', contentType: 'audio/wav', source: 'device', sync: artifact.sync };
    },
    async prepareAhead(book: { id: string; chapters: { id: string; title: string; content?: unknown }[] }, userId: string, chapterIndex: number,
        requestedVoice: string, chunkTarget: number, isCurrent: () => boolean = () => true, playingUri?: string, afterEnd = false) {
        const allowed = () => isCurrent() && localSyncService.settings().enabled && localSyncService.settings().automatic;
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
                const chapter = book.chapters[index];
                const loaded = chapter.content === undefined ? await bookService.getChapterContent(book.id, String(index)) : chapter;
                if (!allowed()) return;
                if (loaded.id !== chapter.id || loaded.content === undefined) throw new Error('Chapter list changed during automatic sync');
                const identity: NativeAudioIdentity = { userId, bookId: book.id, chapterId: chapter.id, title: chapter.title,
                    content: loaded.content, provider: 'kokoro', voice, grammarModel: 'OFF', chunkTarget };
                if (await localSyncService.get(identity)) continue;
                const narration = kokoroNarration(loaded.content, chapter.title, chunkTarget), requestKey = audioIdentityKey(identity);
                entries.push({ requestKey, userId, chapterIndex: index, chunkTarget, playbackIndex: chapterIndex, playbackRevision: Date.now(),
                    batchId: index - chapterIndex >= 4 ? batchId : '',
                    payload: { requestKey, chapterId: chapter.id, bookId: book.id, title: chapter.title, voice, chunks: narration.chunks, paragraphs: narration.paragraphs } });
            }
            if (entries.length && allowed()) await localSyncService.enqueue(entries, true);
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
    waitingError() { return Object.assign(new Error('Waiting for PC sync. Tap Sync from PC to prepare this chapter.'), { code: 'LOCAL_SYNC_PENDING' }); },
};
