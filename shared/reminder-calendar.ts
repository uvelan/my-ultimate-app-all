import { countdownText } from './activity-duration';
import { addDays, dayStart } from './calendar';
import type { ActivityGroup } from './activity-groups';

export type ReminderSession = {
    id: string;
    presetId: string;
    title: string;
    group: ActivityGroup;
    message: string;
    source: 'manual' | 'routine' | 'unknown';
    status: 'running' | 'completed' | 'stopped';
    recordedAt: number;
    startedAt: number | null;
    countdownStartedAt: number | null;
    plannedEndAt: number;
    endedAt: number | null;
};

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
    return { percent, remaining: countdownText(seconds), due: remaining === 0 };
}

export function sessionTime(value: number | null) {
    return value === null ? 'Unavailable' : new Date(value).toLocaleString([], {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
}
