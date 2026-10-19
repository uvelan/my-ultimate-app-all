import { api } from '../lib/api-client';
import { financeService } from './finance.service';

const legacyTransaction = (item: any) => ({ ...item, amount: item.amountPaise / 100, date: item.transactionDate, notes: item.description, source: item.category?.name || item.description || 'Income' });
const canonicalTransaction = (data: any, type: 'EXPENSE' | 'INCOME') => ({ type, amountPaise: Math.round(Number(data.amount) * 100), categoryId: data.categoryId, transactionDate: data.date, description: data.notes || '', paymentMethod: data.paymentMethod || 'Net Banking' });

export const expenseService = {
    getExpenses: async (startDate?: string, endDate?: string) => {
        return (await financeService.transactions({ startDate, endDate, type: 'EXPENSE' })).map(legacyTransaction);
    },

    getStats: async (startDate?: string, endDate?: string) => {
        const { data } = await api.get('/mobile/finance', { params: { resource: 'stats', startDate, endDate } });
        return {
            totalIncome: data.totalIncome / 100, totalExpense: data.totalExpense / 100, balance: data.netSavings / 100,
            categorySplit: data.categories.filter((cat: any) => !cat.parentId).map((cat: any) => ({ name: cat.name, value: (data.categorySpending[cat.id] || 0) / 100, color: cat.color })).filter((cat: any) => cat.value > 0),
            methodSplit: Object.entries(data.methodSpending).map(([name, value], index) => ({ name, value: Number(value) / 100, color: ['#8b5cf6', '#10b981', '#60a5fa', '#f59e0b'][index % 4] })),
        };
    },

    getHistorical: async (grouping = 'month', groupBy = 'category') => {
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
        const transactions = await financeService.transactions({ startDate: start.toISOString(), endDate: end.toISOString(), type: 'EXPENSE' });
        const groups = new Map<string, { name: string; color: string }>();
        const periods = new Map<string, any>();
        for (let date = new Date(start); date <= end; date.setMonth(date.getMonth() + 1)) periods.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, { period: date.toLocaleDateString('en', { month: 'short', year: '2-digit' }), expense: 0 });
        for (const item of transactions) {
            const date = new Date(item.transactionDate);
            const period = periods.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
            if (!period) continue;
            const name = groupBy === 'method' ? item.paymentMethod : item.category?.name || 'Other';
            groups.set(name, { name, color: item.category?.color || '#8b5cf6' });
            period.expense += item.amountPaise / 100;
            period[name] = (period[name] || 0) + item.amountPaise / 100;
        }
        return { chartData: [...periods.values()], categories: [...groups.values()] };
    },

    addExpense: async (data: any) => {
        return financeService.save('transactions', canonicalTransaction(data, 'EXPENSE'));
    },

    updateExpense: async (id: string, data: any) => {
        return financeService.save('transactions', canonicalTransaction(data, 'EXPENSE'), id);
    },

    deleteExpense: async (id: string) => {
        await financeService.remove('transactions', id);
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

    scrapeNovel: async (url: string, siteId: string) => {
        const res = await api.post('/novelscraper/scrape-link', { sourceUrl: url, siteId });
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
        await api.delete('/replacements', { params: { id } });
    }
};

export const incomeService = {
    getIncomes: async (startDate?: string, endDate?: string) => {
        return (await financeService.transactions({ startDate, endDate, type: 'INCOME' })).map(legacyTransaction);
    },
    addIncome: async (data: { amount: number, source: string, date: string, notes?: string }) => {
        const categories = await financeService.categories();
        let category = categories.find((item: any) => item.type === 'INCOME' && item.name.toLowerCase() === data.source.trim().toLowerCase());
        if (!category) {
            const result = await financeService.save('categories', { name: data.source.trim(), color: '#10b981', type: 'INCOME' });
            category = result.result;
        }
        return financeService.save('transactions', canonicalTransaction({ ...data, categoryId: category.id }, 'INCOME'));
    },
    deleteIncome: async (id: string) => {
        await financeService.remove('transactions', id);
    }
};

export const categoryService = {
    getCategories: async () => {
        return (await financeService.categories()).filter((item: any) => item.type === 'EXPENSE');
    },
    addCategory: async (data: { name: string, color: string }) => {
        return financeService.save('categories', { ...data, type: 'EXPENSE' });
    },
    deleteCategory: async (id: string) => {
        await financeService.remove('categories', id);
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
    },
    updateApp: async (id: string, appData: any) => {
        return (await api.patch(`/admin/my-apps/${id}`, appData)).data;
    }
};
