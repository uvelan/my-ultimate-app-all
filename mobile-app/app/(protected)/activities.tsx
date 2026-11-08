import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, AppState, NativeModules, PermissionsAndroid, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import ReminderHistoryPopup from '@/src/components/ReminderHistoryPopup';
import { onReminderPresetsSynced, syncReminderPresets } from '@/src/services/reminder-presets.service';
import type { ReminderPresetFields } from '@shared/reminder-presets';
import { countdownText, durationMode, durationModes, durationParts, durationText, validDuration, type DurationMode } from '@shared/activity-duration';
import { activityTaskCounts, taskActivityGroup, type ActivityTask } from '@shared/activity-tasks';
import { calendarPeriod } from '@shared/calendar';
import { sessionTime, type ReminderSession } from '@shared/reminder-calendar';
import { getReminderHistory } from '@/src/services/reminder-history.service';
import { api } from '@/src/lib/api-client';
import { ActivityHistory } from './activity-history';
import { TaskWorkspace } from './tasks';
import { activityAreas, activityGroups, trackerTabs, type TrackerTab, activityGroupLabels, type ActivityGroup } from '@shared/activity-groups';

type Preset = ReminderPresetFields & {
    id: string;
    operationId: string;
};
type ReminderRun = {
    id: string;
    sessionId: string;
    presetId: string;
    title: string;
    group: ActivityGroup;
    message: string;
    extensionMinutes: number;
    intervalMinutes: number;
    finished: boolean;
    endsAt: number;
};
type ReminderState = {
    presets: Preset[];
    runs: ReminderRun[];
    notificationsEnabled: boolean;
    progressNotificationsEnabled: boolean;
    exactAlarmsEnabled: boolean;
    vibrationEnabled: boolean;
    pendingPresetSync: number;
    presetSyncConflicts: number;
};
type ShortcutState = { limit: number; published: string[]; retry: boolean };
type ReminderModule = {
    getState(): Promise<ReminderState>;
    saveActivity(id: string, title: string, message: string, duration: number, extension: number, interval: number, routine: boolean, group: ActivityGroup, durationMode: DurationMode, kind: 'TIMER' | 'REMINDER', linkedTaskId: string | null, operationId: string): Promise<void>;
    deletePreset(id: string): Promise<void>;
    syncShortcuts(): Promise<ShortcutState>;
    start(id: string): Promise<boolean>;
    stop(id: string): Promise<void>;
    extend(id: string): Promise<void>;
    openSettings(kind: 'notifications' | 'alarms' | 'vibration' | 'progress'): Promise<void>;
};
type Draft = {
    id: string;
    operationId: string;
    group: ActivityGroup;
    title: string;
    message: string;
    days: string;
    hours: string;
    minutes: string;
    durationMode: DurationMode;
    kind: 'TIMER' | 'REMINDER';
    linkedTaskId: string | null;
    extension: number;
    atIntervals: boolean;
    interval: string;
    routineEnabled: boolean;
};

const reminder: ReminderModule | undefined = Platform.OS === 'android' ? NativeModules.RoutineReminder : undefined;
const inputClass = 'mt-2 rounded-lg border border-border bg-background px-3 py-3 text-base text-text-primary';
const cardClass = 'gap-3 rounded-xl bg-background-surface p-4';
const extensions = [5, 10, 15, 30];

function Action({ label, onPress, disabled = false, secondary = false, selected }: {
    label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean;
}) {
    return (
        <TouchableOpacity
            accessibilityRole={selected === undefined ? 'button' : 'radio'}
            accessibilityState={{ disabled, checked: selected }}
            disabled={disabled}
            onPress={onPress}
            className={`min-h-11 justify-center rounded-lg px-4 py-3 ${secondary && !selected ? 'bg-background border border-border' : 'bg-accent'} ${disabled ? 'opacity-50' : ''}`}
        >
            <Text className="font-semibold text-white">{label}</Text>
        </TouchableOpacity>
    );
}

