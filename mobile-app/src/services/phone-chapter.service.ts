import { DeviceEventEmitter, NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { audioIdentityKey, assertAudioActive, type NativeAudioIdentity } from '../lib/listen-audio';
import { bookService } from './book.service';
import { kokoroService, type KokoroProgress } from './kokoro.service';
import { localSyncService } from './local-sync.service';

type Chapter = { id: string; title: string; content?: unknown };
type Book = { id: string; chapters: Chapter[] };

export interface PhoneConversionProgress {
    scope: string;
    id: string;
    title: string;
    message: string;
    running: boolean;
    percent?: number;
    position: number;
    total: number;
    savedIds: string[];
}

let current: PhoneConversionProgress | null = null;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();
function publish(value: PhoneConversionProgress) {
    current = value;
    listeners.forEach(listener => listener());
}

export const phoneConversion = {
    snapshot: () => current,
    scope: (userId: string, bookId: string, voice: string) => JSON.stringify([userId, bookId, voice]),
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    stop: () => controller?.abort(),
    async start(book: Book, chapters: Chapter[], userId: string, voice: string, chunkTarget: number, replaceSaved: boolean) {
        if (controller || !chapters.length) return;
        const run = new AbortController();
        controller = run;
        const bridge = NativeModules.LocalChapterSync;
        const scope = phoneConversion.scope(userId, book.id, voice);
        const savedIds: string[] = [], failures: string[] = [];
        let foreground = false;
        let interrupted = false;
        const serviceStop = DeviceEventEmitter.addListener('PhoneConversionForegroundStopped', () => {
            interrupted = true;
            run.abort();
        });
        const report = (chapter: Chapter, index: number, message: string, percent?: number) => publish({
            scope, id: chapter.id, title: chapter.title, message, running: true,
            position: index + 1, total: chapters.length, savedIds: [...savedIds], percent,
        });
        report(chapters[0], 0, 'Starting background conversion…');
        try {
            if (!bridge?.startPhoneConversion) throw new Error('Install the updated Android app to convert in the background.');
            await bridge.startPhoneConversion();
            foreground = true;
            for (const [index, chapter] of chapters.entries()) {
                if (run.signal.aborted) break;
                report(chapter, index, 'Preparing chapter…');
                try {
                    await convertPhoneChapter(book, chapter.id, userId, voice, chunkTarget, run.signal, event => {
                        if (run.signal.aborted) return;
                        const percent = event.phase === 'generate' && Number.isFinite(event.progress)
                            ? Math.round(Math.max(0, Math.min(1, event.progress)) * 100) : undefined;
                        report(chapter, index, event.message || 'Generating audio', percent);
                    }, replaceSaved);
                    savedIds.push(chapter.id);
                    report(chapter, index, 'Phone audio saved.', 100);
                } catch (error) {
                    if (!run.signal.aborted) failures.push(`${chapter.title}: ${error instanceof Error ? error.message : 'Conversion failed'}`);
                }
            }
        } catch (error) {
            failures.push(error instanceof Error ? error.message : 'Could not start background conversion.');
        } finally {
            serviceStop.remove();
            if (foreground) await bridge.stopPhoneConversion().catch(() => {});
            controller = null;
            const result = interrupted ? 'Android stopped the background conversion'
                : run.signal.aborted ? 'Stopped' : failures.length ? 'Conversion finished with errors' : 'Phone conversion finished';
            if (current) publish({ ...current, running: false, percent: undefined, savedIds: [...savedIds],
                message: `${result} · ${savedIds.length} saved${failures.length ? '\n' + failures.join('\n') : ''}` });
        }
    },
};

async function convertPhoneChapter(
    book: Book,
    chapterId: string, userId: string, voice: string, chunkTarget: number, signal: AbortSignal,
    progress: (event: KokoroProgress) => void,
    replaceSaved = false,
) {
    const bridge = NativeModules.LocalChapterSync;
    if (!bridge?.savePhoneChapter) throw new Error('Install the updated Android app to save phone-generated chapters.');
    const index = book.chapters.findIndex(chapter => chapter.id === chapterId);
    if (index < 0) throw new Error('This chapter is no longer in the book.');
    const chapter = book.chapters[index];
    const loaded = chapter.content === undefined ? await bookService.getChapterContent(book.id, String(index)) : chapter;
    assertAudioActive(signal);
    if (loaded.id !== chapterId || loaded.content === undefined) throw new Error('Chapter text could not be loaded.');
    const identity: NativeAudioIdentity = { userId, bookId: book.id, chapterId, title: chapter.title,
        content: loaded.content, provider: 'kokoro', voice, grammarModel: 'OFF', chunkTarget };
    if (!replaceSaved && await localSyncService.get(identity)) return;
    const audio = await kokoroService.generate(identity, signal, progress);
    try {
        assertAudioActive(signal);
        await bridge.savePhoneChapter(JSON.stringify({
            key: audioIdentityKey(identity), userId, bookId: book.id, chapterId, chapterIndex: index,
            voice, chunkTarget, uri: audio.uri, bytes: audio.bytes, sync: audio.sync,
        }));
        await localSyncService.refresh();
    } finally {
        await FileSystem.deleteAsync(audio.uri, { idempotent: true }).catch(() => {});
    }
}
