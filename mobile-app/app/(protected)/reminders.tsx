import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, AppState, NativeModules, PermissionsAndroid, Platform, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import ReminderHistoryPopup from '@/src/components/ReminderHistoryPopup';
import { onReminderPresetsSynced, syncReminderPresets } from '@/src/services/reminder-presets.service';
import type { ReminderPresetFields } from '@/src/lib/reminder-presets';

type Preset = ReminderPresetFields & {
    id: string;
    operationId: string;
};
type ReminderRun = {
    id: string;
    sessionId: string;
    presetId: string;
    title: string;
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
    savePreset(id: string, title: string, message: string, duration: number, extension: number, interval: number, routine: boolean, operationId: string): Promise<void>;
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
    title: string;
    message: string;
    hours: string;
    minutes: string;
    extension: number;
    atIntervals: boolean;
    interval: string;
    routineEnabled: boolean;
};

const reminder: ReminderModule | undefined = Platform.OS === 'android' ? NativeModules.RoutineReminder : undefined;
const inputClass = 'mt-2 rounded-lg border border-border bg-background px-3 py-3 text-base text-text-primary';
const cardClass = 'gap-3 rounded-xl bg-background-surface p-4';
const extensions = [5, 10, 15, 30];

function formatRemaining(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return [hours ? `${hours} hr` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ');
}

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

export default function RemindersScreen() {
    const router = useRouter();
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
            if (saved) setDraft(undefined);
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
        const duration = preset?.durationMinutes ?? 45;
        const routineCount = state?.presets.filter(item => item.routineEnabled).length ?? 0;
        setDraft({
            id: preset?.id ?? '',
            operationId: preset?.operationId ?? '',
            title: preset?.title ?? '',
            message: preset?.message ?? '',
            hours: String(Math.floor(duration / 60)),
            minutes: String(duration % 60),
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
        const duration = Number(draft.hours) * 60 + Number(draft.minutes);
        const interval = draft.atIntervals ? Number(draft.interval) : 0;
        if (!draft.title.trim() || !draft.message.trim()) {
            setError('Enter a reminder name and completion message.');
            return;
        }
        if (duration < 1 || Number(draft.minutes) > 59) {
            setError('Enter a duration of at least 1 minute and use 0–59 for minutes.');
            return;
        }
        if (draft.atIntervals && (interval < 1 || interval >= duration)) {
            setError('Enter an interval of at least 1 minute and shorter than the countdown.');
            return;
        }
        void act(() => reminder.savePreset(
            draft.id, draft.title.trim(), draft.message.trim(), duration, draft.extension, interval, draft.routineEnabled, draft.operationId,
        ), true);
    }

    function remove(preset: Preset) {
        if (!reminder) return;
        Alert.alert('Delete reminder?', preset.title, [
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
                {run.finished ? 'Time’s up' : formatRemaining(Math.max(0, Math.ceil((run.endsAt - now) / 1000)))}
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

    return (
        <View className="flex-1 bg-background">
            <View className="flex-row items-center px-5 pb-4 pt-12">
                <SidebarToggle />
                <Text accessibilityRole="header" className="ml-3 text-2xl font-bold text-white">Reminders</Text>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
                {!reminder && <Text className="text-text-secondary">Reminders are available in the Android build.</Text>}
                {reminder && !state && <Action label={error ? 'Retry' : 'Loading…'} onPress={reload} disabled={!error} />}
                {!!error && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
                {reminder && state && <>
                    <Action label="History & calendar" secondary onPress={() => router.push('/reminder-history' as never)} />
                    <View className="gap-2">
                        {state.pendingPresetSync > 0 && <Text className="text-text-secondary">{state.pendingPresetSync} reminder changes waiting to sync.</Text>}
                        {state.presetSyncConflicts > 0 && <Text className="text-text-secondary">A newer reminder edit from another device was kept.</Text>}
                        {!!syncError && <Text accessibilityLiveRegion="polite" className="text-red-400">{syncError}</Text>}
                        <Action label="Sync reminders" secondary onPress={() => {
                            setSyncError('');
                            void syncReminderPresets().then(reload).catch(() => setSyncError('Could not sync right now. Your reminders are saved on this phone.'));
                        }} />
                    </View>
                    {draft ? <View className={cardClass}>
                        <Text accessibilityRole="header" className="text-lg font-bold text-white">{draft.id ? 'Edit reminder' : 'New reminder'}</Text>
                        <View>
                            <Text className="text-text-primary">Reminder name</Text>
                            <TextInput accessibilityLabel="Reminder name" className={inputClass} maxLength={40} value={draft.title} onChangeText={title => updateDraft({ title })} />
                        </View>
                        <View>
                            <Text className="text-text-primary">Countdown duration</Text>
                            <View className="mt-2 flex-row gap-3">
                                <NumberField label="Hours" value={draft.hours} onChange={hours => updateDraft({ hours })} />
                                <NumberField label="Minutes" value={draft.minutes} onChange={minutes => updateDraft({ minutes })} />
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
                            <NumberField label="Notify every (minutes)" value={draft.interval} maxLength={4} onChange={interval => updateDraft({ interval })} />
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
                            <Action label="Save reminder" disabled={busy} onPress={save} />
                            <Action label="Cancel" secondary disabled={busy} onPress={() => { setDraft(undefined); setError(''); }} />
                        </View>
                    </View> : <>
                        <Action label="New reminder" onPress={() => edit()} disabled={busy} />
                        {!state.presets.length && <Text className="text-text-secondary">Create a reminder to start a countdown.</Text>}
                        {state.presets.map(preset => {
                            const run = state.runs.find(item => item.presetId === preset.id);
                            const published = shortcuts?.published.includes(preset.id);
                            const canStart = ready && (!preset.intervalMinutes || state.progressNotificationsEnabled);
                            return <View key={preset.id} className={cardClass}>
                                <Text className="text-lg font-bold text-white">{run?.title ?? preset.title}</Text>
                                <Text className="text-text-secondary">
                                    {formatDuration(preset.durationMinutes)} · {preset.intervalMinutes ? `Notify every ${formatDuration(preset.intervalMinutes)}` : 'End alert only'}
                                </Text>
                                {preset.routineEnabled && <Text className="text-text-secondary">
                                    {published ? `Routine action “${preset.title}”` : 'Named Routine shortcut pending'}
                                </Text>}
                                {run && runStatus(run)}
                                <View className="flex-row flex-wrap gap-2">
                                    {run ? runActions(run) : <Action label="Start" disabled={busy || !canStart} onPress={() => void act(() => reminder.start(preset.id))} />}
                                    {!run && <Action secondary label="History" onPress={() => router.push({ pathname: '/reminder-history', params: { presetId: preset.id } } as never)} />}
                                    <Action label="Edit" secondary disabled={busy} onPress={() => edit(preset)} />
                                    {!run && <Action label="Delete" secondary disabled={busy} onPress={() => remove(preset)} />}
                                </View>
                            </View>;
                        })}
                        {state.runs.filter(run => !state.presets.some(preset => preset.id === run.presetId)).map(run => <View key={run.id} className={cardClass}>
                            <Text className="text-lg font-bold text-white">{run.title}</Text>
                            {runStatus(run)}
                            <View className="flex-row flex-wrap gap-2">{runActions(run)}</View>
                        </View>)}
                        <View className={cardClass}>
                            <Text accessibilityRole="header" className="text-lg font-bold text-white">Samsung Modes and Routines</Text>
                            <Text className="text-text-secondary">Under Then, choose Open an app or do an app action. Select the reminder by name under uvelan.ultimateapp.</Text>
                            {shortcuts && <Text className="text-text-secondary">
                                {shortcuts.published.length} of {shortcuts.limit} named shortcut slots in use. To free a slot, edit a reminder and turn off its shortcut.
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
                                <Text className="text-text-secondary">Vibration is off for Reminder alerts.</Text>
                                <Action label="Open vibration settings" secondary disabled={busy} onPress={() => void act(() => reminder.openSettings('vibration'))} />
                            </>}
                        </View>
                    </>}
                </>}
            </ScrollView>
            {detailsId && <ReminderHistoryPopup key={detailsId} target={{ sessionId: detailsId }} onClose={() => setDetailsId(undefined)} />}
        </View>
    );
}
