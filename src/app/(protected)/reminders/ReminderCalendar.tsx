'use client';

import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
    calendarModes, calendarPeriod, calendarTitle, dayStart, movePeriod, sessionProgress, sessionsOnDay, sessionTime, weekdays,
    type CalendarMode, type ReminderSession,
} from '../../../../mobile-app/src/lib/reminder-calendar';

const panel = 'rounded-xl border border-border bg-secondary p-4 sm:p-6';
const button = 'min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background-muted';

function Detail({ session, now }: { session: ReminderSession; now: number }) {
    const progress = sessionProgress(session, now);
    const lastLabel = session.status === 'running' ? 'Scheduled end' : session.status === 'stopped' ? 'Stopped' : 'Completed';
    return <section aria-label="Selected reminder" className={panel}>
        <h2 className="text-lg font-semibold">{session.title}</h2>
        <p className="mt-1 text-sm text-text-secondary">
            {session.source === 'routine' ? 'Samsung Routine' : session.source === 'manual' ? 'Started manually' : 'Start source unavailable'}
        </p>
        {session.status === 'running' && <div className="mt-4">
            <p className="text-3xl font-semibold tabular-nums">{progress.remaining}</p>
            <p className="text-sm text-text-secondary">
                {progress.due ? 'Waiting for the phone to report completion' : 'Time remaining'}
                {progress.percent !== null && ` · ${progress.percent}% complete`}
            </p>
            {progress.percent !== null && <progress className="mt-2 w-full accent-accent" aria-label="Countdown progress"
                max={100} value={progress.percent} />}
        </div>}
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm text-text-secondary">Started</dt><dd>{sessionTime(session.startedAt)}</dd></div>
            <div><dt className="text-sm text-text-secondary">{lastLabel}</dt>
                <dd>{sessionTime(session.status === 'running' ? session.plannedEndAt : session.endedAt)}</dd></div>
        </dl>
        {!!session.message && <p className="mt-4 break-words text-sm text-text-secondary">{session.message}</p>}
    </section>;
}

export default function ReminderCalendar() {
    const [mode, setMode] = useState<CalendarMode>('month');
    const [date, setDate] = useState(() => dayStart(new Date()));
    const [selectedId, setSelectedId] = useState<string>();
    const [data, setData] = useState<{ sessions: ReminderSession[]; truncated: boolean }>();
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now);
    const { from, to, days } = useMemo(() => calendarPeriod(date, mode), [date, mode]);
    const fromTime = from.getTime();
    const toTime = to.getTime();

    useEffect(() => {
        const controller = new AbortController();
        let loading = false;
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const query = new URLSearchParams({ from: new Date(fromTime).toISOString(), to: new Date(toTime).toISOString() });
                const response = await authenticatedFetch('/api/reminders?' + query, { signal: controller.signal });
                if (!response.ok) throw new Error('Could not load reminder history.');
                const body = await response.json();
                if (!controller.signal.aborted) { setData(body); setError(''); }
            } catch (error) {
                if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load reminder history.');
            } finally {
                loading = false;
            }
        };
        setData(undefined);
        void load();
        const refresh = window.setInterval(load, 8000);
        return () => { controller.abort(); window.clearInterval(refresh); };
    }, [fromTime, toTime]);

    useEffect(() => {
        const tick = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(tick);
    }, []);

    const sessions = data?.sessions ?? [];
    const selected = sessions.find(session => session.id === selectedId);
    const visible = sessionsOnDay(sessions, date);
    const selectDay = (day: Date) => { setDate(day); setSelectedId(undefined); };

    return <main className="mx-auto grid w-full max-w-5xl gap-5 text-text-primary">
        <header>
            <h1 className="text-3xl font-semibold">Reminders</h1>
            <p className="mt-1 text-text-secondary">Countdowns and history synced from your Android app.</p>
        </header>
        {!!error && <p role="alert" className="text-red-500">{error}</p>}
        <section aria-label="Reminder calendar" className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2" aria-label="Calendar view">
                    {calendarModes.map(value => <button type="button" className={button + ' capitalize aria-pressed:bg-primary'}
                        key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>)}
                </div>
                <div className="flex gap-2">
                    <button type="button" className={button} onClick={() => selectDay(movePeriod(date, mode, -1))}>Previous</button>
                    <button type="button" className={button} onClick={() => selectDay(dayStart(new Date()))}>Today</button>
                    <button type="button" className={button} onClick={() => selectDay(movePeriod(date, mode, 1))}>Next</button>
                </div>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{calendarTitle(date, mode)}</h2>
            {mode !== 'day' && <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-2">
                {weekdays.map(day => <div key={day} className="text-center text-xs text-text-secondary">{day}</div>)}
                {days.map(day => {
                    const count = sessionsOnDay(sessions, day).length;
                    return <button type="button" key={day.getTime()} onClick={() => selectDay(day)}
                        aria-pressed={day.getTime() === date.getTime()} aria-label={`${calendarTitle(day, 'day')}, ${count} reminders`}
                        className="grid min-h-12 place-items-center rounded-lg border border-border p-1 text-sm hover:bg-background-muted aria-pressed:bg-primary sm:p-2">
                        <span>{day.getDate()}</span><span className="text-xs text-text-secondary">{count || '\u00a0'}</span>
                    </button>;
                })}
            </div>}
            {data?.truncated && <p className="mt-3 text-sm text-text-secondary">This range has more than 2,000 sessions. Choose a shorter view to see more.</p>}
        </section>
        {selected && <Detail session={selected} now={now} />}
        <section className={panel}>
            <h2 className="text-lg font-semibold">{calendarTitle(date, 'day')}</h2>
            {!data && !error && <p className="mt-2 text-text-secondary">Loading reminders…</p>}
            {!!data && !visible.length && <p className="mt-2 text-text-secondary">No reminder sessions on this day.</p>}
            <ul className="mt-3 grid gap-2">
                {visible.map(session => <li key={session.id}>
                    <button type="button" aria-pressed={selectedId === session.id} onClick={() => setSelectedId(session.id)}
                        className={button + ' grid w-full gap-1 text-left aria-pressed:bg-primary'}>
                        <span className="break-words font-semibold">{session.title}</span>
                        <span className="text-text-secondary">
                            {session.status === 'running' ? `${sessionProgress(session, now).remaining} left` : session.status === 'stopped' ? 'Stopped' : 'Completed'}
                            {' · '}{sessionTime(session.startedAt ?? session.recordedAt)}
                        </span>
                    </button>
                </li>)}
            </ul>
        </section>
    </main>;
}
