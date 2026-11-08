'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { CalendarGrid } from '@/components/ui/CalendarGrid';
import { activityDayKey, taskDueDay, taskActivityGroup, type ActivityTask } from '@shared/activity-tasks';
import { durationText } from '@shared/activity-duration';
import { calendarModes, calendarPeriod, calendarTitle, calendarWeekdays, dayStart, movePeriod, type CalendarMode } from '@shared/calendar';
import { sessionProgress, sessionsOnDay, sessionTime, type ReminderSession } from '@shared/reminder-calendar';
import { activityGroupLabels, type ActivityGroup } from '@shared/activity-groups';

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
        {session.startedAt !== null && session.endedAt !== null && <p className="mt-4 text-sm text-text-secondary">Elapsed · {durationText(Math.ceil(Math.max(0, session.endedAt - session.startedAt) / 60000)) || 'Under one minute'}</p>}
        {!!session.message && <p className="mt-4 break-words text-sm text-text-secondary">{session.message}</p>}
    </section>;
}

export default function ActivityCalendar({ view, area, tasks = [], initialSessionId }: {
    view: 'details' | 'calendar'; area: ActivityGroup | 'ALL'; tasks?: ActivityTask[]; initialSessionId?: string;
}) {
    const [mode, setMode] = useState<CalendarMode>('month');
    const [itemType, setItemType] = useState<'all' | 'activities' | 'tasks'>('all');
    const [date, setDate] = useState(() => dayStart(new Date()));
    const [popup, setPopup] = useState<{ day: Date; sessionId?: string; taskId?: string } | undefined>(() => initialSessionId
        ? { day: dayStart(new Date()), sessionId: initialSessionId } : undefined);
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

    useEffect(() => {
        if (initialSessionId) setPopup({ day: dayStart(new Date()), sessionId: initialSessionId });
    }, [initialSessionId]);

    const exactRange = loaded?.from === fromTime && loaded.to === toTime;
    const coversRange = !!loaded && loaded.from <= fromTime && loaded.to >= toTime;
    const data = exactRange || (coversRange && !loaded?.truncated) ? loaded : undefined;
    const calendarSessions = data?.sessions;
    const filteredTasks = useMemo(() => itemType === 'activities' ? [] : tasks.filter(task => area === 'ALL' || taskActivityGroup(task) === area), [tasks, area, itemType]);
    const tasksByDay = useMemo(() => {
        const result = new Map<string, ActivityTask[]>();
        for (const task of filteredTasks) {
            const day = taskDueDay(task.dueDate);
            if (day) result.set(day, [...(result.get(day) ?? []), task]);
        }
        return result;
    }, [filteredTasks]);
    const counts = useMemo(() => {
        const sessions = itemType === 'tasks' ? [] : (calendarSessions ?? []).filter(session => area === 'ALL' || session.group === area);
        return new Map(days.map(day => [day.getTime(), sessionsOnDay(sessions, day).length + (tasksByDay.get(activityDayKey(day))?.length ?? 0)]));
    }, [calendarSessions, days, area, itemType, tasksByDay]);
    const exactDay = dayLoaded?.from === requestFrom && dayLoaded.to === requestTo ? dayLoaded : undefined;
    const dayData = popup && (exactDay ?? (data && !data.truncated ? data : undefined));
    const visible = popup && dayData && itemType !== 'tasks' ? sessionsOnDay(dayData.sessions, popup.day)
        .filter(session => area === 'ALL' || session.group === area) : [];
    const selected = visible.find(session => session.id === popup?.sessionId);
    const dueTasks = popup ? tasksByDay.get(activityDayKey(popup.day)) ?? [] : [];
    const selectedTask = dueTasks.find(task => task.id === popup?.taskId);
    const recent = (data?.sessions ?? []).filter(session => area === 'ALL' || session.group === area)
        .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.recordedAt - a.recordedAt).slice(0, 20);

    useEffect(() => {
        if (isOpen) popupHeading.current?.focus();
    }, [isOpen, selected?.id, selectedTask?.id]);

    const backToList = () => setPopup(current => current && { day: current.day });
    const close = () => setPopup(undefined);

    return <div className="grid gap-4">
        {!popup && !!error && <p role="alert" className="text-red-500">{error}</p>}
        {view === 'details' && <section aria-label="Recent activity runs" className={panel}>
            <h2 className="text-lg font-semibold">Recent runs</h2>
            {!data && !error && !popup && <p className="mt-3 text-text-secondary">Loading activity history…</p>}
            {data && !recent.length && <p className="mt-3 text-text-secondary">No runs in this calendar period.</p>}
            <div className="mt-3 grid gap-2">
                {recent.map(session => <button type="button" className={button + ' grid gap-1 text-left'} key={session.id}
                    onClick={() => setPopup({ day: dayStart(new Date(session.recordedAt)), sessionId: session.id })}>
                    <span className="font-semibold">{session.title}</span>
                    <span className="text-text-secondary">{session.status === 'running' ? sessionProgress(session, now).remaining + ' left' : session.status}
                        {' · '}{sessionTime(session.startedAt ?? session.recordedAt)}</span>
                </button>)}
            </div>
        </section>}
        {view === 'calendar' && <section aria-label="Activity calendar" className={panel}>
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
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Calendar item type">
                {(['all', 'activities', 'tasks'] as const).map(type => <button type="button" key={type}
                    className={button + ' capitalize aria-pressed:bg-primary'} aria-pressed={itemType === type}
                    onClick={() => setItemType(type)}>{type}</button>)}
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
        </section>}
        <dialog ref={dialog} aria-labelledby="activity-popup-title"
            className="m-auto max-h-[85dvh] w-11/12 max-w-lg overflow-y-auto sm:m-0 sm:ml-auto sm:h-dvh sm:max-h-none sm:rounded-none rounded-xl border border-border bg-secondary p-4 text-text-primary backdrop:bg-black/60 sm:p-6"
            onCancel={event => { event.preventDefault(); if (selected || selectedTask) backToList(); else close(); }}>
            {popup && <>
                <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 id="activity-popup-title" ref={popupHeading} tabIndex={-1} className="break-words text-xl font-semibold">
                        {selected?.title ?? selectedTask?.title ?? calendarTitle(popup.day, 'day')}
                    </h2>
                    <button type="button" className={button} onClick={close}>Close</button>
                </div>
                {!!error && <p role="alert" className="mb-3 text-red-500">{error}</p>}
                {selected ? <>
                    <button type="button" className={button + ' mb-3'} onClick={backToList}>Back to activities</button>
                    <Detail session={selected} now={now} />
                </> : selectedTask ? <>
                    <button type="button" className={button + ' mb-3'} onClick={backToList}>Back to day</button>
                    <p>{selectedTask.status.replaceAll('_', ' ')} · {selectedTask.priority} priority</p>
                    <p className="mt-2 text-text-secondary">Due {taskDueDay(selectedTask.dueDate)}</p>
                    <p className="mt-2 text-text-secondary">{[selectedTask.colleague, selectedTask.jiraKey].filter(Boolean).join(' · ')}</p>
                    {!!selectedTask.description && <p className="mt-2 whitespace-pre-wrap">{selectedTask.description}</p>}
                </> : <>
                    {itemType !== 'tasks' && !dayData && !error && <p className="text-text-secondary">Loading activities…</p>}
                    {(!!dayData || itemType === 'tasks') && !visible.length && !dueTasks.length && <p className="text-text-secondary">No items on this day.</p>}
                    {exactDay?.truncated && <p className="text-sm text-text-secondary">Showing the most recent 2,000 sessions on this day.</p>}
                    <ul className="grid gap-2">
                        {dueTasks.map(task => <li key={task.id}><button type="button" className={button + ' grid w-full text-left'}
                            onClick={() => setPopup({ day: popup.day, taskId: task.id })}>
                            <span className="font-semibold">{task.title}</span><span className="text-text-secondary">Task · {activityGroupLabels[taskActivityGroup(task)]}</span>
                        </button></li>)}
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
    </div>;
}
