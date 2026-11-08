'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, Tag, Task } from '@prisma/client';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskManager } from '@/components/tasks/TaskManager';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { activityAreas, activityGroupLabels, trackerTabs, type ActivityGroup, type TrackerTab } from '@shared/activity-groups';
import { activityTaskCounts } from '@shared/activity-tasks';
import { calendarPeriod } from '@shared/calendar';
import { sessionProgress, type ReminderSession } from '@shared/reminder-calendar';
import ActivityCalendar from './ActivityCalendar';
import ActivityPresets from './ActivityPresets';

type TaskData = { tasks: (Task & { project: Project | null; tags: Tag[] })[]; projects: Project[]; tags: Tag[]; viewerId: string; jiraBaseUrl?: string };
type Area = ActivityGroup | 'ALL';
const control = 'rounded-lg border border-border px-4 py-2 text-sm font-semibold aria-pressed:bg-accent aria-pressed:text-white';
const card = 'rounded-xl border border-border bg-secondary p-4';

export default function ActivityTracker() {
    const [tab, setTab] = useState<TrackerTab>('Dashboard');
    const [area, setArea] = useState<Area>('ALL');
    const [kind, setKind] = useState<'timer' | 'task'>('timer');
    const [data, setData] = useState<TaskData>();
    const [tasksError, setTasksError] = useState('');
    const [runs, setRuns] = useState<ReminderSession[]>();
    const [runsError, setRunsError] = useState(false);
    const [taskSaving, setTaskSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const [taskForm, setTaskForm] = useState(0);
    const [sessionId, setSessionId] = useState<string>();
    const attempt = useRef<{ payload: string; requestId: string } | undefined>(undefined);
    const loadTasks = useCallback(async (signal?: AbortSignal) => {
        try {
            const response = await authenticatedFetch('/api/activities/tasks', { signal });
            if (!response.ok) throw new Error();
            const body = await response.json() as TaskData;
            if (!signal?.aborted) { setData(body); setTasksError(''); }
        } catch {
            if (!signal?.aborted) setTasksError('Could not load tasks. Try again.');
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadTasks(controller.signal);
        return () => controller.abort();
    }, [tab, loadTasks]);

    useEffect(() => {
        if (tab !== 'Dashboard') return;
        const controller = new AbortController();
        const refresh = async () => {
            const { from, to } = calendarPeriod(new Date(), 'day');
            const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
            try {
                const response = await authenticatedFetch('/api/activities?' + query, { signal: controller.signal });
                if (!response.ok) throw new Error();
                const body = await response.json() as { sessions: ReminderSession[] };
                if (!controller.signal.aborted) {
                    setRuns(body.sessions.filter(session => session.status === 'running'));
                    setRunsError(false);
                }
            } catch {
                if (!controller.signal.aborted) setRunsError(true);
            }
        };
        void refresh();
        const poll = window.setInterval(refresh, 10000);
        return () => { controller.abort(); window.clearInterval(poll); };
    }, [tab]);

    function changeTab(next: TrackerTab) {
        setSessionId(undefined);
        setTab(next);
    }

    async function saveTask(fields: Record<string, unknown>) {
        if (taskSaving) return;
        const payload = JSON.stringify(fields);
        if (attempt.current?.payload !== payload) attempt.current = { payload, requestId: crypto.randomUUID() };
        setTaskSaving(true);
        setSaveError('');
        setSaveMessage('');
        try {
            const response = await authenticatedFetch('/api/activities/tasks', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource: 'tasks', data: { ...fields, requestId: attempt.current.requestId } }),
                signal: AbortSignal.timeout(20000),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not confirm the save. Try again.');
            attempt.current = undefined;
            setTaskForm(value => value + 1);
            setSaveMessage('Task saved.');
            void loadTasks();
        } catch (error) {
            setSaveError(error instanceof Error && error.name !== 'TimeoutError' && !(error instanceof TypeError)
                ? error.message : 'Could not confirm the save. Your draft is kept. Try again.');
        } finally {
            setTaskSaving(false);
        }
    }

    return <main className="mx-auto grid w-full max-w-6xl gap-5 text-text-primary">
        <header>
            <h1 className="text-3xl font-semibold">Activity Tracker</h1>
            <p className="mt-1 text-text-secondary">Tasks, timers, and activity history in one place.</p>
        </header>
        <nav aria-label="Activity Tracker views" className="flex flex-wrap gap-2 border-b border-border pb-3">
            {trackerTabs.map(view => <button key={view} type="button" className={control} aria-pressed={tab === view}
                onClick={() => changeTab(view)}>{view}</button>)}
        </nav>
        {tab !== 'Dashboard' && tab !== 'Tasks' && tab !== 'New Activity' && <div className="flex flex-wrap gap-2" aria-label="Activity area">
            {(['ALL', ...activityAreas, 'REMINDERS'] as const).map(group => <button key={group} type="button" className={control}
                aria-pressed={group === area} onClick={() => { setArea(group); setSessionId(undefined); }}>
                {group === 'ALL' ? 'All areas' : activityGroupLabels[group]}
            </button>)}
        </div>}
        {tasksError && ['Dashboard', 'Tasks', 'Calendar', 'New Activity'].includes(tab) && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            {tasksError}<button type="button" className={control} onClick={() => void loadTasks()}>Retry</button>
        </div>}
        {tab === 'Dashboard' && <>
            <section aria-label="Activity areas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {activityAreas.map(group => {
                    const counts = data && activityTaskCounts(data.tasks, group, new Date());
                    return <button type="button" key={group} className={card + ' grid gap-2 text-left hover:border-accent'}
                        onClick={() => { setArea(group); changeTab('Details'); }}>
                        <span className="text-lg font-semibold">{activityGroupLabels[group]}</span>
                        <span className="text-sm text-text-secondary">{counts ? counts.today + ' due today · ' + counts.overdue + ' overdue' : 'Task counts unavailable'}</span>
                        <span className="text-sm text-text-secondary">{runs ? runs.filter(run => run.group === group).length + ' running' : 'Loading timers'}</span>
                    </button>;
                })}
            </section>
            <section className={card}>
                <h2 className="font-semibold">Running timers</h2>
                {runsError && <p role="status" className="mt-2 text-sm text-text-secondary">Timer sync is unavailable. Checking again shortly.</p>}
                {runs?.length === 0 && <p className="mt-2 text-sm text-text-secondary">No timers running today.</p>}
                <div className="mt-2 grid gap-2">
                    {runs?.map(run => <button type="button" className={control + ' text-left'} key={run.id} onClick={() => {
                        setArea('ALL'); setTab('Details'); setSessionId(run.id);
                    }}>{run.title} · {sessionProgress(run, Date.now()).remaining} left</button>)}
                </div>
            </section>
        </>}
        {tab === 'Details' && <>
            <ActivityPresets view="details" area={area} tasks={data?.tasks} />
            <ActivityCalendar view="details" area={area} initialSessionId={sessionId} />
        </>}
        {tab === 'Calendar' && <ActivityCalendar view="calendar" area={area} tasks={data?.tasks} />}
        {tab === 'Tasks' && (data ? <TaskManager key={area} embedded initialArea={area === 'ALL' || area === 'REMINDERS' ? 'all' : area}
            initialTasks={data.tasks} projects={data.projects} tags={data.tags} viewerId={data.viewerId} jiraBaseUrl={data.jiraBaseUrl} onChanged={() => void loadTasks()} /> : !tasksError && <p>Loading tasks…</p>)}
        {tab === 'New Activity' && <>
            <div className="flex flex-wrap gap-2" aria-label="What to create">
                <button type="button" className={control} aria-pressed={kind === 'timer'} onClick={() => setKind('timer')}>Activity or Reminder</button>
                <button type="button" className={control} aria-pressed={kind === 'task'} onClick={() => setKind('task')}>Task</button>
            </div>
            {kind === 'timer' ? <ActivityPresets view="new" area={area} tasks={data?.tasks} /> : <>
                {saveMessage && <p role="status" className="text-emerald-600">{saveMessage}</p>}
                {saveError && <p role="alert" className="text-red-500">{saveError}</p>}
                <TaskForm key={taskForm} embedded initialArea={area === 'ALL' || area === 'REMINDERS' ? 'PERSONAL' : area}
                    projects={data?.projects ?? []} tags={data?.tags ?? []} onSubmit={saveTask} isLoading={taskSaving}
                    onCancel={() => { setSaveError(''); setKind('timer'); }} />
            </>}
        </>}
    </main>;
}
