import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
    calendarModes, calendarPeriod, calendarTitle, dayStart, movePeriod, sessionProgress, sessionsOnDay, sessionTime, weekdays,
    type CalendarMode, type ReminderSession,
} from '@/src/lib/reminder-calendar';
import { getReminderHistory, retryReminderHistory, type HistoryResult } from '@/src/services/reminder-history.service';

const card = 'rounded-xl bg-background-surface p-4 gap-3';
const text = 'text-text-primary';

function Control({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
    return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
        className={`min-h-11 justify-center rounded-lg px-3 ${selected ? 'bg-accent' : 'bg-background-surface'}`}>
        <Text className="text-white font-semibold">{label}</Text>
    </TouchableOpacity>;
}

function SessionDetails({ session, now }: { session: ReminderSession; now: number }) {
    const progress = sessionProgress(session, now);
    return <View className={card}>
        <Text accessibilityRole="header" className="text-xl font-bold text-white">{session.title}</Text>
        <Text className="text-text-secondary">
            {session.source === 'routine' ? 'Samsung Routine' : session.source === 'manual' ? 'Started manually' : 'Start source unavailable'}
        </Text>
        <Text className={text}>Started · {sessionTime(session.startedAt)}</Text>
        {session.status === 'running' ? <>
            <Text className="text-3xl font-bold text-white">{progress.remaining}</Text>
            <Text className={text}>Time remaining{progress.percent === null ? '' : ` · ${progress.percent}% complete`}</Text>
            {progress.percent !== null && <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
                className="h-2 overflow-hidden rounded-full bg-background">
                <View className="h-full bg-accent" style={{ width: `${progress.percent}%` }} />
            </View>}
            <Text className={text}>Scheduled end · {sessionTime(session.plannedEndAt)}</Text>
        </> : <Text className={text}>{session.status === 'stopped' ? 'Stopped' : 'Completed'} · {sessionTime(session.endedAt)}</Text>}
        {!!session.message && <Text className="text-text-secondary">{session.message}</Text>}
    </View>;
}

export default function ReminderHistoryScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ sessionId?: string; presetId?: string }>();
    const [mode, setMode] = useState<CalendarMode>('month');
    const [date, setDate] = useState(() => dayStart(new Date()));
    const [selectedId, setSelectedId] = useState(params.sessionId ?? null);
    const [history, setHistory] = useState<HistoryResult>();
    const [error, setError] = useState('');
    const [syncError, setSyncError] = useState('');
    const [now, setNow] = useState(Date.now);
    const period = useMemo(() => calendarPeriod(date, mode), [date, mode]);
    const scroll = useRef<ScrollView>(null);

    useEffect(() => { setSelectedId(params.sessionId ?? null); }, [params.sessionId]);

    function selectDay(day: Date) {
        setDate(day);
        setSelectedId(null);
    }

    useFocusEffect(useCallback(() => {
        let current = true;
        let loading = false;
        const load = async () => {
            if (loading) return;
            loading = true;
            try {
                const data = await getReminderHistory(period.from, period.to, selectedId);
                if (current) { setHistory(data); setError(''); }
            } catch (error) {
                if (current) setError(error instanceof Error ? error.message : 'Could not load reminder history.');
            } finally {
                loading = false;
            }
        };
        void load();
        const refresh = setInterval(load, 4000);
        const clock = setInterval(() => setNow(Date.now()), 1000);
        return () => { current = false; clearInterval(refresh); clearInterval(clock); };
    }, [period, selectedId]));

    const sessions = (history?.sessions ?? []).filter(session => !params.presetId || session.presetId === params.presetId);
    const selected = history?.selected?.id === selectedId ? history.selected : sessions.find(session => session.id === selectedId);
    const visible = sessionsOnDay(sessions, date);

    return <View className="flex-1 bg-background">
        <View className="flex-row flex-wrap items-center gap-3 px-5 pb-4 pt-12">
            <Control label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/reminders' as never)} />
            <Text accessibilityRole="header" className="text-2xl font-bold text-white">Reminder history</Text>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
            {!!error && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
            {selected && <SessionDetails session={selected} now={now} />}
            <View className={card}>
                <View className="flex-row flex-wrap gap-2">
                    {calendarModes.map(value => <Control key={value} label={value[0].toUpperCase() + value.slice(1)}
                        selected={mode === value} onPress={() => setMode(value)} />)}
                </View>
                <View className="flex-row flex-wrap items-center gap-2">
                    <Control label="Previous" onPress={() => selectDay(movePeriod(date, mode, -1))} />
                    <Control label="Today" onPress={() => selectDay(dayStart(new Date()))} />
                    <Control label="Next" onPress={() => selectDay(movePeriod(date, mode, 1))} />
                </View>
                <Text accessibilityRole="header" className="text-lg font-bold text-white">{calendarTitle(date, mode)}</Text>
                {mode !== 'day' && <>
                    <View className="flex-row">{weekdays.map(day => <Text key={day} className="flex-1 text-center text-xs text-text-secondary">{day}</Text>)}</View>
                    {Array.from({ length: period.days.length / 7 }, (_, row) => <View key={row} className="flex-row">
                        {period.days.slice(row * 7, row * 7 + 7).map(day => {
                            const count = sessionsOnDay(sessions, day).length;
                            const active = day.getTime() === date.getTime();
                            return <TouchableOpacity key={day.getTime()} accessibilityRole="button" accessibilityState={{ selected: active }}
                                accessibilityLabel={`${calendarTitle(day, 'day')}, ${count} reminders`}
                                className={`min-h-11 flex-1 items-center justify-center rounded-md ${active ? 'bg-accent' : ''}`}
                                onPress={() => selectDay(day)}>
                                <Text className={text}>{day.getDate()}</Text>
                                <Text className="text-xs text-text-secondary">{count || ' '}</Text>
                            </TouchableOpacity>;
                        })}
                    </View>)}
                </>}
            </View>
            <Text accessibilityRole="header" className="text-lg font-bold text-white">{calendarTitle(date, 'day')}</Text>
            {!history && !error && <Text className="text-text-secondary">Loading reminders…</Text>}
            {!!history && !visible.length && <Text className="text-text-secondary">No reminder sessions on this day.</Text>}
            {visible.map(session => <TouchableOpacity key={session.id} accessibilityRole="button"
                accessibilityState={{ selected: selectedId === session.id }}
                onPress={() => { setSelectedId(session.id); scroll.current?.scrollTo({ y: 0, animated: true }); }} className={card}>
                <Text className="text-base font-semibold text-white">{session.title}</Text>
                <Text className="text-text-secondary">
                    {session.status === 'running' ? `${sessionProgress(session, now).remaining} left` : session.status === 'stopped' ? 'Stopped' : 'Completed'}
                    {' · '}{sessionTime(session.startedAt ?? session.recordedAt)}
                </Text>
            </TouchableOpacity>)}
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
    </View>;
}
