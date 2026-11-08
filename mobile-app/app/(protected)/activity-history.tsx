import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { calendarModes, calendarPeriod, calendarTitle, calendarWeekdays, dayStart, movePeriod, type CalendarMode } from '@shared/calendar';
import { sessionsOnDay } from '@shared/reminder-calendar';
import { getReminderHistory, retryReminderHistory, type HistoryResult } from '@/src/services/reminder-history.service';
import ReminderHistoryPopup, { type ReminderPopupTarget } from '@/src/components/ReminderHistoryPopup';
import { CalendarGrid } from '@/src/components/ui/CalendarGrid';
import { activityDayKey, taskActivityGroup, taskDueDay, type ActivityTask } from '@shared/activity-tasks';
import { activityGroups, activityGroupLabels, type ActivityGroup } from '@shared/activity-groups';

const card = 'rounded-xl bg-background-surface p-4 gap-3';
const weekdays = calendarWeekdays();

function Control({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
    return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
        className={`min-h-11 justify-center rounded-lg px-3 ${selected ? 'bg-accent' : 'bg-background-surface'}`}>
        <Text className="text-white font-semibold">{label}</Text>
    </TouchableOpacity>;
}

export default function ActivityHistoryScreen() { return <ActivityHistory />; }

export function ActivityHistory({ embedded = false, initialArea = 'ALL', tasks = [], taskError, onRetryTasks }: {
    embedded?: boolean; initialArea?: ActivityGroup | 'ALL'; tasks?: ActivityTask[];
    taskError?: boolean; onRetryTasks?: () => void;
}) {
    const router = useRouter();
    const params = useLocalSearchParams<{ sessionId?: string; presetId?: string }>();
    const [mode, setMode] = useState<CalendarMode>('month');
    const [group, setGroup] = useState<ActivityGroup | 'ALL'>(initialArea);
    const [itemType, setItemType] = useState<'All' | 'Activities' | 'Tasks'>('All');
    const [date, setDate] = useState(() => dayStart(new Date()));
    const [popup, setPopup] = useState<ReminderPopupTarget>();
    const [loaded, setLoaded] = useState<{ from: number; to: number; history: HistoryResult }>();
    const [error, setError] = useState('');
    const [syncError, setSyncError] = useState('');
    const period = useMemo(() => calendarPeriod(date, mode), [date, mode]);
    const from = period.from.getTime();
    const to = period.to.getTime();
    useEffect(() => {
        if (embedded) return;
        if (params.sessionId) setPopup({ sessionId: params.sessionId });
        else if (params.presetId) setPopup({ day: dayStart(new Date()), presetId: params.presetId });
        else setPopup(undefined);
    }, [embedded, params.sessionId, params.presetId]);

    useFocusEffect(useCallback(() => {
        let current = true;
        let loading = false;
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const history = await getReminderHistory(new Date(from), new Date(to), null);
                if (current) { setLoaded({ from, to, history }); setError(''); }
            } catch (error) {
                if (current) setError(error instanceof Error ? error.message : 'Could not load activity history.');
            } finally {
                loading = false;
            }
        };
        void load();
        const refresh = setInterval(load, 4000);
        return () => { current = false; clearInterval(refresh); };
    }, [from, to]));

    const history = loaded?.history;
    const periodReady = !!loaded && loaded.from <= from && loaded.to >= to;
    const allSessions = periodReady ? history?.sessions ?? [] : [];
    const visibleSessions = itemType === 'Tasks' ? [] : group === 'ALL' ? allSessions : allSessions.filter(session => session.group === group);
    const initialSessions = popup?.day && periodReady && popup.day.getTime() >= from && popup.day.getTime() < to
        ? sessionsOnDay(allSessions, popup.day) : undefined;

    const tasksByDay = useMemo(() => {
        const result = new Map<string, ActivityTask[]>();
        if (itemType === 'Activities') return result;
        for (const task of tasks) {
            if (group !== 'ALL' && taskActivityGroup(task) !== group) continue;
            const day = taskDueDay(task.dueDate);
            if (day) result.set(day, [...(result.get(day) ?? []), task]);
        }
        return result;
    }, [tasks, group, itemType]);

    return <View className="flex-1 bg-background">
        {!embedded && <View className="flex-row flex-wrap items-center gap-3 px-5 pb-4 pt-12">
            <Control label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/activities' as never)} />
            <Text accessibilityRole="header" className="text-2xl font-bold text-white">Activity history</Text>
        </View>}
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
            {taskError && itemType !== 'Activities' && <View className={card}>
                <Text className="text-red-400">Could not load tasks for the calendar.</Text>
                {onRetryTasks && <Control label="Retry tasks" onPress={onRetryTasks} />}
            </View>}
            {!!error && itemType !== 'Tasks' && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
            <View className={card}>
                <View className="flex-row flex-wrap gap-2">
                    {calendarModes.map(value => <Control key={value} label={value[0].toUpperCase() + value.slice(1)}
                        selected={mode === value} onPress={() => setMode(value)} />)}
                </View>
                <View className="flex-row flex-wrap gap-2">
                    <Control label="All groups" selected={group === 'ALL'} onPress={() => setGroup('ALL')} />
                    {activityGroups.map(value => <Control key={value} label={activityGroupLabels[value]}
                        selected={group === value} onPress={() => setGroup(value)} />)}
                </View>
                {embedded && <View className="flex-row flex-wrap gap-2">
                    {(['All', 'Activities', 'Tasks'] as const).map(type => <Control key={type} label={type}
                        selected={itemType === type} onPress={() => setItemType(type)} />)}
                </View>}
                <View className="flex-row flex-wrap items-center gap-2">
                    <Control label="Previous" onPress={() => setDate(movePeriod(date, mode, -1))} />
                    <Control label="Today" onPress={() => setDate(dayStart(new Date()))} />
                    <Control label="Next" onPress={() => setDate(movePeriod(date, mode, 1))} />
                </View>
                <Text accessibilityRole="header" className="text-lg font-bold text-white">{calendarTitle(date, mode)}</Text>
                <CalendarGrid weekdays={weekdays} days={period.days} itemLabel={embedded ? "items" : "activities"}
                    countForDay={day => sessionsOnDay(visibleSessions, day).length + (tasksByDay.get(activityDayKey(day))?.length ?? 0)}
                    isSelected={day => day.getTime() === date.getTime()} onSelect={day => setPopup({ day, group: group === 'ALL' ? undefined : group })} />
            </View>
            {itemType !== 'Tasks' && !periodReady && !error && <Text className="text-text-secondary">Loading activities…</Text>}
            {history && (!history.syncReady || history.pending > 0 || history.failed > 0) && <View className={card}>
                {!history.syncReady && <Text className="text-text-secondary">History is saved on this phone. Web sync is waiting for a connection.</Text>}
                {history.syncReady && history.pending > 0 && <Text className="text-text-secondary">{history.pending} sessions waiting to sync to the web.</Text>}
                {history.failed > 0 && <Text className="text-text-secondary">{history.failed} sessions could not sync and are still saved on this phone.</Text>}
                {!!syncError && <Text accessibilityLiveRegion="polite" className="text-red-400">{syncError}</Text>}
                <Control label="Retry sync" onPress={() => {
                    setSyncError('');
                    void retryReminderHistory().catch(() => setSyncError('Could not connect to web sync. Your history is saved on this phone.'));
                }} />
            </View>}
        </ScrollView>
        {popup && <ReminderHistoryPopup key={popup.sessionId ?? popup.day?.getTime()} target={popup}
            initialSessions={initialSessions} tasks={popup.day ? tasksByDay.get(activityDayKey(popup.day)) : undefined}
            showActivities={itemType !== 'Tasks'} onClose={() => setPopup(undefined)} />}
    </View>;
}
