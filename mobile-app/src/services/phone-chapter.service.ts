import { NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { audioIdentityKey, assertAudioActive, type NativeAudioIdentity } from '../lib/listen-audio';
import { bookService } from './book.service';
import { kokoroService, type KokoroProgress } from './kokoro.service';
import { localSyncService } from './local-sync.service';

export async function convertPhoneChapter(
    book: { id: string; chapters: { id: string; title: string; content?: unknown }[] },
    chapterId: string, userId: string, voice: string, chunkTarget: number, signal: AbortSignal,
    progress: (event: KokoroProgress) => void,
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
    if (await localSyncService.get(identity)) return;
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
