import { api } from '../lib/api-client';

export const bookService = {
    getBooks: async () => {
        const res = await api.get('/books');
        return res.data;
    },

    getBook: async (id: string) => {
        const res = await api.get(`/books/${id}`);
        return res.data;
    },

    getChapterContent: async (bookId: string, chapterId: string) => {
        const res = await api.get(`/books/${bookId}/chapters/${chapterId}`);
        return res.data;
    },

    updateProgress: async (bookId: string, chapterId: string) => {
        await api.patch(`/books/${bookId}/progress`, { chapterId });
    }
};
