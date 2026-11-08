import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { calendarPeriod, calendarTitle } from '@shared/calendar';
import { sessionProgress, sessionTime, type ReminderSession } from '@shared/reminder-calendar';
import { getReminderHistory, type HistoryResult } from '@/src/services/reminder-history.service';
import { durationText } from '@shared/activity-duration';
import { taskActivityGroup, taskDueDay, type ActivityTask } from '@shared/activity-tasks';
import { activityGroupLabels, type ActivityGroup } from '@shared/activity-groups';

export type ReminderPopupTarget =
    | { day: Date; presetId?: string; group?: ActivityGroup; sessionId?: never }
    | { sessionId: string; day?: never; presetId?: never; group?: never };

function Action({ label, onPress }: { label: string; onPress: () => void }) {
    return <Pressable accessibilityRole="button" onPress={onPress} className="min-h-11 justify-center rounded-lg bg-background px-3">
        <Text className="font-semibold text-white">{label}</Text>
    </Pressable>;
}

function SessionDetails({ session, now }: { session: ReminderSession; now: number }) {
    const progress = sessionProgress(session, now);
    return <View className="gap-3">
        <Text className="text-text-secondary">
            {activityGroupLabels[session.group]} · {session.source === 'routine' ? 'Samsung Routine' : session.source === 'manual' ? 'Started manually' : 'Start source unavailable'}
        </Text>
        <Text className="text-text-primary">Started · {sessionTime(session.startedAt)}</Text>
        {session.status === 'running' ? <>
            <Text className="text-3xl font-bold text-white">{progress.remaining}</Text>
            <Text className="text-text-primary">Time remaining{progress.percent === null ? '' : ` · ${progress.percent}% complete`}</Text>
            {progress.percent !== null && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
                className="h-2 overflow-hidden rounded-full bg-background">
                <View className="h-full bg-accent" style={{ width: `${progress.percent}%` }} />
            </View>}
            <Text className="text-text-primary">Scheduled end · {sessionTime(session.plannedEndAt)}</Text>
        </> : <Text className="text-text-primary">{session.status === 'stopped' ? 'Stopped' : 'Completed'} · {sessionTime(session.endedAt)}</Text>}
        {session.startedAt !== null && session.endedAt !== null && <Text className="text-text-secondary">
            Elapsed · {durationText(Math.ceil(Math.max(0, session.endedAt - session.startedAt) / 60000)) || 'Under one minute'}
        </Text>}
        {!!session.message && <Text className="text-text-secondary">{session.message}</Text>}
    </View>;
}

export default function ReminderHistoryPopup({ target, initialSessions, tasks = [], showActivities = true, onClose }: {
    target: ReminderPopupTarget; initialSessions?: ReminderSession[]; tasks?: ActivityTask[]; showActivities?: boolean; onClose: () => void;
}) {
    const { day, presetId, group, sessionId } = target;
    const [taskId, setTaskId] = useState<string>();
    const [selectedId, setSelectedId] = useState<string>();
    const [result, setResult] = useState<HistoryResult>();
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        if (!showActivities) return;
        const { from, to } = calendarPeriod(day ?? new Date(), 'day');
        let current = true;
        let loading = false;
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const data = await getReminderHistory(from, to, sessionId ?? null);
                if (current) { setResult(data); setError(''); }
            } catch {
                if (current) setError('Could not refresh activity history.');
            } finally {
                loading = false;
            }
        };
        void load();
        const refresh = setInterval(load, 4000);
        const clock = setInterval(() => setNow(Date.now()), 1000);
        return () => { current = false; clearInterval(refresh); clearInterval(clock); };
    }, [day, sessionId, showActivities]);

    const sessions = (result?.sessions ?? initialSessions ?? []).filter(session =>
        (!presetId || session.presetId === presetId) && (!group || session.group === group));
    const selected = day ? sessions.find(session => session.id === selectedId) : result?.selected;
    const task = tasks.find(item => item.id === taskId);
    const ready = !showActivities || !!result || initialSessions !== undefined;
    const backToList = () => { setSelectedId(undefined); setTaskId(undefined); };
    const title = selected?.title ?? task?.title ?? (day ? calendarTitle(day, 'day') : 'Activity details');

    return <Modal visible transparent animationType="fade" onRequestClose={day && (selected || task) ? backToList : onClose}>
        <View className="flex-1 justify-end bg-black/60 px-3 pb-5 pt-16">
            <View accessibilityViewIsModal className="max-h-full w-full max-w-xl self-center rounded-2xl border border-border bg-background-surface p-4">
                <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
                    <Text accessibilityRole="header" className="flex-1 text-xl font-bold text-white">{title}</Text>
                    <Action label="Close" onPress={onClose} />
                </View>
                {day && (selected || task) && <View className="mb-3 self-start"><Action label="Back to day" onPress={backToList} /></View>}
                <ScrollView key={selected?.id ?? task?.id ?? 'sessions'} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
                    {!!error && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
                    {selected ? <SessionDetails session={selected} now={now} /> : task ? <>
                        <Text className="text-text-primary">{task.status.replace(/_/g, ' ')} · {task.priority} priority</Text>
                        <Text className="text-text-secondary">Due {taskDueDay(task.dueDate)}</Text>
                        <Text className="text-text-secondary">{[task.colleague, task.jiraKey].filter(Boolean).join(' · ')}</Text>
                        {!!task.description && <Text className="text-text-primary">{task.description}</Text>}
                    </> : <>
                        {!ready && !error && <Text className="text-text-secondary">Loading activities…</Text>}
                        {day && ready && (!showActivities || sessions.length === 0) && tasks.length === 0 && <Text className="text-text-secondary">No items on this day.</Text>}
                        {day && tasks.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => setTaskId(item.id)}
                            className="gap-1 rounded-xl border border-border bg-background p-3">
                            <Text className="font-semibold text-white">{item.title}</Text>
                            <Text className="text-text-secondary">Task · {activityGroupLabels[taskActivityGroup(item)]}</Text>
                        </Pressable>)}
                        {!day && ready && <Text className="text-text-secondary">This activity session is unavailable.</Text>}
                        {day && showActivities && sessions.map(session => <Pressable key={session.id} accessibilityRole="button"
                            onPress={() => setSelectedId(session.id)} className="gap-1 rounded-xl border border-border bg-background p-3">
                            <Text className="font-semibold text-white">{session.title}</Text>
                            <Text className="text-xs text-text-secondary">{activityGroupLabels[session.group]}</Text>
                            <Text className="text-text-secondary">
                                {session.status === 'running' ? `${sessionProgress(session, now).remaining} left` : session.status === 'stopped' ? 'Stopped' : 'Completed'}
                                {' · '}{sessionTime(session.startedAt ?? session.recordedAt)}
                            </Text>
                        </Pressable>)}
                    </>}
                </ScrollView>
            </View>
        </View>
    </Modal>;
}
