import { api } from '../lib/api-client';

export const expenseService = {
    getExpenses: async () => {
        const res = await api.get('/expense');
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
    }
};
