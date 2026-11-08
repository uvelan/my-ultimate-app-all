export const calendarModes = ['week', 'month'] as const;
export type CalendarMode = (typeof calendarModes)[number];
type CalendarPeriod = CalendarMode | 'day';
type WeekStart = 0 | 1;

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calendarWeekdays(weekStartsOn: WeekStart = 1) {
    return weekStartsOn === 0 ? weekdays : [...weekdays.slice(1), weekdays[0]];
}

export function dayStart(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function weekStart(date: Date, weekStartsOn: WeekStart = 1) {
    return addDays(date, -((date.getDay() - weekStartsOn + 7) % 7));
}

export function calendarPeriod(date: Date, mode: CalendarPeriod, weekStartsOn: WeekStart = 1) {
    const first = mode === 'month' ? new Date(date.getFullYear(), date.getMonth(), 1) : dayStart(date);
    const from = mode === 'day' ? first : weekStart(first, weekStartsOn);
    const last = mode === 'month' ? new Date(date.getFullYear(), date.getMonth() + 1, 0) : first;
    const to = mode === 'day' ? addDays(first, 1) : addDays(weekStart(last, weekStartsOn), 7);
    const days: Date[] = [];
    for (let day = from; day < to; day = addDays(day, 1)) days.push(day);
    return { from, to, days };
}

export function movePeriod(date: Date, mode: CalendarMode, direction: -1 | 1) {
    return mode === 'month'
        ? new Date(date.getFullYear(), date.getMonth() + direction, 1)
        : addDays(date, direction * 7);
}

export function calendarTitle(date: Date, mode: CalendarPeriod) {
    if (mode === 'month') return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const label = (day: Date) => day.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (mode === 'week') {
        const first = weekStart(date);
        return `${label(first)} – ${label(addDays(first, 6))}`;
    }
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
