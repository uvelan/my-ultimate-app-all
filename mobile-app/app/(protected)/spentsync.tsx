import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, TextInput, PermissionsAndroid, Modal, Alert, NativeModules, Platform, Linking, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { api } from '@/src/lib/api-client';
import { smsPeriodDates, smsBookingTimestamp, type SmsPeriod } from '@/src/lib/sms-date-range';
import { parseSmsTransaction, type ParsedSmsTransaction } from '@/src/lib/sms-parser';
import { buildSmsPageArguments, type SmsPageCursor } from '@/src/lib/sms-bridge';

type Transaction = ParsedSmsTransaction;
type Cursor = SmsPageCursor;
const rupee = '\u20b9';
const button = 'rounded-xl bg-accent px-4 py-3 items-center';
const field = 'rounded-xl border border-border bg-background p-3 text-text-primary';

export default function SpentSyncScreen() {
    const router = useRouter();
    const [startDate, setStartDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 7); return date; });
    const [endDate, setEndDate] = useState(new Date());
    const [picker, setPicker] = useState<'start' | 'end' | 'period' | null>(null);
    const [period, setPeriod] = useState<SmsPeriod>('RANGE');
    const [periodDate, setPeriodDate] = useState(new Date());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanned, setScanned] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [notice, setNotice] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'EXPENSE' | 'INCOME'>('ALL');
    const [editing, setEditing] = useState<Transaction | null>(null);
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [bookingDate, setBookingDate] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const cursor = useRef<Cursor>(null);
    const generation = useRef(0);
    const scanBusy = useRef(false);
    const saveBusy = useRef(false);

    useFocusEffect(useCallback(() => {
        let active = true;
        api.get('/mobile/finance', { params: { resource: 'categories' } })
            .then(response => { if (active) setCategories(response.data); })
            .catch((error: any) => { if (active) setNotice(error.response?.data?.error || 'Unable to load categories. Open Finance to create categories, then retry.'); });
        return () => { active = false; generation.current++; };
    }, []));

    const resetScan = () => {
        generation.current++; cursor.current = null;
        setHasMore(false); setTransactions([]); setScanned(0); setNotice('');
    };
    const choosePeriod = (value: SmsPeriod, selected = periodDate) => {
        resetScan(); setPeriod(value);
        if (value !== 'RANGE') {
            const dates = smsPeriodDates(value, selected);
            setStartDate(dates.start); setEndDate(dates.end); setPeriodDate(selected);
        }
    };
    const updateDate = (value: Date) => {
        if (picker === 'period' && period !== 'RANGE') { choosePeriod(period, value); return; }
        resetScan();
        if (picker === 'start') setStartDate(value); else setEndDate(value);
    };

    const permission = async () => {
        if (Platform.OS !== 'android') { Alert.alert('Android only', 'Inbox scanning is available in the Android app.'); return false; }
        if (!NativeModules.SmsReader?.readSmsPage) {
            Alert.alert('App update required', 'Install the updated Android build to use SMS sync.'); return false;
        }
        if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)) return true;
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
            title: 'Read transaction alerts', message: 'Scan your selected inbox dates on this device. Only transactions you review and save are synced.',
            buttonPositive: 'Allow', buttonNegative: 'Cancel',
        });
        if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            Alert.alert('SMS permission disabled', 'Enable SMS access in app settings to scan transaction alerts.', [
                { text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
            ]);
        }
        return result === PermissionsAndroid.RESULTS.GRANTED;
    };

    const scanInbox = async (append = false) => {
        if (scanBusy.current || saveBusy.current) return;
        scanBusy.current = true;
        setLoading(true);
        const run = ++generation.current;
        try {
            if (!await permission() || run !== generation.current) return;
            const from = new Date(startDate); from.setHours(0, 0, 0, 0);
            const until = new Date(endDate); until.setHours(0, 0, 0, 0); until.setDate(until.getDate() + 1);
            if (from.getTime() >= until.getTime()) throw new Error('Choose a start date before the end date.');
            let next = append ? cursor.current : null;
            let count = append ? scanned : 0;
            const parsed = new Map<string, Transaction>((append ? transactions : []).map(item => [item.fingerprint, item]));
            let more = false;
            let pageCount = 0;
            do {
                const page = await NativeModules.SmsReader.readSmsPage(...buildSmsPageArguments(from.getTime(), until.getTime() - 1, next));
                if (run !== generation.current) return;
                const messages: any[] = page.messages || [];
                count += messages.length;
                for (const message of messages) {
                    const item = parseSmsTransaction(message);
                    if (item && !parsed.has(item.fingerprint)) parsed.set(item.fingerprint, item);
                }
                more = !!page.hasMore;
                const updatedCursor: Cursor = page.nextCursor || null;
                if (more && (!updatedCursor || (next?.date === updatedCursor.date && next?.id === updatedCursor.id))) {
                    throw new Error('Scanning stopped safely. Narrow the date range and retry.');
                }
                next = updatedCursor;
                pageCount++;
                setScanned(count);
                await new Promise(resolve => setTimeout(resolve, 0));
            } while (more && pageCount < 40);
            const items = Array.from(parsed.values()).sort((a, b) => b.rawDateMillis - a.rawDateMillis);
            let statusWarning = '';
            try {
                for (let offset = 0; offset < items.length; offset += 500) {
                    const batch = items.slice(offset, offset + 500);
                    const response = await api.post('/mobile/sms', { action: 'lookup', fingerprints: batch.map(item => item.fingerprint) });
                    const existing = new Set((response.data.imports || []).map((item: any) => item.fingerprint));
                    for (const item of batch) item.synced = existing.has(item.fingerprint);
                }
            } catch { statusWarning = 'Previous imports could not be checked. Saving will check again.'; }
            if (run !== generation.current) return;
            cursor.current = next;
            setHasMore(more);
            setTransactions(items);
            setNotice(statusWarning || (items.length ? 'Review each transaction before saving. Full SMS messages stay on this device.' : 'No supported transaction alerts found in these dates.'));
        } catch (error: any) {
            if (run === generation.current) setNotice(error.message || 'Unable to scan the inbox.');
        } finally {
            scanBusy.current = false;
            setLoading(false);
        }
    };

    const openReview = (item: Transaction) => {
        if (item.synced) return;
        setEditing(item); setBookingDate(item.date); setAmount(item.amount.toFixed(2)); setDescription(item.notes); setCategoryId('');
    };
    const saveTransaction = async () => {
        if (!editing || saveBusy.current) return;
        const numericAmount = Number(amount);
        const amountPaise = Math.round(numericAmount * 100);
        if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isSafeInteger(amountPaise) || amountPaise > 2147483647) {
            Alert.alert('Check amount', 'Enter a valid positive amount.'); return;
        }
        if (!categoryId) { Alert.alert('Choose a category', 'Select the category for this transaction.'); return; }
        let transactionDate: string;
        try { transactionDate = smsBookingTimestamp(bookingDate); } catch (error: any) { Alert.alert('Check date', error.message); return; }
        saveBusy.current = true; setSaving(true);
        try {
            const response = await api.post('/mobile/sms', {
                action: 'import', fingerprint: editing.fingerprint, type: editing.type,
                amountPaise, categoryId, transactionDate,
                description: description.trim().slice(0, 500),
                paymentMethod: editing.source === 'Card' ? (/credit card/i.test(editing.rawBody) ? 'Credit Card' : /debit card/i.test(editing.rawBody) ? 'Debit Card' : 'Other') : editing.source === 'UPI' ? 'UPI' : editing.source === 'ATM' ? 'Cash' : 'Net Banking',
            });
            setTransactions(previous => previous.map(item => item.fingerprint === editing.fingerprint ? { ...item, synced: true, ...(!response.data.duplicate ? { amount: numericAmount, amountPaise, date: bookingDate, type: editing.type, notes: description.trim() } : {}) } : item));
            setEditing(null);
            setNotice(response.data.duplicate ? 'This message was already imported. No new transaction was added.' : 'Transaction saved. It is available on Android and web.');
        } catch (error: any) { Alert.alert('Could not save', error.response?.data?.error || 'Please retry. The same message will not be imported twice.'); }
        finally { saveBusy.current = false; setSaving(false); }
    };

    const visible = transactions.filter(item => filter === 'ALL' || item.type === filter);
    return <View className="flex-1 bg-background">
        <View className="flex-row items-center gap-3 border-b border-border px-5 pb-4 pt-12">
            <TouchableOpacity accessibilityLabel="Go back" onPress={() => router.back()}><ChevronLeft color="#a78bfa" /></TouchableOpacity>
            <View><Text className="text-xl font-bold text-text-primary">SMS sync</Text><Text className="text-xs text-text-secondary">Review bank alerts before importing</Text></View>
        </View>
        <View className="gap-3 p-4">
            <View className="flex-row gap-2">{(['DAY', 'WEEK', 'MONTH', 'RANGE'] as const).map(value =>
                <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }}
                    className={'flex-1 rounded-xl border px-2 py-3 items-center ' + (period === value ? 'border-accent bg-accent/20' : 'border-border')}
                    onPress={() => choosePeriod(value)}><Text className="text-text-primary">{value === 'RANGE' ? 'Range' : value.charAt(0) + value.slice(1).toLowerCase()}</Text></TouchableOpacity>)}</View>
            {period === 'RANGE' ? <View className="flex-row gap-2">
                <TouchableOpacity className={field + ' flex-1'} onPress={() => setPicker('start')}><Text className="text-text-primary">From {startDate.toLocaleDateString()}</Text></TouchableOpacity>
                <TouchableOpacity className={field + ' flex-1'} onPress={() => setPicker('end')}><Text className="text-text-primary">To {endDate.toLocaleDateString()}</Text></TouchableOpacity>
            </View> : <TouchableOpacity className={field} onPress={() => setPicker('period')}>
                <Text className="text-text-primary">{period === 'DAY' ? startDate.toLocaleDateString() : startDate.toLocaleDateString() + ' - ' + endDate.toLocaleDateString()}</Text>
                <Text className="mt-1 text-xs text-text-secondary">Tap to choose a past {period.toLowerCase()}{period === 'WEEK' ? ' (Monday to Sunday)' : ''}</Text>
            </TouchableOpacity>}
            {picker && <DateTimePicker value={picker === 'period' ? periodDate : picker === 'start' ? startDate : endDate} mode="date" maximumDate={new Date()}
                onChange={(event, date) => { if (event.type !== 'dismissed' && date) updateDate(date); setPicker(null); }} />}
            <TouchableOpacity disabled={loading || saving} className={button} onPress={() => { void scanInbox(); }}>
                {loading ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">Scan inbox</Text>}
            </TouchableOpacity>
            {loading && <TouchableOpacity onPress={() => { generation.current++; setLoading(false); }}><Text className="text-center text-text-secondary">Cancel scan ({scanned} messages checked)</Text></TouchableOpacity>}
            {!!notice && <Text accessibilityLiveRegion="polite" className="text-sm text-text-secondary">{notice}</Text>}
            <View className="flex-row gap-2">{(['ALL', 'EXPENSE', 'INCOME'] as const).map(value => <TouchableOpacity key={value} onPress={() => setFilter(value)} className={'rounded-full border px-3 py-2 ' + (filter === value ? 'border-accent bg-accent/20' : 'border-border')}><Text className="text-text-primary">{value === 'ALL' ? 'All' : value === 'EXPENSE' ? 'Expenses' : 'Income'}</Text></TouchableOpacity>)}</View>
        </View>
        <FlatList data={visible} keyExtractor={item => item.fingerprint} contentContainerStyle={{ padding: 16, paddingTop: 0 }}
            ListEmptyComponent={!loading ? <Text className="py-8 text-center text-text-secondary">Scan a date range to review transaction alerts.</Text> : null}
            renderItem={({ item }) => <TouchableOpacity disabled={item.synced} onPress={() => openReview(item)} className={'mb-3 rounded-xl border border-border bg-background-surface p-4 ' + (item.synced ? 'opacity-60' : '')}>
                <View className="flex-row justify-between"><Text className="text-lg font-bold text-text-primary">{item.type === 'INCOME' ? '+' : '-'}{rupee}{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text><Text className="text-text-secondary">{item.source}</Text></View>
                <Text className="mt-1 text-text-primary">{item.notes}</Text><Text className="mt-2 text-xs text-text-secondary">{item.date}{item.account ? ' - account ' + item.account : ''}</Text>
                <Text className="mt-3 font-semibold text-accent">{item.synced ? 'Already imported' : 'Review and save'}</Text>
            </TouchableOpacity>}
            ListFooterComponent={hasMore && !loading ? <TouchableOpacity className={button} onPress={() => { void scanInbox(true); }}><Text className="text-white">Scan more messages</Text></TouchableOpacity> : null} />
        <Modal visible={!!editing} animationType="slide" onRequestClose={() => { if (!saving) setEditing(null); }}>
            <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 16 }} keyboardShouldPersistTaps="handled">
                <View className="flex-row justify-between"><Text className="text-xl font-bold text-text-primary">Review transaction</Text><TouchableOpacity disabled={saving} onPress={() => setEditing(null)}><X color="#a78bfa" /></TouchableOpacity></View>
                <View className="flex-row gap-2">{(['EXPENSE', 'INCOME'] as const).map(type => <TouchableOpacity key={type} onPress={() => { setEditing(item => item ? { ...item, type } : item); setCategoryId(''); }} className={editing?.type === type ? button : field}><Text className="text-text-primary">{type === 'EXPENSE' ? 'Expense' : 'Income'}</Text></TouchableOpacity>)}</View>
                <Text className="text-text-secondary">Amount ({rupee})</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" className={field} />
                <Text className="text-text-secondary">Transaction date (YYYY-MM-DD)</Text><TextInput value={bookingDate} onChangeText={setBookingDate} className={field} maxLength={10} />
                <Text className="text-text-secondary">Description</Text><TextInput value={description} onChangeText={setDescription} maxLength={500} className={field} />
                <Text className="text-text-secondary">Category</Text>
                {categories.filter(category => category.type === editing?.type && !category.isArchived).map(category => <TouchableOpacity key={category.id} className={categoryId === category.id ? button : field} onPress={() => setCategoryId(category.id)}><Text className="text-text-primary">{category.name}</Text></TouchableOpacity>)}
                {!categories.some(category => category.type === editing?.type && !category.isArchived) && <Text className="text-text-secondary">Create a matching category in Finance before importing.</Text>}
                <Text className="text-text-secondary">Original message (stays on this device)</Text><Text selectable className="rounded-xl bg-background-surface p-4 text-text-secondary">{editing?.rawBody}</Text>
                <TouchableOpacity disabled={saving} className={button} onPress={() => { void saveTransaction(); }}>{saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">Save transaction</Text>}</TouchableOpacity>
            </ScrollView>
        </Modal>
    </View>;
}
