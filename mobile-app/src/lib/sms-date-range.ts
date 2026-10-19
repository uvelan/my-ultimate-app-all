export type SmsPeriod = 'DAY' | 'WEEK' | 'MONTH' | 'RANGE';

// Web finance uses calendar dates at UTC midnight. Preserve the reviewed SMS
// calendar day rather than shifting early-morning Indian alerts to yesterday.
export function smsBookingTimestamp(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a date in YYYY-MM-DD format.');
    const date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Choose a valid transaction date.');
    return date.toISOString();
}

export function smsPeriodDates(period: Exclude<SmsPeriod, 'RANGE'>, selected: Date, today = new Date()): { start: Date; end: Date } {
    if (!Number.isFinite(selected.getTime()) || !Number.isFinite(today.getTime())) throw new Error('Choose a valid date.');
    const start = new Date(selected);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (period === 'WEEK') {
        // Monday to Sunday, including weeks crossing a month or year boundary.
        start.setDate(start.getDate() - (start.getDay() + 6) % 7);
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 6);
    } else if (period === 'MONTH') {
        start.setDate(1);
        end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
    }
    const lastAvailableDay = new Date(today);
    lastAvailableDay.setHours(0, 0, 0, 0);
    if (start > lastAvailableDay) throw new Error('Choose today or a past date.');
    if (end > lastAvailableDay) end.setTime(lastAvailableDay.getTime());
    return { start, end };
}
