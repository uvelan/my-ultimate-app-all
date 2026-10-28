import { bookProgress } from '../lib/book-progress';
import { api } from '../lib/api-client';

export interface ChapterMeta {
    id: string;
    title: string;
    order: number;
    content: unknown;
}

const chapterOrders = new Map<string, number[]>();
const chapterOrderRequests = new Map<string, Promise<number[]>>();
async function resolveChapterOrder(bookId: string, index: string, refresh = false): Promise<number> {
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0) throw new Error('Invalid chapter position.');
    if (refresh) chapterOrders.delete(bookId);
    let orders = chapterOrders.get(bookId);
    if (!orders) {
        let pending = chapterOrderRequests.get(bookId);
        if (!pending) {
            pending = api.get(`/books/${bookId}?chapters=metadata`, refresh ? {
                params: { _refresh: Date.now() }, headers: { 'Cache-Control': 'no-cache' },
            } : undefined).then(response => {
                if (!Array.isArray(response.data?.chapters)) throw new Error('The chapter list could not be loaded.');
                const sorted = response.data.chapters.slice().sort((a: any, b: any) => a.order - b.order);
                const result = sorted.map((chapter: any) => chapter.order as number);
                if (result.some((order: number) => !Number.isInteger(order))) throw new Error('Invalid chapter list.');
                chapterOrders.set(bookId, result); return result;
            }).finally(() => { chapterOrderRequests.delete(bookId); });
            chapterOrderRequests.set(bookId, pending);
        }
        orders = await pending;
    }
    if (orders[position] === undefined) throw new Error('This chapter is not available. Refresh the book and retry.');
    return orders[position];
}

const progressQueues = new Map<string, Promise<unknown>>();

export const bookService = {
    syncProgress: async (id: string): Promise<number> => {
        // Finish this device's writes before reading the shared server position.
        await progressQueues.get(id)?.catch(() => {});
        const before = bookProgress.getRevision(id);
        const res = await api.get(`/books/${id}?progress=1&chapters=metadata`);
        // A chapter selected during the request must not be replaced by its response.
        if (bookProgress.getRevision(id) !== before) return bookProgress.getChapter(id);
        return bookProgress.acceptServer(id, res.data.chapterId);
    },
    getBooks: async () => {
        const res = await api.get('/books');
        return res.data;
    },

    getBook: async (id: string, metadataOnly = false) => {
        const res = await api.get(`/books/${id}${metadataOnly ? "?chapters=metadata" : ""}`);
        return res.data;
    },

    downloadBook: async (id: string) => {
        const res = await api.get(`/books/${id}/download`, { responseType: 'blob' });
        return res.data;
    },

    /** Fetch ALL chapters for a book in one request. Returns { chapters: ChapterMeta[] } */
    getAllChapters: async (bookId: string): Promise<{ chapters: ChapterMeta[] }> => {
        const res = await api.get(`/books/${bookId}/chapters`);
        return res.data;
    },

    /** Legacy: fetch a single chapter by order index */
    getChapterContent: async (bookId: string, chapterId: string, refresh = false) => {
        const order = await resolveChapterOrder(bookId, chapterId, refresh);
        const res = await api.get(`/books/${bookId}/chapters/${order}`, refresh ? {
            params: { _refresh: Date.now() }, headers: { 'Cache-Control': 'no-cache' },
        } : undefined);
        return res.data;
    },

    updateProgress: async (id: string, chapterId: number, sentenceId: number = 0, force = false) => {
        // Restoring a view is a read, not a new chapter selection.
        if (!force && sentenceId === 0 && bookProgress.getChapter(id, -1) === chapterId) return;
        bookProgress.saveChapter(id, chapterId);
        const pending = (progressQueues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
            if (bookProgress.getChapter(id) !== chapterId) return;
            return (await api.patch(`/books/${id}`, { chapterId, sentenceId })).data;
        });
        progressQueues.set(id, pending);
        try { return await pending; }
        finally { if (progressQueues.get(id) === pending) progressQueues.delete(id); }
    },

    updateChapterContent: async (bookId: string, chapterIndex: string, content: string | string[]) => {
        const order = await resolveChapterOrder(bookId, chapterIndex);
        const res = await api.patch(`/books/${bookId}/chapters/${order}`, { content });
        return res.data;
    },

    proposeGrammarCorrection: async (bookId: string, chapterId: string, aiModel: string = 'gpt-4o-mini') => {
        const actualId = /^[a-f\d]{24}$/i.test(chapterId)
            ? chapterId : (await bookService.getChapterContent(bookId, chapterId)).id;
        const res = await api.post(`/grammar-correct`, { chapterId: actualId, modelId: aiModel });
        return res.data;
    },

    getReplacementRules: async (bookId: string) => (await api.get('/replacements', { params: { bookId } })).data,
    addReplacementRule: async (data: { bookId?: string; search: string; replace: string; isRegex: boolean }) =>
        (await api.post('/replacements', data)).data,
    deleteReplacementRule: async (id: string) => { await api.delete('/replacements', { params: { id } }); },

    uploadBook: async (file: { uri: string, name: string, type: string }) => {
        const formData = new FormData();
        // @ts-ignore
        formData.append('file', {
            uri: file.uri,
            name: file.name,
            type: file.type || 'application/epub+zip',
        });
        
        const res = await api.post('/books', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            // Important for progress if needed later
            transformRequest: (data) => data, 
        });
        return res.data;
    }
};
