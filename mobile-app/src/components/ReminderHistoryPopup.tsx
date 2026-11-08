import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { calendarPeriod, calendarTitle } from '@/src/lib/calendar';
import { sessionProgress, sessionTime, type ReminderSession } from '@/src/lib/reminder-calendar';
import { getReminderHistory, type HistoryResult } from '@/src/services/reminder-history.service';

export type ReminderPopupTarget =
    | { day: Date; presetId?: string; sessionId?: never }
    | { sessionId: string; day?: never; presetId?: never };

function Action({ label, onPress }: { label: string; onPress: () => void }) {
    return <Pressable accessibilityRole="button" onPress={onPress} className="min-h-11 justify-center rounded-lg bg-background px-3">
        <Text className="font-semibold text-white">{label}</Text>
    </Pressable>;
}

function SessionDetails({ session, now }: { session: ReminderSession; now: number }) {
    const progress = sessionProgress(session, now);
    return <View className="gap-3">
        <Text className="text-text-secondary">
            {session.source === 'routine' ? 'Samsung Routine' : session.source === 'manual' ? 'Started manually' : 'Start source unavailable'}
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
        {!!session.message && <Text className="text-text-secondary">{session.message}</Text>}
    </View>;
}

export default function ReminderHistoryPopup({ target, initialSessions, onClose }: {
    target: ReminderPopupTarget; initialSessions?: ReminderSession[]; onClose: () => void;
}) {
    const { day, presetId, sessionId } = target;
    const [selectedId, setSelectedId] = useState<string>();
    const [result, setResult] = useState<HistoryResult>();
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
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
                if (current) setError('Could not refresh reminder history.');
            } finally {
                loading = false;
            }
        };
        void load();
        const refresh = setInterval(load, 4000);
        const clock = setInterval(() => setNow(Date.now()), 1000);
        return () => { current = false; clearInterval(refresh); clearInterval(clock); };
    }, [day, sessionId]);

    const sessions = (result?.sessions ?? initialSessions ?? []).filter(session => !presetId || session.presetId === presetId);
    const selected = day ? sessions.find(session => session.id === selectedId) : result?.selected;
    const ready = !!result || initialSessions !== undefined;
    const backToList = () => setSelectedId(undefined);
    const title = selected?.title ?? (day ? calendarTitle(day, 'day') : 'Reminder details');

    return <Modal visible transparent animationType="fade" onRequestClose={day && selected ? backToList : onClose}>
        <View className="flex-1 justify-center bg-black/60 px-4 py-10">
            <View accessibilityViewIsModal className="max-h-full w-full max-w-xl self-center rounded-2xl border border-border bg-background-surface p-4">
                <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
                    <Text accessibilityRole="header" className="flex-1 text-xl font-bold text-white">{title}</Text>
                    <Action label="Close" onPress={onClose} />
                </View>
                {day && selected && <View className="mb-3 self-start"><Action label="Back to reminders" onPress={backToList} /></View>}
                <ScrollView key={selected?.id ?? 'sessions'} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
                    {!!error && <Text accessibilityLiveRegion="polite" className="text-red-400">{error}</Text>}
                    {selected ? <SessionDetails session={selected} now={now} /> : <>
                        {!ready && !error && <Text className="text-text-secondary">Loading reminders…</Text>}
                        {day && ready && sessions.length === 0 && <Text className="text-text-secondary">No reminder sessions on this day.</Text>}
                        {!day && ready && <Text className="text-text-secondary">This reminder session is unavailable.</Text>}
                        {day && sessions.map(session => <Pressable key={session.id} accessibilityRole="button"
                            onPress={() => setSelectedId(session.id)} className="gap-1 rounded-xl border border-border bg-background p-3">
                            <Text className="font-semibold text-white">{session.title}</Text>
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
