import * as FileSystem from 'expo-file-system';
import { cacheService } from '@/src/lib/storage';

const BOOKS_CACHE_DIR = `${FileSystem.cacheDirectory}books/`;

export const offlineService = {
    ensureDir: async () => {
        const dirInfo = await FileSystem.getInfoAsync(BOOKS_CACHE_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(BOOKS_CACHE_DIR, { intermediates: true });
        }
    },

    saveChapter: async (bookId: string, chapterId: string, content: string) => {
        await offlineService.ensureDir();
        const fileName = `${bookId}_${chapterId}.json`;
        const filePath = BOOKS_CACHE_DIR + fileName;
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify({ content, timestamp: Date.now() }));

        // Update local index of cached chapters
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];
        if (!cached.includes(chapterId)) {
            cacheService.setObject(`cached_${bookId}`, [...cached, chapterId]);
        }
    },

    getChapter: async (bookId: string, chapterId: string): Promise<string | null> => {
        const fileName = `${bookId}_${chapterId}.json`;
        const filePath = BOOKS_CACHE_DIR + fileName;
        const fileInfo = await FileSystem.getInfoAsync(filePath);

        if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(filePath);
            return JSON.parse(content).content;
        }
        return null;
    },

    clearBookCache: async (bookId: string) => {
        const cached = cacheService.getObject<string[]>(`cached_${bookId}`) || [];
        for (const chapterId of cached) {
            const filePath = BOOKS_CACHE_DIR + `${bookId}_${chapterId}.json`;
            await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
        cacheService.delete(`cached_${bookId}`);
    }
};
