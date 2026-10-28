import { cacheService } from './storage';

// Latest selection wins, including navigation back to an earlier chapter.
export const bookProgress = {
    getChapter(bookId: string, fallback = 0): number {
        const saved = cacheService.getObject<{ chapterIndex: number }>('book-progress-' + bookId);
        return Number.isInteger(saved?.chapterIndex) && saved!.chapterIndex >= 0 ? saved!.chapterIndex : fallback;
    },
    getRevision(bookId: string): number {
        return cacheService.getObject<{ revision?: number }>('book-progress-' + bookId)?.revision || 0;
    },
    acceptServer(bookId: string, chapterIndex: number): number {
        bookProgress.saveChapter(bookId, chapterIndex);
        return bookProgress.getChapter(bookId);
    },
    saveChapter(bookId: string, chapterIndex: number): void {
        if (!bookId || !Number.isInteger(chapterIndex) || chapterIndex < 0) return;
        cacheService.setObject('book-progress-' + bookId, { chapterIndex, revision: bookProgress.getRevision(bookId) + 1 });
    },
};
