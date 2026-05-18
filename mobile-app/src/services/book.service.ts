import { api } from '../lib/api-client';

export interface ChapterMeta {
    id: string;
    title: string;
    order: number;
    content: string | string[];
}

export const bookService = {
    getBooks: async () => {
        const res = await api.get('/books');
        return res.data;
    },

    getBook: async (id: string) => {
        const res = await api.get(`/books/${id}`);
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
    },

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
