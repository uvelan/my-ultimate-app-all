import * as FileSystem from 'expo-file-system/legacy';
import { cacheService } from '@/src/lib/storage';
import type { ChapterMeta } from './book.service';
import { chapterContentParagraphs } from '../lib/chapter-content';

const CACHE_DIR = FileSystem.cacheDirectory || `${FileSystem.documentDirectory}cache/`;
const BOOKS_CACHE_DIR = `${CACHE_DIR}books/`;

export const offlineService = {
    ensureDir: async () => {
        const dirInfo = await FileSystem.getInfoAsync(BOOKS_CACHE_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(BOOKS_CACHE_DIR, { intermediates: true });
        }
    },

    saveChapter: async (bookId: string, chapterId: string, content: unknown) => {
        await offlineService.ensureDir();
        const fileName = `${bookId}_position_${chapterId}.json`;
        const filePath = BOOKS_CACHE_DIR + fileName;
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify({ content: chapterContentParagraphs(content).join('\n'), timestamp: Date.now() }));

        // Update local index of cached chapters
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];
        if (!cached.includes(chapterId)) {
            cacheService.setObject(`cached_${bookId}`, [...cached, chapterId]);
        }
    },

    /** Save all chapters at once from a bulk API response */
    saveAllChapters: async (bookId: string, chapters: ChapterMeta[]) => {
        await offlineService.ensureDir();
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];

        for (const [position, chapter] of chapters.entries()) {
            const chapterId = String(position);
            const content = chapterContentParagraphs(chapter.content).join('\n');

            const fileName = `${bookId}_position_${chapterId}.json`;
            const filePath = BOOKS_CACHE_DIR + fileName;
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify({ content, timestamp: Date.now() }));

            if (!cached.includes(chapterId)) {
                cached.push(chapterId);
            }
        }

        cacheService.setObject(`cached_${bookId}`, cached);
    },

    getChapter: async (bookId: string, chapterId: string): Promise<string | null> => {
        const fileName = `${bookId}_position_${chapterId}.json`;
        let filePath = BOOKS_CACHE_DIR + fileName;
        let fileInfo = await FileSystem.getInfoAsync(filePath);

        if (!fileInfo.exists) {
            const metadata = cacheService.getObject<{ chapters?: { order: number }[] }>(`book_meta_${bookId}`);
            const order = metadata?.chapters?.[Number(chapterId)]?.order;
            if (Number.isInteger(order)) {
                filePath = BOOKS_CACHE_DIR + `${bookId}_${order}.json`;
                fileInfo = await FileSystem.getInfoAsync(filePath);
            }
        }
        if (fileInfo.exists) {
            try {
                const content = await FileSystem.readAsStringAsync(filePath);
                const parsed = JSON.parse(content);
                if (typeof parsed?.content === 'string' && !parsed.content.includes('[object Object]')) {
                    return chapterContentParagraphs(parsed.content).join('\n');
                }
            } catch { /* A damaged local chapter is a cache miss; the reader can fetch it again. */ }
            await FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
        }
        return null;
    },

    /** Returns true if there is at least one cached chapter for this book */
    hasCachedChapters: (bookId: string): boolean => {
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];
        return cached.length > 0;
    },

    /** Returns the list of cached chapter order-indices for a book */
    getCachedChapterIds: (bookId: string): string[] => {
        return cacheService.getObject<string[]>(`cached_${bookId}`) || [];
    },

    clearBookCache: async (bookId: string) => {
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];
        for (const chapterId of cached) {
            const filePath = BOOKS_CACHE_DIR + `${bookId}_position_${chapterId}.json`;
            await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
        cacheService.delete(`cached_${bookId}`);
    }
};

