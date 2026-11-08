export type ReminderSession = {
    id: string;
    presetId: string;
    title: string;
    message: string;
    source: 'manual' | 'routine' | 'unknown';
    status: 'running' | 'completed' | 'stopped';
    recordedAt: number;
    startedAt: number | null;
    countdownStartedAt: number | null;
    plannedEndAt: number;
    endedAt: number | null;
};

export type CalendarMode = 'day' | 'week' | 'month';
export const calendarModes: CalendarMode[] = ['day', 'week', 'month'];
export const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayStart(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function weekStart(date: Date) {
    return addDays(date, -((date.getDay() + 6) % 7));
}

export function calendarPeriod(date: Date, mode: CalendarMode) {
    const first = mode === 'month' ? new Date(date.getFullYear(), date.getMonth(), 1) : dayStart(date);
    const from = mode === 'day' ? first : weekStart(first);
    const last = mode === 'month' ? new Date(date.getFullYear(), date.getMonth() + 1, 0) : first;
    const to = mode === 'day' ? addDays(first, 1) : addDays(weekStart(last), 7);
    const days: Date[] = [];
    for (let day = from; day < to; day = addDays(day, 1)) days.push(day);
    return { from, to, days };
}

export function movePeriod(date: Date, mode: CalendarMode, direction: -1 | 1) {
    return mode === 'month'
        ? new Date(date.getFullYear(), date.getMonth() + direction, 1)
        : addDays(date, direction * (mode === 'week' ? 7 : 1));
}

export function sessionsOnDay(sessions: ReminderSession[], date: Date) {
    const from = dayStart(date).getTime();
    const to = addDays(date, 1).getTime();
    return sessions.filter(session => session.recordedAt < to
        && Math.max(session.recordedAt, session.endedAt ?? session.plannedEndAt) >= from);
}

export function sessionProgress(session: ReminderSession, now: number) {
    const remaining = Math.max(0, session.plannedEndAt - now);
    const duration = session.countdownStartedAt === null ? 0 : session.plannedEndAt - session.countdownStartedAt;
    const percent = duration > 0 ? Math.floor(Math.min(100, Math.max(0, (1 - remaining / duration) * 100))) : null;
    const seconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');
    return { percent, remaining: hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`, due: remaining === 0 };
}

export function sessionTime(value: number | null) {
    return value === null ? 'Unavailable' : new Date(value).toLocaleString([], {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
}

export function calendarTitle(date: Date, mode: CalendarMode) {
    if (mode === 'month') return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const label = (day: Date) => day.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (mode === 'week') {
        const first = weekStart(date);
        return `${label(first)} – ${label(addDays(first, 6))}`;
    }
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
