import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { compressNarrationAudio } from '@/lib/audio-compression';
import type { NarrationSync } from '@/lib/narration-sync';

const STATE_ID = 'global';
const CHUNK_BYTES = 6 * 1024 * 1024;
const compressionInFlight = new Map<string, Promise<CachedAudio>>();
export const SERVER_AUDIO_WINDOW_SIZE = 5;

export interface CachedAudio {
    audio: Buffer;
    contentType: string;
    provider: string;
    voice: string;
    fallback: string[];
    narrationSync?: NarrationSync;
    narrationAudioHash?: string;
}

interface Entry extends Omit<CachedAudio, 'audio'> {
    chapterId: string;
    requestedKey: string;
    actualKey: string;
    audioId: string;
    chunkCount: number;
    byteLength: number;
}

export interface AudioCacheWindow {
    bookId: string;
    currentChapterId: string;
    windowToken: string;
    chapterIds: string[];
}

export function serverAudioCacheKey(content: unknown, provider: string, voice: string, grammar: string): string {
    return createHash('sha256').update(JSON.stringify({ version: 1, content, provider, voice, grammar })).digest('hex');
}

function entries(value: unknown): Entry[] {
    return Array.isArray(value) ? value as unknown as Entry[] : [];
}

async function removeAudio(audioIds: string[]) {
    if (audioIds.length) await prisma.ttsAudioCacheChunk.deleteMany({ where: { audioId: { in: audioIds } } });
}

/** Only foreground playback/explicit window activation may change the global window. */
export async function activateAudioCacheWindow(bookId: string, chapterId: string, order: number, signal?: AbortSignal): Promise<AudioCacheWindow> {
    const chapters = await prisma.chapter.findMany({
        where: { bookId, order: { gte: order } }, orderBy: { order: 'asc' }, take: SERVER_AUDIO_WINDOW_SIZE,
        select: { id: true },
    });
    const chapterIds = chapters.map(chapter => chapter.id);
    for (let attempt = 0; attempt < 8; attempt++) {
        signal?.throwIfAborted();
        const old = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
        if (old?.bookId === bookId && old.currentChapterId === chapterId &&
            JSON.stringify(old.chapterIds) === JSON.stringify(chapterIds)) return old;

        const kept = old?.bookId === bookId ? entries(old.entries).filter(entry => chapterIds.includes(entry.chapterId)) : [];
        // Retained in-flight chapters may finish after an anchor advances. Keep the
        // book session token, while CAS revisions and current IDs guard every write.
        // Switching books invalidates every request from the preceding session.
        const windowToken = old?.bookId === bookId ? old.windowToken : randomUUID();
        const next = { bookId, currentChapterId: chapterId, chapterIds, windowToken, revision: randomUUID(), entries: JSON.parse(JSON.stringify(kept)) };
        signal?.throwIfAborted();
        if (!old) {
            try {
                await prisma.ttsAudioCacheState.create({ data: { id: STATE_ID, ...next } });
            } catch (error) {
                if ((error as { code?: string }).code === 'P2002') continue;
                throw error;
            }
        } else {
            const result = await prisma.ttsAudioCacheState.updateMany({ where: { id: STATE_ID, revision: old.revision }, data: next });
            if (!result.count) continue;
        }
        // Failed cleanup cannot make generation fail. Unpublished old chunks are swept later.
        const removed = entries(old?.entries).filter(entry => !kept.some(item => item.audioId === entry.audioId));
        await removeAudio(removed.map(entry => entry.audioId)).catch(() => {});
        await prisma.chapterAudio.deleteMany({}).catch(() => {});
        await sweepOrphanAudioChunks().catch(() => {});
        return next;
    }
    throw new Error('Audio cache window changed concurrently');
}

export async function getAudioCacheWindow(bookId: string, currentChapterId: string): Promise<AudioCacheWindow | null> {
    const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
    return state?.bookId === bookId && state.currentChapterId === currentChapterId ? state : null;
}

/** Metadata only: no activation, audio reads, compression, or provider calls. */
export async function readServerNarrationSync(bookId: string, chapterId: string, key: string): Promise<{ sync: NarrationSync | null; audioId: string | null }> {
    const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
    if (state?.bookId !== bookId || !state.chapterIds.includes(chapterId)) return { sync: null, audioId: null };
    const entry = entries(state.entries).find(item => item.chapterId === chapterId && (item.requestedKey === key || item.actualKey === key));
    const hash = entry?.narrationAudioHash;
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { sync: null, audioId: null };
    return { sync: entry?.narrationSync || null, audioId: hash };
}

