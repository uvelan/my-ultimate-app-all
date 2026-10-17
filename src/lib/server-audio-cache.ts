import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const STATE_ID = 'global';
const CHUNK_BYTES = 6 * 1024 * 1024;
export const SERVER_AUDIO_WINDOW_SIZE = 5;

export interface CachedAudio {
    audio: Buffer;
    contentType: string;
    provider: string;
    voice: string;
    fallback: string[];
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

export async function readServerAudio(window: AudioCacheWindow, chapterId: string, key: string): Promise<CachedAudio | null> {
    const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
    if (state?.windowToken !== window.windowToken || !state.chapterIds.includes(chapterId)) return null;
    const entry = entries(state.entries).find(item => item.chapterId === chapterId && (item.requestedKey === key || item.actualKey === key));
    if (!entry) return null;
    const chunks = await prisma.ttsAudioCacheChunk.findMany({ where: { audioId: entry.audioId }, orderBy: { index: 'asc' } });
    if (chunks.length !== entry.chunkCount || chunks.some((chunk, index) => chunk.index !== index)) return null;
    const audio = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.audio)));
    if (audio.length !== entry.byteLength) return null;
    return { audio, contentType: entry.contentType, provider: entry.provider, voice: entry.voice, fallback: entry.fallback };
}

export async function writeServerAudio(window: AudioCacheWindow, chapterId: string, requestedKey: string, actualKey: string, audio: CachedAudio): Promise<void> {
    if (!audio.audio.length) return;
    const audioId = randomUUID();
    let published = false;
    try {
        const initial = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
        if (initial?.windowToken !== window.windowToken || !initial.chapterIds.includes(chapterId)) return;
        let chunkCount = 0;
        for (let offset = 0; offset < audio.audio.length; offset += CHUNK_BYTES) {
            await prisma.ttsAudioCacheChunk.create({ data: { audioId, index: chunkCount++, audio: new Uint8Array(audio.audio.subarray(offset, offset + CHUNK_BYTES)) } });
        }
        const entry: Entry = { chapterId, requestedKey, actualKey, audioId, chunkCount, byteLength: audio.audio.length, contentType: audio.contentType, provider: audio.provider, voice: audio.voice, fallback: audio.fallback };
        for (let attempt = 0; attempt < 8; attempt++) {
            const state = await prisma.ttsAudioCacheState.findUnique({ where: { id: STATE_ID } });
            if (state?.windowToken !== window.windowToken || !state.chapterIds.includes(chapterId)) return;
            const previous = entries(state.entries);
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
