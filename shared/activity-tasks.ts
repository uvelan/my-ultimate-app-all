import { activityAreas, type ActivityGroup } from './activity-groups';

export type ActivityTask = {
    id: string;
    userId: string;
    assignedUserId?: string | null;
    title: string;
    description?: string | null;
    status: string;
    priority: string;
    area?: string | null;
    colleague?: string | null;
    jiraKey?: string | null;
    dueDate?: string | Date | null;
};

export function taskActivityGroup(task: ActivityTask): ActivityGroup {
    return activityAreas.find(area => area === task.area) ?? 'PERSONAL';
}

export function taskDueDay(value: ActivityTask['dueDate']) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const iso = date.toISOString();
    if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
    return activityDayKey(date);
}

export function activityDayKey(day: Date) {
    return [day.getFullYear(), day.getMonth() + 1, day.getDate()].map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
}

export function activityTaskCounts(tasks: ActivityTask[], group: ActivityGroup, now: Date) {
    const today = activityDayKey(now);
    const dueDates = tasks.filter(task => taskActivityGroup(task) === group && task.status !== 'DONE' && task.status !== 'ARCHIVED')
        .map(task => taskDueDay(task.dueDate));
    return { today: dueDates.filter(day => day === today).length, overdue: dueDates.filter(day => day && day < today).length };
}

export function jiraIssueUrl(base: string | undefined, key: string | null | undefined) {
    if (!base || !key || !/^[A-Z][A-Z0-9_]{0,31}-[1-9]\d{0,11}$/.test(key)) return undefined;
    try {
        const url = new URL(base);
        if (url.protocol !== 'https:' || url.username || url.password) return undefined;
        url.pathname = url.pathname.replace(/\/+$/, '') + '/browse/' + key;
        url.search = '';
        url.hash = '';
        return url.toString();
    } catch {
        return undefined;
    }
}