export async function readServerAudio(window: AudioCacheWindow, chapterId: string, key: string, signal?: AbortSignal): Promise<CachedAudio | null> {
    const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
    if (state?.windowToken !== window.windowToken || !state.chapterIds.includes(chapterId)) return null;
    const entry = entries(state.entries).find(item => item.chapterId === chapterId && (item.requestedKey === key || item.actualKey === key));
    if (!entry) return null;
    // Sort small chunk descriptors locally: MongoDB sorting full binary records can
    // exceed its aggregation memory limit for a single long chapter.
    const chunks = await prisma.ttsAudioCacheChunk.findMany({ where: { audioId: entry.audioId } });
    chunks.sort((a, b) => a.index - b.index);
    if (chunks.length !== entry.chunkCount || chunks.some((chunk, index) => chunk.index !== index)) return null;
    const audio = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.audio)));
    if (audio.length !== entry.byteLength) return null;
    const cached: CachedAudio = { audio, contentType: entry.contentType, provider: entry.provider, voice: entry.voice, fallback: entry.fallback,
        ...(entry.narrationSync ? { narrationSync: entry.narrationSync } : {}),
        narrationAudioHash: createHash('sha256').update(audio).digest('hex') };
    if (!/wav/i.test(entry.contentType)) return cached;

    // Existing WAVs are upgraded in place without invoking a speech provider.
    // Share the CPU work for simultaneous reads, without one caller's abort
    // cancelling a conversion that another listener is still awaiting.
    let conversion = compressionInFlight.get(entry.audioId);
    if (!conversion) {
        conversion = (async () => {
            let compressed;
            try {
                compressed = await compressNarrationAudio(audio, entry.contentType);
            } catch {
                return cached;
            }
            const result = { ...cached, ...compressed, narrationAudioHash: createHash('sha256').update(compressed.audio).digest('hex') };
            if (result.contentType !== entry.contentType || result.audio.length !== audio.length) {
                await writeServerAudio(window, chapterId, entry.requestedKey, entry.actualKey, result, entry.audioId).catch(() => {});
            }
            return result;
        })().finally(() => compressionInFlight.delete(entry.audioId));
        compressionInFlight.set(entry.audioId, conversion);
    }
    const result = await conversion;
    signal?.throwIfAborted();
    return result;
}

export async function writeServerAudio(window: AudioCacheWindow, chapterId: string, requestedKey: string, actualKey: string, audio: CachedAudio, expectedAudioId?: string): Promise<void> {
    if (!audio.audio.length) return;
    const audioId = randomUUID();
    let published = false;
    try {
        const initial = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
        if (initial?.windowToken !== window.windowToken || !initial.chapterIds.includes(chapterId)) return;
        if (expectedAudioId && !entries(initial.entries).some(item => item.chapterId === chapterId && item.audioId === expectedAudioId)) return;
        let chunkCount = 0;
        for (let offset = 0; offset < audio.audio.length; offset += CHUNK_BYTES) {
            await prisma.ttsAudioCacheChunk.create({ data: { audioId, index: chunkCount++, audio: new Uint8Array(audio.audio.subarray(offset, offset + CHUNK_BYTES)) } });
        }
        const entry: Entry = { chapterId, requestedKey, actualKey, audioId, chunkCount, byteLength: audio.audio.length, contentType: audio.contentType, provider: audio.provider, voice: audio.voice, fallback: audio.fallback,
            ...(audio.narrationSync ? { narrationSync: audio.narrationSync } : {}),
            narrationAudioHash: createHash('sha256').update(audio.audio).digest('hex') };
        for (let attempt = 0; attempt < 8; attempt++) {
            const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
            if (state?.windowToken !== window.windowToken || !state.chapterIds.includes(chapterId)) return;
            const previous = entries(state.entries);
            if (expectedAudioId && !previous.some(item => item.chapterId === chapterId && item.audioId === expectedAudioId)) return;
            const next = [...previous.filter(item => item.chapterId !== chapterId), entry];
            const updated = await prisma.ttsAudioCacheState.updateMany({
                where: { id: STATE_ID, revision: state.revision, windowToken: window.windowToken },
                data: { entries: JSON.parse(JSON.stringify(next)), revision: randomUUID() },
            });
            if (!updated.count) continue;
            published = true;
            await removeAudio(previous.filter(item => item.chapterId === chapterId).map(item => item.audioId)).catch(() => {});
            return;
        }
    } finally {
        if (!published) await removeAudio([audioId]).catch(() => {});
    }
}

/** Bound leftovers from interrupted writes; active descriptors always protect their chunks. */
export async function sweepOrphanAudioChunks(): Promise<void> {
    const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
    const activeIds = entries(state?.entries).map(entry => entry.audioId);
    await prisma.ttsAudioCacheChunk.deleteMany({ where: {
        audioId: { notIn: activeIds }, createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    } });
}
