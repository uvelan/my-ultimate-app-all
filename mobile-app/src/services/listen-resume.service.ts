import * as FileSystem from 'expo-file-system/legacy';
import { cacheService } from '../lib/storage';
import { audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import type { NarrationSync } from '../lib/narration-sync';
import type { NativeAudioFile } from './listen-audio.service';
import type { KokoroChunk } from './kokoro.service';
const INDEX = 'listen-resume-v1';
interface Bookmark {
    version: 1; userId: string; bookId: string; chapterId: string; fingerprint: string;
    provider: string; voice: string; grammarModel: string; chunkTarget: number;
    texts: string[]; pieces: KokoroChunk[]; sourceUris?: string[]; sync?: NarrationSync; file?: NativeAudioFile; updated: number;
}
export interface ListenBookmark extends Bookmark { position: number; index: number }
function fingerprint(identity: NativeAudioIdentity) {
    return audioIdentityKey({ ...identity, voice: identity.provider === 'kokoro' ? 'af_heart' : identity.voice, chunkTarget: 1000 });
}
function records(): Bookmark[] { try { const value = cacheService.getObject<Bookmark[]>(INDEX); return Array.isArray(value) ? value.filter(record => record?.version === 1 && typeof record.fingerprint === 'string' && Array.isArray(record.pieces) && Array.isArray(record.texts) && record.pieces.every(piece => piece && typeof piece.uri === 'string' && Number.isInteger(piece.index) && Number.isFinite(piece.bytes))) : []; } catch { return []; } }
function matches(record: Bookmark, identity: NativeAudioIdentity) { return record.userId === identity.userId && record.bookId === identity.bookId && record.fingerprint === fingerprint(identity); }
function uris(record: Bookmark) { return [...record.pieces.map(piece => piece.uri), ...(record.file ? [record.file.uri] : []), ...(record.sourceUris || [])]; }
function cursorKey(record: Bookmark) { return 'listen-resume-position-' + record.fingerprint; }
const lastWrites = new Map<string, number>();
let pruned = false;
async function pruneOrphans() {
    if (pruned || !FileSystem.documentDirectory || typeof FileSystem.readDirectoryAsync !== 'function') return;
    pruned = true;
    const directory = FileSystem.documentDirectory + 'listen-audio-parts/';
    try {
        const pinned = new Set([...records().flatMap(uris), ...(cacheService.getObject<NativeAudioFile[]>('listen-audio-files-v3') || []).map(file => file.uri)].map(uri => uri.split('/').pop()));
        for (const name of await FileSystem.readDirectoryAsync(directory)) {
            if (!/^kokoro-[a-zA-Z0-9-]+\.wav$/.test(name) || pinned.has(name)) continue;
            const uri = directory + name, info = await FileSystem.getInfoAsync(uri);
            if (info.exists && !info.isDirectory && info.modificationTime && Date.now() / 1000 - info.modificationTime > 86400)
                await FileSystem.deleteAsync(uri, { idempotent: true });
        }
    } catch { /* Optional housekeeping never blocks resume. */ }
}
function publish(record: Bookmark, previous: Bookmark[]) {
    const dropped = previous.filter(entry => entry.userId === record.userId && entry.bookId === record.bookId);
    const entries = [record];
    const size = (entry: Bookmark) => entry.pieces.reduce((sum, piece) => sum + piece.bytes, 0) + (entry.file?.bytes || 0);
    let bytes = size(record);
    for (const candidate of previous.filter(entry => !dropped.includes(entry)).sort((a, b) => b.updated - a.updated)) {
        if (entries.length >= 5 || bytes + size(candidate) > 200 * 1024 * 1024) continue;
        entries.push(candidate); bytes += size(candidate);
    }
    cacheService.setObject(INDEX, entries);
    const removed = [...previous.flatMap(uris)].filter(uri => !entries.some(entry => uris(entry).includes(uri)));
    for (const uri of removed) {
        if (uri.includes('/local-pc-audio/')) continue; // The chapter-sync library owns these files.
        if (!listenResumeService.isPinned(uri) && !(cacheService.getObject<NativeAudioFile[]>('listen-audio-files-v3') || []).some(file => file.uri === uri))
            void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
    for (const old of previous) if (!entries.some(entry => entry.fingerprint === old.fingerprint)) cacheService.delete(cursorKey(old));
}
function base(identity: NativeAudioIdentity, texts: string[], previous: Bookmark[]): Bookmark {
    const found = previous.find(record => matches(record, identity));
    return found ? { ...found, pieces: [...found.pieces] } : { version: 1, userId: identity.userId, bookId: identity.bookId,
        chapterId: identity.chapterId, fingerprint: fingerprint(identity), provider: identity.provider, voice: identity.voice,
        grammarModel: identity.grammarModel, chunkTarget: identity.chunkTarget || 1000, texts, pieces: [], updated: Date.now() };
}
export const listenResumeService = {
    isPinned(uri: string): boolean { return records().some(record => uris(record).includes(uri)); },
    get(identity: NativeAudioIdentity): ListenBookmark | null {
        const record = records().find(entry => matches(entry, identity));
        if (!record) return null;
        const cursor = cacheService.getObject<{ position: number; index: number }>(cursorKey(record));
        return { ...record, position: Number.isFinite(cursor?.position) ? Math.max(0, cursor!.position) : 0,
            index: Number.isInteger(cursor?.index) ? Math.max(0, cursor!.index) : 0 };
    },
    async restore(identity: NativeAudioIdentity): Promise<ListenBookmark | null> {
        await pruneOrphans();
        const record = listenResumeService.get(identity);
        if (!record) return null;
        if (record.file) {
            const info = await FileSystem.getInfoAsync(record.file.uri);
            if (info.exists && info.size === record.file.bytes) return record;
        }
        const pieces: KokoroChunk[] = [];
        for (const piece of record.pieces) {
            const info = await FileSystem.getInfoAsync(piece.uri);
            if (!info.exists || info.size !== piece.bytes || piece.index !== pieces.length) break;
            pieces.push(piece);
        }
        if (record.index >= pieces.length) return { ...record, file: undefined, pieces: [] };
        return { ...record, file: undefined, pieces };
    },
    savePiece(identity: NativeAudioIdentity, piece: KokoroChunk, sync: NarrationSync, texts: string[]) {
        const previous = records(), record = base(identity, texts, previous);
        if (piece.index > record.pieces.length) return;
        record.pieces = [...record.pieces.slice(0, piece.index), piece]; record.sync = sync; record.texts = texts;
        record.updated = Date.now(); publish(record, previous);
    },
    saveFile(identity: NativeAudioIdentity, file: NativeAudioFile) {
        const previous = records(), record = base(identity, file.sync?.segments.map(segment => segment.text) || [], previous);
        record.file = file; record.sourceUris = []; if (file.sync) record.sync = file.sync;
        if (file.sync) record.texts = file.sync.segments.map(segment => segment.text);
        record.updated = Date.now(); publish(record, previous);
    },
    replaceFile(identity: NativeAudioIdentity, file: NativeAudioFile) {
        const previous = listenResumeService.get(identity);
        let position = previous?.position || 0;
        let index = previous?.index || 0;
        if (previous?.sync && file.sync) {
            const source = previous.sync.segments.findIndex(segment => position < segment.end);
            if (source >= 0) {
                const old = previous.sync.segments[source];
                const target = file.sync.segments[source]?.text === old.text ? source : file.sync.segments.findIndex(segment => segment.text === old.text);
                if (target >= 0) {
                    const next = file.sync.segments[target];
                    position = next.start + Math.max(0, Math.min(1, (position - old.start) / (old.end - old.start))) * (next.end - next.start);
                    index = target;
                }
            }
        }
        listenResumeService.saveFile(identity, file);
        listenResumeService.savePosition(identity, position, index, true);
    },
    savePosition(identity: NativeAudioIdentity, position: number, index: number, force = false) {
        if (!Number.isFinite(position) || position < 0 || !Number.isInteger(index) || index < 0) return;
        const record = records().find(entry => matches(entry, identity)); if (!record) return;
        const now = Date.now(); if (!force && now - (lastWrites.get(record.fingerprint) || 0) < 2000) return;
        cacheService.setObject(cursorKey(record), { position, index }); lastWrites.set(record.fingerprint, now);
    },
    voiceChange(identity: NativeAudioIdentity, voice: string, index: number) {
        const previous = records(), found = previous.find(entry => matches(entry, identity)); if (!found) return;
        const record = { ...found, sourceUris: [...(found.sourceUris || []), ...(found.file ? [found.file.uri] : [])] };
        record.voice = voice; record.pieces = record.pieces.slice(0, index + 1); record.file = undefined;
        if (record.sync) record.sync = { ...record.sync, segments: record.sync.segments.slice(0, index + 1) };
        record.updated = Date.now(); publish(record, previous);
    },
    adopt(identity: NativeAudioIdentity, pieces: KokoroChunk[], sync: NarrationSync, texts: string[], sourceUri: string, voice: string) {
        const previous = records(), record = base(identity, texts, previous);
        record.sourceUris = [...(record.sourceUris || []), sourceUri]; record.file = undefined;
        record.pieces = pieces; record.sync = sync; record.texts = texts; record.voice = voice; record.updated = Date.now();
        publish(record, previous);
    },
    compact(identity: NativeAudioIdentity) {
        const previous = records(), found = previous.find(entry => matches(entry, identity));
        if (found?.file && found.pieces.length) publish({ ...found, pieces: [], sourceUris: [] }, previous);
    },
    clear(identity: NativeAudioIdentity) {
        const previous = records(), removed = previous.filter(entry => matches(entry, identity));
        cacheService.setObject(INDEX, previous.filter(entry => !removed.includes(entry)));
        for (const record of removed) { cacheService.delete(cursorKey(record)); lastWrites.delete(record.fingerprint); }
        for (const uri of removed.flatMap(uris)) if (!uri.includes('/local-pc-audio/') && !listenResumeService.isPinned(uri)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    },
};
