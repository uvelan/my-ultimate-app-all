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

    updateProgress: async (id: string, chapterId: number, sentenceId: number = 0) => {
        const res = await api.patch(`/books/${id}`, { chapterId, sentenceId });
        return res.data;
    },

    updateChapterContent: async (bookId: string, chapterIndex: string, content: string) => {
        const res = await api.patch(`/books/${bookId}/chapters/${chapterIndex}`, { content });
        return res.data;
    },

    proposeGrammarCorrection: async (bookId: string, chapterId: string, aiModel: string = 'gemini-2.5-flash') => {
        const res = await api.post(`/grammar-correct`, { bookId, chapterId, aiModel });
        return res.data;
    }
};
