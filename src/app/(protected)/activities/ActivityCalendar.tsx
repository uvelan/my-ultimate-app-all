'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { CalendarGrid } from '@/components/ui/CalendarGrid';
import ActivityPresets from './ActivityPresets';
import { calendarModes, calendarPeriod, calendarTitle, calendarWeekdays, dayStart, movePeriod, type CalendarMode } from '@shared/calendar';
import { sessionProgress, sessionsOnDay, sessionTime, type ReminderSession } from '@shared/reminder-calendar';
import { activityGroups, activityGroupLabels, type ActivityGroup } from '@shared/activity-groups';

const panel = 'rounded-xl border border-border bg-secondary p-4 sm:p-6';
const button = 'min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-background-muted';
const weekdays = calendarWeekdays();
type Snapshot = { from: number; to: number; sessions: ReminderSession[]; truncated: boolean };

function Detail({ session, now }: { session: ReminderSession; now: number }) {
    const progress = sessionProgress(session, now);
    const lastLabel = session.status === 'running' ? 'Scheduled end' : session.status === 'stopped' ? 'Stopped' : 'Completed';
    return <section aria-label="Activity details">
        <p className="mt-1 text-sm text-text-secondary">
            {activityGroupLabels[session.group]} · {session.source === 'routine' ? 'Samsung Routine' : session.source === 'manual' ? 'Started manually' : 'Start source unavailable'}
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

export default function ActivityCalendar() {
    const [mode, setMode] = useState<CalendarMode>('month');
    const [group, setGroup] = useState<ActivityGroup | 'ALL'>('ALL');
    const [date, setDate] = useState(() => dayStart(new Date()));
    const [popup, setPopup] = useState<{ day: Date; sessionId?: string }>();
    const [loaded, setLoaded] = useState<Snapshot>();
    const [dayLoaded, setDayLoaded] = useState<Snapshot>();
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now);
    const { from, to, days } = useMemo(() => calendarPeriod(date, mode), [date, mode]);
    const fromTime = from.getTime();
    const toTime = to.getTime();
    const dayPeriod = popup && calendarPeriod(popup.day, 'day');
    const requestFrom = dayPeriod?.from.getTime() ?? fromTime;
    const requestTo = dayPeriod?.to.getTime() ?? toTime;
    const isOpen = !!popup;
    const dialog = useRef<HTMLDialogElement>(null);
    const popupHeading = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        let loading = false;
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const query = new URLSearchParams({ from: new Date(requestFrom).toISOString(), to: new Date(requestTo).toISOString() });
                const response = await authenticatedFetch('/api/activities?' + query, { signal: controller.signal });
                if (!response.ok) throw new Error('Could not load activity history.');
                const body = await response.json();
                if (!controller.signal.aborted) {
                    const snapshot = { from: requestFrom, to: requestTo, sessions: body.sessions, truncated: body.truncated };
                    if (isOpen) setDayLoaded(snapshot);
                    else setLoaded(snapshot);
                    setError('');
                }
            } catch (error) {
                if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load activity history.');
            } finally {
                loading = false;
            }
        };
        setError('');
        void load();
        const refresh = window.setInterval(load, 8000);
        return () => { controller.abort(); window.clearInterval(refresh); };
    }, [requestFrom, requestTo, isOpen]);

    useEffect(() => {
        const tick = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(tick);
    }, []);

    useEffect(() => {
        const element = dialog.current;
        if (isOpen && element && !element.open) element.showModal();
        if (!isOpen && element?.open) element.close();
    }, [isOpen]);

    const exactRange = loaded?.from === fromTime && loaded.to === toTime;
    const coversRange = !!loaded && loaded.from <= fromTime && loaded.to >= toTime;
    const data = exactRange || (coversRange && !loaded?.truncated) ? loaded : undefined;
    const calendarSessions = data?.sessions;
    const counts = useMemo(() => {
        const sessions = (calendarSessions ?? []).filter(session => group === 'ALL' || session.group === group);
        return new Map(days.map(day => [day.getTime(), sessionsOnDay(sessions, day).length]));
    }, [calendarSessions, days, group]);
    const exactDay = dayLoaded?.from === requestFrom && dayLoaded.to === requestTo ? dayLoaded : undefined;
    const dayData = popup && (exactDay ?? (data && !data.truncated ? data : undefined));
    const visible = popup && dayData ? sessionsOnDay(dayData.sessions, popup.day)
        .filter(session => group === 'ALL' || session.group === group) : [];
    const selected = visible.find(session => session.id === popup?.sessionId);

    useEffect(() => {
        if (isOpen) popupHeading.current?.focus();
    }, [isOpen, selected?.id]);

    const backToList = () => setPopup(current => current && { day: current.day });
    const close = () => setPopup(undefined);

    return <main className="mx-auto grid w-full max-w-5xl gap-5 text-text-primary">
        <header>
            <h1 className="text-3xl font-semibold">Activity Tracker</h1>
            <p className="mt-1 text-text-secondary">Activity timers and history synced from your Android app.</p>
        </header>
        <ActivityPresets />
        {!popup && !!error && <p role="alert" className="text-red-500">{error}</p>}
        <section aria-label="Activity calendar" className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2" aria-label="Calendar view">
                    {calendarModes.map(value => <button type="button" className={button + ' capitalize aria-pressed:bg-primary'}
                        key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value}</button>)}
                </div>
                <div className="flex gap-2">
                    <button type="button" className={button} onClick={() => setDate(movePeriod(date, mode, -1))}>Previous</button>
                    <button type="button" className={button} onClick={() => setDate(dayStart(new Date()))}>Today</button>
                    <button type="button" className={button} onClick={() => setDate(movePeriod(date, mode, 1))}>Next</button>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Activity group">
                <button type="button" className={button + ' aria-pressed:bg-primary'} aria-pressed={group === 'ALL'}
                    onClick={() => setGroup('ALL')}>All groups</button>
                {activityGroups.map(value => <button type="button" key={value} className={button + ' aria-pressed:bg-primary'}
                    aria-pressed={group === value} onClick={() => setGroup(value)}>{activityGroupLabels[value]}</button>)}
            </div>
            <h2 className="mt-4 text-lg font-semibold">{calendarTitle(date, mode)}</h2>
            <CalendarGrid weekdays={weekdays} days={days} headerClassName="mt-3 mb-1 gap-1 sm:mb-2 sm:gap-2" dayClassName="gap-1 sm:gap-2"
                renderWeekday={day => <div className="text-center text-xs text-text-secondary">{day}</div>}
                renderDay={day => {
                    const count = counts.get(day.getTime()) ?? 0;
                    return <button type="button" onClick={() => setPopup({ day })}
                        aria-haspopup="dialog" aria-current={day.getTime() === dayStart(new Date(now)).getTime() ? 'date' : undefined}
                        aria-label={`${calendarTitle(day, 'day')}, ${count} activities`}
                        className="grid min-h-12 place-items-center rounded-lg border border-border p-1 text-sm hover:bg-background-muted aria-[current=date]:bg-primary sm:p-2">
                        <span>{day.getDate()}</span>
                        <span className="flex min-h-5 max-w-full items-center">
                            {count > 0 && <span className="min-w-5 rounded-full border border-[#64748b] bg-white px-1 text-center text-xs font-bold leading-4 tabular-nums text-[#141414]">{count}</span>}
                        </span>
                    </button>;
                }} />
            {!data && !error && !popup && <p className="mt-3 text-text-secondary">Loading activities…</p>}
            {data?.truncated && <p className="mt-3 text-sm text-text-secondary">This range has more than 2,000 sessions. Open a date for its activity list.</p>}
        </section>
        <dialog ref={dialog} aria-labelledby="activity-popup-title"
            className="m-auto max-h-[85dvh] w-11/12 max-w-lg overflow-y-auto rounded-xl border border-border bg-secondary p-4 text-text-primary backdrop:bg-black/60 sm:p-6"
            onCancel={event => { event.preventDefault(); if (selected) backToList(); else close(); }}>
            {popup && <>
                <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 id="activity-popup-title" ref={popupHeading} tabIndex={-1} className="break-words text-xl font-semibold">
                        {selected?.title ?? calendarTitle(popup.day, 'day')}
                    </h2>
                    <button type="button" className={button} onClick={close}>Close</button>
                </div>
                {!!error && <p role="alert" className="mb-3 text-red-500">{error}</p>}
                {selected ? <>
                    <button type="button" className={button + ' mb-3'} onClick={backToList}>Back to activities</button>
                    <Detail session={selected} now={now} />
                </> : <>
                    {!dayData && !error && <p className="text-text-secondary">Loading activities…</p>}
                    {!!dayData && !visible.length && <p className="text-text-secondary">No activity sessions on this day.</p>}
                    {exactDay?.truncated && <p className="text-sm text-text-secondary">Showing the most recent 2,000 sessions on this day.</p>}
                    <ul className="grid gap-2">
                        {visible.map(session => <li key={session.id}>
                            <button type="button" onClick={() => setPopup({ day: popup.day, sessionId: session.id })}
                                className={button + ' grid w-full gap-1 text-left'}>
                                <span className="break-words font-semibold">{session.title}</span>
                                <span className="text-xs text-text-secondary">{activityGroupLabels[session.group]}</span>
                                <span className="text-text-secondary">
                                    {session.status === 'running' ? `${sessionProgress(session, now).remaining} left` : session.status === 'stopped' ? 'Stopped' : 'Completed'}
                                    {' · '}{sessionTime(session.startedAt ?? session.recordedAt)}
                                </span>
                            </button>
                        </li>)}
                    </ul>
                </>}
            </>}
        </dialog>
    </main>;
}
