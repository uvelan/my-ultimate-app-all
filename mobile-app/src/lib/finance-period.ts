import { financeDateRange, financeDay } from './finance-range';

export type FinancePeriod = 'month' | 'quarter' | 'halfYear' | 'year';
export function financePeriodRange(period: FinancePeriod, anchor: Date) {
    const [year, month] = financeDay(anchor).split('-').map(Number);
    const span = period === 'year' ? 12 : period === 'halfYear' ? 6 : period === 'quarter' ? 3 : 1;
    const first = Math.floor((month - 1) / span) * span;
    const start = `${year}-${String(first + 1).padStart(2, '0')}-01`;
    const end = new Date(Date.UTC(year, first + span, 0)).toISOString().slice(0, 10);
    return financeDateRange(start, end)!;
}

export function moveFinancePeriod(period: FinancePeriod, anchor: Date, direction: number) {
    const [year, month] = financeDay(anchor).split('-').map(Number);
    const span = period === 'year' ? 12 : period === 'halfYear' ? 6 : period === 'quarter' ? 3 : 1;
    return new Date(Date.UTC(year, month - 1 + span * direction, 1, 12));
}
