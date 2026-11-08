export const durationModes = ['DAILY', 'WEEKLY'] as const;
export type DurationMode = (typeof durationModes)[number];
export const maxDailyMinutes = 5999;
export const maxWeeklyMinutes = 7 * 24 * 60;

export function durationMode(minutes: number, mode?: DurationMode | null): DurationMode {
    return mode ?? (minutes > maxDailyMinutes ? 'WEEKLY' : 'DAILY');
}

export function validDuration(minutes: number, mode?: DurationMode | null) {
    if (!Number.isInteger(minutes) || minutes < 1) return false;
    return mode === 'WEEKLY' ? minutes <= maxWeeklyMinutes && minutes % 60 === 0
        : minutes <= (mode === 'DAILY' ? maxDailyMinutes : maxWeeklyMinutes);
}

export function durationParts(minutes: number, mode: DurationMode) {
    return mode === 'WEEKLY'
        ? { days: Math.floor(minutes / 1440), hours: Math.floor(minutes / 60) % 24, minutes: 0 }
        : { days: 0, hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function durationText(minutes: number) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes / 60) % 24;
    const rest = minutes % 60;
    return [days && days + ' d', hours && hours + ' hr', rest && rest + ' min'].filter(Boolean).join(' ');
}

export function countdownText(seconds: number) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');
    return (days ? days + 'd ' : '') + (days || hours ? hours + ':' : '') + minutes + ':' + rest;
}
