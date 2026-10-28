// Shared Finance calendar: dates and inclusive boundaries use Asia/Kolkata.
export function financeDay(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    return ['year','month','day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function financeDateRange(start: string, end: string) {
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
    if (!valid(start) || !valid(end) || start > end) return null;
    return { start, end, startDate: new Date(start + 'T00:00:00+05:30').toISOString(), endDate: new Date(Date.parse(end + 'T00:00:00+05:30') + 86400000 - 1).toISOString() };
}
export function financeRangeSeries(start: string, end: string, daily: Record<string, { income: number; expense: number }>) {
    const range = financeDateRange(start,end);
    if (!range) return [];
    const days = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000 + 1;
    const mode = days <= 31 ? 'day' : days <= 1096 ? 'month' : 'year';
    const keyFor = (day: string) => day.slice(0, mode === 'day' ? 10 : mode === 'month' ? 7 : 4);
    const rows = new Map<string, { key: string; label: string; income: number; expense: number }>();
    const cursor = new Date(start + 'T00:00:00Z'), last = new Date(end + 'T00:00:00Z');
    if (mode !== 'day') cursor.setUTCDate(1);
    if (mode === 'year') cursor.setUTCMonth(0);
    while (cursor <= last) {
        const key = keyFor(cursor.toISOString().slice(0,10));
        const label = mode === 'year' ? String(cursor.getUTCFullYear()) : cursor.toLocaleDateString('en-IN', { timeZone: 'UTC', ...(mode === 'day' ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' }) });
        rows.set(key,{key,label,income:0,expense:0});
        if (mode === 'day') cursor.setUTCDate(cursor.getUTCDate()+1);
        else if (mode === 'month') cursor.setUTCMonth(cursor.getUTCMonth()+1);
        else cursor.setUTCFullYear(cursor.getUTCFullYear()+1);
    }
    for (const [day, amounts] of Object.entries(daily)) {
        if (day < start || day > end) continue;
        const row = rows.get(keyFor(day));
        if (row) { row.income += amounts.income; row.expense += amounts.expense; }
    }
    return Array.from(rows.values());
}
