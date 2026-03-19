import { api } from '../lib/api-client';

export const expenseService = {
    getExpenses: async (startDate?: string, endDate?: string) => {
        const res = await api.get('/expense', { params: { startDate, endDate } });
        return res.data;
    },

    getStats: async (startDate?: string, endDate?: string) => {
        const res = await api.get('/expense/stats', { params: { startDate, endDate } });
        return res.data;
    },

    getHistorical: async (grouping = 'month', groupBy = 'category') => {
        const res = await api.get('/expense/historical', { params: { grouping, groupBy } });
        return res.data;
    },

    addExpense: async (data: any) => {
        const res = await api.post('/expense', data);
        return res.data;
    },

    updateExpense: async (id: string, data: any) => {
        const res = await api.put(`/expense/${id}`, data);
        return res.data;
    },

    deleteExpense: async (id: string) => {
        await api.delete(`/expense/${id}`);
    }
};

export const scraperService = {
    getSources: async () => {
        const res = await api.get('/novelscraper/sources');
        return res.data;
    },

    searchNovels: async (siteId: string, query: string) => {
        const res = await api.post('/novelscraper/search', { siteId, query });
        return res.data;
    },

    scrapeNovel: async (url: string) => {
        const res = await api.post('/novelscraper/scrape', { url });
        return res.data;
    },

    getScrapedNovels: async () => {
        const res = await api.get('/novelscraper/novels');
        return res.data;
    },

    addNovelToLibrary: async (id: string, author: string, coverUrl: string) => {
        const res = await api.post(`/novelscraper/novels/${id}/add-to-db`, { author, coverUrl });
        return res.data;
    },

    deleteScrapedNovel: async (id: string) => {
        await api.delete(`/novelscraper/novels/${id}`);
    },

    syncScraperNovel: async (id: string) => {
        const res = await api.post(`/novelscraper/novels/${id}/sync`);
        return res.data;
    },

    getScraperSettings: async () => {
        const res = await api.get('/novelscraper/settings');
        return res.data;
    },

    updateScraperSettings: async (siteId: string, replacements: any[]) => {
        const res = await api.post('/novelscraper/settings', { siteId, replacements });
        return res.data;
    }
};

export const replacementService = {
    getReplacements: async (bookId: string) => {
        const res = await api.get(`/replacements?bookId=${bookId}`);
        return res.data;
    },
    addReplacement: async (data: any) => {
        const res = await api.post('/replacements', data);
        return res.data;
    },
    deleteReplacement: async (id: string) => {
        await api.delete(`/replacements/${id}`);
    }
};

export const incomeService = {
    getIncomes: async () => {
        const res = await api.get('/income');
        return res.data;
    },
    addIncome: async (data: { amount: number, source: string, date: string, notes?: string }) => {
        const res = await api.post('/income', data);
        return res.data;
    },
    deleteIncome: async (id: string) => {
        await api.delete(`/income/${id}`);
    }
};

export const categoryService = {
    getCategories: async () => {
        const res = await api.get('/expense/category');
        return res.data;
    },
    addCategory: async (data: { name: string, color: string }) => {
        const res = await api.post('/expense/category', data);
        return res.data;
    },
    deleteCategory: async (id: string) => {
        await api.delete(`/expense/category/${id}`);
    }
};

export const adminService = {
    getApps: async () => {
        const res = await api.get('/admin/my-apps');
        return res.data;
    },
    addApp: async (appData: any) => {
        const res = await api.post('/admin/my-apps', appData);
        return res.data;
    },
    deleteApp: async (id: string) => {
        await api.delete(`/admin/my-apps/${id}`);
    }
};