function NumberField({ label, value, onChange, maxLength = 2 }: {
    label: string; value: string; onChange: (value: string) => void; maxLength?: number;
}) {
    return <View className="flex-1">
        <Text className="text-text-secondary">{label}</Text>
        <TextInput accessibilityLabel={label} className={inputClass} keyboardType="number-pad" maxLength={maxLength}
            value={value} onChangeText={value => onChange(value.replace(/\D/g, ''))} />
    </View>;
}

export default function ActivitiesScreen() {
    const router = useRouter();
    const [tab, setTab] = useState<TrackerTab>('Dashboard');
    const [area, setArea] = useState<ActivityGroup | 'ALL'>('ALL');
    const [creation, setCreation] = useState<'timer' | 'task'>('timer');
    const [tasks, setTasks] = useState<ActivityTask[]>();
    const [taskError, setTaskError] = useState(false);
    const [recent, setRecent] = useState<ReminderSession[]>();
    const [historyError, setHistoryError] = useState(false);
    const [saved, setSaved] = useState('');
    const [state, setState] = useState<ReminderState>();
    const [shortcuts, setShortcuts] = useState<ShortcutState>();
    const [shortcutError, setShortcutError] = useState(false);
    const [draft, setDraft] = useState<Draft>();
    const [detailsId, setDetailsId] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [syncError, setSyncError] = useState('');
    const [now, setNow] = useState(Date.now);

    const refresh = useCallback(async () => {
        if (!reminder) return;
        setState(await reminder.getState());
        setNow(Date.now());
        setError('');
    }, []);

    const syncShortcuts = useCallback(async () => {
        if (!reminder) return;
        try {
            setShortcuts(await reminder.syncShortcuts());
            setShortcutError(false);
        } catch {
            setShortcutError(true);
        }
    }, []);

    const reload = useCallback(() => {
        void refresh().catch(err => setError(err.message || 'Could not load reminders.'));
    }, [refresh]);

    useFocusEffect(useCallback(() => {
        if (!reminder) return;
        const update = () => { reload(); void syncShortcuts(); };
        const unsubscribe = onReminderPresetsSynced(update);
        const resume = () => { update(); void syncReminderPresets().catch(() => {}); };
        resume();
        const change = AppState.addEventListener('change', status => { if (status === 'active') resume(); });
        const focus = AppState.addEventListener('focus', reload);
        return () => { unsubscribe(); change.remove(); focus.remove(); };
    }, [reload, syncShortcuts]));

    const loadTasks = useCallback(async (signal?: AbortSignal) => {
        try {
            const result = await api.get<{ tasks: ActivityTask[] }>('/activities/tasks', { signal });
            if (!signal?.aborted) { setTasks(result.data.tasks); setTaskError(false); }
        } catch { if (!signal?.aborted) setTaskError(true); }
    }, []);

    useFocusEffect(useCallback(() => {
        if (tab === 'Tasks') return;
        const controller = new AbortController();
        void loadTasks(controller.signal);
        return () => controller.abort();
    }, [tab, loadTasks]));

    useFocusEffect(useCallback(() => {
        if (tab !== 'Details' || !reminder) return;
        let current = true;
        const { from, to } = calendarPeriod(new Date(), 'month');
        const loadHistory = async () => {
            try {
                const result = await getReminderHistory(from, to, null);
                if (current) { setRecent(result.sessions); setHistoryError(false); }
            } catch { if (current) setHistoryError(true); }
        };
        void loadHistory();
        const poll = setInterval(loadHistory, 8000);
        return () => { current = false; clearInterval(poll); };
    }, [tab]));

    const runs = state?.runs;
    useEffect(() => {
        const running = runs?.filter(run => !run.finished);
        if (!running?.length) return;
        const nextEnd = Math.min(...running.map(run => run.endsAt));
        const tick = setInterval(() => {
            const time = Date.now();
            setNow(time);
            if (time >= nextEnd) {
                clearInterval(tick);
                reload();
            }
        }, 1000);
        return () => clearInterval(tick);
    }, [runs, reload]);

    async function act(operation: () => Promise<unknown>, saved = false) {
        setBusy(true);
        setError('');
        try {
            await operation();
            if (saved) { setDraft(undefined); setSaved('Activity saved on this phone.'); }
            await refresh();
            if (saved) {
                void syncShortcuts();
                void syncReminderPresets().catch(() => {});
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update the reminder.');
        } finally {
            setBusy(false);
        }
    }

    function edit(preset?: Preset) {
        setError('');
        setSaved('');
        setCreation('timer');
        setTab('New Activity');
        const duration = preset?.durationMinutes ?? 45;
        const mode = durationMode(duration, preset?.durationMode);
        const parts = durationParts(duration, mode);
        const routineCount = state?.presets.filter(item => item.routineEnabled).length ?? 0;
        setDraft({
            id: preset?.id ?? '',
            operationId: preset?.operationId ?? '',
            group: preset?.group ?? (area === 'ALL' || area === 'REMINDERS' ? 'PERSONAL' : area),
            title: preset?.title ?? '',
            message: preset?.message ?? '',
            days: String(parts.days), hours: String(parts.hours), minutes: String(parts.minutes),
            durationMode: mode, kind: preset?.kind ?? 'TIMER', linkedTaskId: preset?.linkedTaskId ?? null,
            extension: preset?.extensionMinutes ?? 10,
            atIntervals: !!preset?.intervalMinutes,
            interval: String(preset?.intervalMinutes || 10),
            routineEnabled: preset?.routineEnabled ?? (shortcuts ? routineCount < shortcuts.limit : true),
        });
    }

    function updateDraft(change: Partial<Draft>) {
        setDraft(current => current && { ...current, ...change });
    }

    function save() {
        if (!reminder || !draft) return;
        const duration = Number(draft.days) * 1440 + Number(draft.hours) * 60 + Number(draft.minutes);
        const interval = draft.atIntervals ? Number(draft.interval) : 0;
        if (!draft.title.trim()) {
            setError('Enter an activity name.');
            return;
        }
        if (!validDuration(duration, draft.durationMode) || (draft.durationMode === 'WEEKLY' ? Number(draft.hours) > 23 : Number(draft.minutes) > 59)) {
            setError('Enter a valid countdown. Weekly durations must be between 1 hour and 7 days.');
            return;
        }
        if (draft.atIntervals && (interval < 1 || interval >= duration)) {
            setError('Enter an interval of at least 1 minute and shorter than the countdown.');
            return;
        }
        void act(() => reminder.saveActivity(
            draft.id, draft.title.trim(), draft.message.trim() || draft.title.trim() + ' is complete.', duration, draft.extension, interval, draft.routineEnabled, draft.group, draft.durationMode, draft.kind, draft.linkedTaskId, draft.operationId,
        ), true);
    }

    function remove(preset: Preset) {
        if (!reminder) return;
        Alert.alert('Delete activity?', preset.title, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void act(() => reminder.deletePreset(preset.id), true) },
        ]);
    }

    async function enableNotifications() {
        if (!reminder) return;
        if (Number(Platform.Version) >= 33) {
            const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
            if (!await PermissionsAndroid.check(permission)) {
                const result = await PermissionsAndroid.request(permission);
                if (result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return;
            }
        }
        await reminder.openSettings('notifications');
    }

    const ready = !!state?.notificationsEnabled && state.exactAlarmsEnabled;

    function runStatus(run: ReminderRun) {
        return <>
            <Text className="text-2xl font-bold text-white">
                {run.finished ? 'Time’s up' : countdownText(Math.max(0, Math.ceil((run.endsAt - now) / 1000)))}
            </Text>
            <Text className="text-text-secondary">{run.finished ? run.message : 'Time remaining'}</Text>
        </>;
    }

    function runActions(run: ReminderRun) {
        if (!reminder) return null;
        const canExtend = ready && (!run.intervalMinutes || run.intervalMinutes >= run.extensionMinutes || state?.progressNotificationsEnabled);
        return <>
            <Action secondary label="Details" onPress={() => setDetailsId(run.sessionId)} />
            <Action secondary label="Stop" disabled={busy} onPress={() => void act(() => reminder.stop(run.id))} />
            {run.finished && <Action label={`Extend ${run.extensionMinutes} min`} disabled={busy || !canExtend} onPress={() => void act(() => reminder.extend(run.id))} />}
        </>;
    }

    function changeTab(next: TrackerTab) {
        setError('');
        if (next === 'New Activity' && !draft && !saved && creation === 'timer') edit();
        else setTab(next);
    }

    const initialArea = area === 'ALL' || area === 'REMINDERS' ? 'all' : area;
    const activeRuns = state?.runs.filter(run => !run.finished) ?? [];
    const recentRuns = recent?.filter(run => area === 'ALL' || run.group === area)
        .sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 20);

    return (
        <View className="flex-1 bg-background">
            <View className="flex-row items-center px-5 pb-4 pt-12">
                <SidebarToggle />
                <Text accessibilityRole="header" className="ml-3 text-2xl font-bold text-white">Activity Tracker</Text>
            </View>
            <View className="flex-row flex-wrap gap-2 px-5 pb-3">
                {trackerTabs.map(view => <Action key={view} label={view} secondary selected={tab === view} disabled={busy} onPress={() => changeTab(view)} />)}
            </View>
            {tab === 'New Activity' && <View className="flex-row flex-wrap gap-2 px-5 pb-3">
                <Action label="Activity or Reminder" secondary selected={creation === 'timer'} onPress={() => { setCreation('timer'); if (!draft && !saved) edit(); }} />
                <Action label="Task" secondary selected={creation === 'task'} onPress={() => setCreation('task')} />
            </View>}
            {tab === 'Tasks' ? <TaskWorkspace key={initialArea} embedded initialArea={initialArea} />
            : tab === 'Calendar' ? <ActivityHistory embedded initialArea={area} tasks={tasks} taskError={taskError} onRetryTasks={() => void loadTasks()} />
            : tab === 'New Activity' && creation === 'task' ? <TaskWorkspace embedded createOnly initialArea={initialArea} onFinish={() => setTab('Tasks')} />
            : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
                {tab === 'Dashboard' && <>
                    {taskError && <View className={cardClass}>
                        <Text className="text-red-400">Could not refresh tasks.</Text>
                        <Action label="Retry tasks" secondary onPress={() => void loadTasks()} />
                    </View>}
                    <View className="flex-row flex-wrap gap-3">
                        {activityAreas.map(group => {
                            const counts = tasks && activityTaskCounts(tasks, group, new Date());
                            return <TouchableOpacity key={group} accessibilityRole="button" style={{ flexBasis: '46%', flexGrow: 1 }}
                                className={cardClass} onPress={() => { setArea(group); setTab('Details'); }}>
                                <Text className="text-lg font-bold text-white">{activityGroupLabels[group]}</Text>
                                <Text className="text-text-secondary">{counts ? counts.today + ' due today · ' + counts.overdue + ' overdue' : 'Task counts unavailable'}</Text>
                                <Text className="text-text-secondary">{activeRuns.filter(run => run.group === group).length} running</Text>
                            </TouchableOpacity>;
                        })}
                    </View>
                    {activeRuns.length > 0 && <View className={cardClass}>
                        <Text className="text-lg font-bold text-white">Running timers</Text>
                        {activeRuns.map(run => <View key={run.id} className="gap-2">
                            <Text className="text-text-primary">{run.title}</Text>{runStatus(run)}
                            <View className="flex-row flex-wrap gap-2">{runActions(run)}</View>
                        </View>)}
                    </View>}
                    {state && !ready && <View className={cardClass}>
                        <Text className="text-text-primary">Timer permissions need attention.</Text>
                        <Action label="Open timer settings" secondary onPress={() => { setArea('ALL'); setTab('Details'); }} />
                    </View>}
                </>}
                {!reminder && <Text className="text-text-secondary">Activity timers are available in the Android build.</Text>}
                {reminder && !state && <Action label={error ? 'Retry' : 'Loading…'} onPress={reload} disabled={!error} />}
                {!!error && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
                {tab === 'Details' && <View className="flex-row flex-wrap gap-2">
                    {(['ALL', ...activityGroups] as const).map(group => <Action key={group} secondary
                        label={group === 'ALL' ? 'All areas' : activityGroupLabels[group]} selected={area === group} onPress={() => setArea(group)} />)}
                </View>}
                {reminder && state && tab !== 'Dashboard' && <>
                    {tab === 'Details' && <View className="gap-2">
                        {state.pendingPresetSync > 0 && <Text className="text-text-secondary">{state.pendingPresetSync} activity changes waiting to sync.</Text>}
                        {state.presetSyncConflicts > 0 && <Text className="text-text-secondary">A newer activity edit from another device was kept.</Text>}
                        {!!syncError && <Text accessibilityLiveRegion="polite" className="text-red-400">{syncError}</Text>}
                        <Action label="Sync activities" secondary onPress={() => {
                            setSyncError('');
                            void syncReminderPresets().then(reload).catch(() => setSyncError('Could not sync right now. Your activities are saved on this phone.'));
                        }} />
                    </View>}
                    {tab === 'New Activity' && !!saved && <Text accessibilityLiveRegion="polite" className="text-green-400">{saved}</Text>}
                    {tab === 'New Activity' && !draft && <Action label="Add another activity" onPress={() => edit()} disabled={busy} />}
                    {tab === 'New Activity' && draft && <View className={cardClass}>
                        <Text accessibilityRole="header" className="text-lg font-bold text-white">{draft.id ? 'Edit activity' : 'New activity'}</Text>
                        <View>
                            <Text className="text-text-primary">Activity name</Text>
                            <TextInput accessibilityLabel="Activity name" className={inputClass} maxLength={40} value={draft.title} onChangeText={title => updateDraft({ title })} />
                        </View>
                        <Text className="text-text-primary">Group</Text>
                        <View className="flex-row flex-wrap gap-2">
                            {(draft.group === 'REMINDERS' ? activityGroups : activityAreas).map(group => <Action key={group} label={activityGroupLabels[group]} secondary
                                selected={draft.group === group} onPress={() => updateDraft({ group, linkedTaskId: null })} />)}
                        </View>
                        <View className="flex-row flex-wrap gap-2">
                            <Action label="Timed Activity" secondary selected={draft.kind === 'TIMER'} onPress={() => updateDraft({ kind: 'TIMER' })} />
                            <Action label="Reminder" secondary selected={draft.kind === 'REMINDER'} onPress={() => updateDraft({ kind: 'REMINDER' })} />
                        </View>
                        {tasks?.some(task => taskActivityGroup(task) === draft.group) && <View className="gap-2">
                            <Text className="text-text-primary">Linked task (optional)</Text>
                            <Action label="No linked task" secondary selected={!draft.linkedTaskId} onPress={() => updateDraft({ linkedTaskId: null })} />
                            <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                                {tasks.filter(task => taskActivityGroup(task) === draft.group).map(task => <Action key={task.id} label={task.title}
                                    secondary selected={draft.linkedTaskId === task.id} onPress={() => updateDraft({ linkedTaskId: task.id })} />)}
                            </ScrollView>
                        </View>}
                        <View>
                            <Text className="text-text-primary">Countdown duration</Text>
                            <View className="mt-2 flex-row flex-wrap gap-2">
                                {durationModes.map(mode => <Action key={mode} label={mode === 'DAILY' ? 'Daily' : 'Weekly'}
                                    secondary selected={draft.durationMode === mode} onPress={() => {
                                        const parts = durationParts(mode === 'WEEKLY' ? 1440 : 45, mode);
                                        updateDraft({ durationMode: mode, days: String(parts.days), hours: String(parts.hours), minutes: String(parts.minutes) });
                                    }} />)}
                            </View>
                            <View className="mt-2 flex-row gap-3">
                                {draft.durationMode === 'WEEKLY' && <NumberField label="Days" value={draft.days} onChange={days => updateDraft({ days })} />}
                                <NumberField label="Hours" value={draft.hours} onChange={hours => updateDraft({ hours })} />
                                {draft.durationMode === 'DAILY' && <NumberField label="Minutes" value={draft.minutes} onChange={minutes => updateDraft({ minutes })} />}
                            </View>
                        </View>
                        <View>
                            <Text className="text-text-primary">Message when time is up</Text>
                            <TextInput accessibilityLabel="Message when time is up" className={inputClass} multiline maxLength={180} value={draft.message} onChangeText={message => updateDraft({ message })} />
                        </View>
                        <Text className="text-text-primary">Notifications</Text>
                        <View className="flex-row flex-wrap gap-2">
                            <Action label="At the end" secondary selected={!draft.atIntervals} onPress={() => updateDraft({ atIntervals: false })} />
                            <Action label="At intervals" secondary selected={draft.atIntervals} onPress={() => updateDraft({ atIntervals: true })} />
                        </View>
                        {draft.atIntervals && <>
                            <NumberField label="Notify every (minutes)" value={draft.interval} maxLength={5} onChange={interval => updateDraft({ interval })} />
                            <Text className="text-text-secondary">Progress notifications are silent. The final alert vibrates.</Text>
                        </>}
                        <Text className="text-text-primary">Extend by</Text>
                        <View className="flex-row flex-wrap gap-2">
                            {extensions.map(extension => <Action key={extension} label={`${extension} min`} secondary
                                selected={draft.extension === extension} onPress={() => updateDraft({ extension })} />)}
                        </View>
                        <View className="flex-row items-center justify-between gap-2">
                            <Text className="flex-1 text-text-primary">Show shortcut in Samsung Routines</Text>
                            <Switch accessibilityLabel="Show shortcut in Samsung Routines" value={draft.routineEnabled} onValueChange={routineEnabled => updateDraft({ routineEnabled })} />
                        </View>
                        <View className="flex-row flex-wrap gap-2">
                            <Action label={busy ? "Saving..." : "Save activity"} disabled={busy} onPress={save} />
                            <Action label="Cancel" secondary disabled={busy} onPress={() => { setDraft(undefined); setError(''); setTab('Details'); }} />
                        </View>
                    </View>}
                    {tab === 'Details' && <>
                        {activityGroups.filter(group => area === 'ALL' || area === group).map(group => {
                            const presets = state.presets.filter(preset => preset.group === group);
                            return <View key={group} className="gap-3">
                                <Text accessibilityRole="header" className="text-lg font-bold text-white">{activityGroupLabels[group]}</Text>
                                {!presets.length && <Text className="text-text-secondary">No activities yet.</Text>}
                                {presets.map(preset => {
                            const run = state.runs.find(item => item.presetId === preset.id);
                            const published = shortcuts?.published.includes(preset.id);
                            const canStart = ready && (!preset.intervalMinutes || state.progressNotificationsEnabled);
                            return <View key={preset.id} className={cardClass}>
                                <Text className="text-lg font-bold text-white">{run?.title ?? preset.title}</Text>
                                <Text className="text-text-secondary">
                                    {durationText(preset.durationMinutes)} · {preset.intervalMinutes ? `Notify every ${durationText(preset.intervalMinutes)}` : 'End alert only'}
                                </Text>
                                {preset.linkedTaskId && tasks?.some(task => task.id === preset.linkedTaskId) && <Text className="text-text-secondary">
                                    Linked task · {tasks.find(task => task.id === preset.linkedTaskId)?.title}
                                </Text>}
                                {preset.routineEnabled && <Text className="text-text-secondary">
                                    {published ? `Routine action “${preset.title}”` : 'Named Routine shortcut pending'}
                                </Text>}
                                {run && runStatus(run)}
                                <View className="flex-row flex-wrap gap-2">
                                    {run ? runActions(run) : <Action label="Start" disabled={busy || !canStart} onPress={() => void act(() => reminder.start(preset.id))} />}
                                    {!run && <Action secondary label="History" onPress={() => router.push({ pathname: '/activity-history', params: { presetId: preset.id } } as never)} />}
                                    <Action label="Edit" secondary disabled={busy} onPress={() => edit(preset)} />
                                    {!run && <Action label="Delete" secondary disabled={busy} onPress={() => remove(preset)} />}
                                </View>
                            </View>;
                                })}
                            </View>;
                        })}
                        {state.runs.filter(run => (area === 'ALL' || area === run.group) && !state.presets.some(preset => preset.id === run.presetId)).map(run => <View key={run.id} className={cardClass}>
                            <Text className="text-lg font-bold text-white">{run.title}</Text>
                            <Text className="text-text-secondary">{activityGroupLabels[run.group]}</Text>
                            {runStatus(run)}
                            <View className="flex-row flex-wrap gap-2">{runActions(run)}</View>
                        </View>)}
                        <View className={cardClass}>
                            <Text accessibilityRole="header" className="text-lg font-bold text-white">Recent runs</Text>
                            {historyError && <Text className="text-red-400">Could not load recent runs. Retrying shortly.</Text>}
                            {recentRuns?.length === 0 && <Text className="text-text-secondary">No recent runs.</Text>}
                            {recentRuns?.map(run => <TouchableOpacity accessibilityRole="button" key={run.id} onPress={() => setDetailsId(run.id)}>
                                <Text className="font-semibold text-text-primary">{run.title}</Text>
                                <Text className="text-text-secondary">{run.status} · {sessionTime(run.startedAt ?? run.recordedAt)}</Text>
                            </TouchableOpacity>)}
                        </View>
                        <View className={cardClass}>
                            <Text accessibilityRole="header" className="text-lg font-bold text-white">Samsung Modes and Routines</Text>
                            <Text className="text-text-secondary">Under Then, choose Open an app or do an app action. Select the activity by name under uvelan.ultimateapp.</Text>
                            {shortcuts && <Text className="text-text-secondary">
                                {shortcuts.published.length} of {shortcuts.limit} named shortcut slots in use. To free a slot, edit an activity and turn off its shortcut.
                            </Text>}
                            {(shortcutError || shortcuts?.retry) && <>
                                <Text className="text-text-secondary">Android could not update the Routine shortcuts yet.</Text>
                                <Action label="Refresh shortcuts" secondary disabled={busy} onPress={() => void syncShortcuts()} />
                            </>}
                            {!state.notificationsEnabled && <Action label="Enable notifications" secondary disabled={busy} onPress={() => void act(enableNotifications)} />}
                            {!state.exactAlarmsEnabled && <Action label="Allow alarms and reminders" secondary disabled={busy} onPress={() => void act(() => reminder.openSettings('alarms'))} />}
                            {state.notificationsEnabled && !state.progressNotificationsEnabled && state.presets.some(preset => preset.intervalMinutes > 0) && (
                                <Action label="Enable progress notifications" secondary disabled={busy} onPress={() => void act(() => reminder.openSettings('progress'))} />
                            )}
                            {state.notificationsEnabled && !state.vibrationEnabled && <>
                                <Text className="text-text-secondary">Vibration is off for activity alerts.</Text>
                                <Action label="Open vibration settings" secondary disabled={busy} onPress={() => void act(() => reminder.openSettings('vibration'))} />
                            </>}
                        </View>
                    </>}
                </>}
            </ScrollView>}
            {detailsId && <ReminderHistoryPopup key={detailsId} target={{ sessionId: detailsId }} onClose={() => setDetailsId(undefined)} />}
        </View>
    );
}
