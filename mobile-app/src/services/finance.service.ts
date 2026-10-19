import { api } from '../lib/api-client';

export type FinanceResource = 'transactions' | 'categories' | 'budgets' | 'recurring';
export type FinanceSnapshot = { transactions: any[]; categories: any[]; budgets: any[]; recurring: any[] };

export const financeService = {
    async transactions(params: { startDate?: string; endDate?: string; type?: 'INCOME' | 'EXPENSE' } = {}): Promise<any[]> {
        const result: any[] = [];
        let page = 1;
        let totalPages = 1;
        do {
            const { data } = await api.get('/mobile/finance', { params: { ...params, resource: 'transactions', page, limit: 200 } });
            result.push(...data.transactions);
            totalPages = data.totalPages;
            page++;
        } while (page <= totalPages);
        return result;
    },
    async categories(includeArchived = false): Promise<any[]> {
        return (await api.get('/mobile/finance', { params: { resource: 'categories', includeArchived } })).data;
    },
    async snapshot(params: { startDate?: string; endDate?: string; month?: string } = {}): Promise<FinanceSnapshot> {
        return (await api.get('/mobile/finance', { params })).data;
    },
    async save(resource: FinanceResource, data: any, id?: string) {
        return (await api.request({ url: '/mobile/finance', method: id ? 'PATCH' : 'POST', data: { resource, id, data } })).data;
    },
    async remove(resource: FinanceResource, id: string) {
        return (await api.delete('/mobile/finance', { data: { resource, id } })).data;
    },
};
