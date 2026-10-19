import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { financeService, FinanceSnapshot } from '@/src/services/finance.service';
import { useRouter } from 'expo-router';
import { PAYMENT_METHODS } from '@/src/lib/payment-methods';

const money = (value: number) => `₹${(value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const inputStyle = { color: '#f5f5f0', backgroundColor: '#211f24', padding: 12, borderRadius: 8, marginBottom: 12 };
export default function FinanceScreen() {
    const router = useRouter();
    const [tab, setTab] = useState<'budgets' | 'recurring' | 'reports'>('budgets');
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
    const [data, setData] = useState<FinanceSnapshot & { aggregates?: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [method, setMethod] = useState('UPI');
    const [budgetBy, setBudgetBy] = useState<'category' | 'method'>('category');
    const [threshold, setThreshold] = useState('80');
    const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [frequency, setFrequency] = useState('MONTHLY');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState('');
    const [editing, setEditing] = useState<string | undefined>();
    const load = async () => {
        setError('');
        try { setData(await financeService.snapshot({ month })); }
        catch (err: any) { setError(err.response?.data?.error || 'Unable to load finance. Pull to retry.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { setLoading(true); load(); } }, [month]);
    const mutate = async (action: () => Promise<any>) => {
        setSaving(true);
        try { await action(); await load(); setAmount(''); setEditing(undefined); }
        catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    };
    const save = () => {
        const amountPaise = Math.round(Number(amount) * 100);
        if (!Number.isFinite(amountPaise) || amountPaise <= 0 || (tab === 'recurring' || budgetBy === 'category') && !categoryId) return Alert.alert('Check details', 'Enter a positive amount and select a category.');
        if (tab === 'budgets') {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(Number(threshold)) || Number(threshold) < 1 || Number(threshold) > 100) return Alert.alert('Check details', 'Use YYYY-MM and an alert threshold from 1 to 100.');
            mutate(() => financeService.save('budgets', { month, amountPaise, alertThreshold: Number(threshold), ...(budgetBy === 'category' ? { categoryId } : { paymentMethod: method }) }, editing));
        } else {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate)) || endDate && (Number.isNaN(Date.parse(endDate)) || endDate < startDate)) return Alert.alert('Check dates', 'Enter valid dates in YYYY-MM-DD order.');
            mutate(() => financeService.save('recurring', { amountPaise, categoryId, type, paymentMethod: method, description, frequency, startDate: new Date(startDate).toISOString(), endDate: endDate ? new Date(endDate).toISOString() : null, isActive: data?.recurring.find(item => item.id === editing)?.isActive ?? true }, editing));
        }
    };
    const remove = (resource: 'budgets' | 'recurring', id: string) => Alert.alert('Delete entry?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => mutate(() => financeService.remove(resource, id)) }]);
    const chip = (label: string, active: boolean, onPress: () => void) => <TouchableOpacity key={label} onPress={onPress} style={{ padding: 10, borderRadius: 8, marginRight: 8, marginBottom: 8, backgroundColor: active ? '#7c3aed' : '#28252e' }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>;
    const categories = (data?.categories || []).filter(item => item.type === (tab === 'budgets' ? 'EXPENSE' : type));
    return <View className="flex-1 bg-background">
        <View className="pt-12 px-5 pb-4 flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Finance planning</Text></View>
        <View className="flex-row px-5">{(['budgets', 'recurring', 'reports'] as const).map(item => chip(item, item === tab, () => { setTab(item); setEditing(undefined); setAmount(''); setCategoryId(''); }))}</View>
        <View className="px-5">{chip('Manage income & expense categories', false, () => router.push('/(protected)/categories' as any))}</View>
        <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
            <Text className="text-white mb-2">Month (YYYY-MM)</Text><TextInput accessibilityLabel="Finance month" style={inputStyle} value={month} onChangeText={setMonth} />
            {!!error && <Text className="text-red-400 mb-4">{error}</Text>}
            {loading && !data ? <ActivityIndicator color="#8b5cf6" /> : tab === 'reports' ? <>
                <Text className="text-white text-xl mb-3">Monthly cash flow</Text>
                {[['Income', data?.aggregates?.totalIncome || 0], ['Expenses', data?.aggregates?.totalExpense || 0], ['Net savings', data?.aggregates?.netSavings || 0]].map(([label, value]) => <View key={String(label)} className="flex-row justify-between py-3"><Text className="text-white">{label}</Text><Text className="text-white">{money(Number(value))}</Text></View>)}
                <Text className="text-white text-xl mt-5 mb-3">By payment method</Text>
                {Object.entries(data?.aggregates?.methodSpending || {}).map(([name, value]) => <View key={name} className="flex-row justify-between py-2"><Text className="text-white">{name}</Text><Text className="text-white">{money(Number(value))}</Text></View>)}
                <Text className="text-white text-xl mt-5 mb-3">Daily income / expense</Text>
                {Object.entries(data?.aggregates?.dailyCashFlow || {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, values]: any) => <View key={date} className="flex-row justify-between py-2"><Text className="text-white">{date}</Text><Text className="text-white">{money(values.income)} / {money(values.expense)}</Text></View>)}
            </> : <>
                {(tab === 'budgets' ? data?.budgets : data?.recurring)?.map(item => {
                    const spent = item.categoryId ? data?.aggregates?.categorySpending?.[item.categoryId] || 0 : data?.aggregates?.methodSpending?.[item.paymentMethod] || 0;
                    return <View key={item.id} className="bg-background-surface p-4 rounded-xl mb-3">
                        <Text className="text-white font-bold">{item.category?.name || item.paymentMethod} · {money(item.amountPaise)}</Text>
                        <Text className="text-gray-300 mt-2">{tab === 'budgets' ? `${money(spent)} spent · ${Math.round(spent / item.amountPaise * 100)}% · alert at ${item.alertThreshold}%` : `${item.type} · ${item.frequency} · ${item.isActive ? 'Active' : 'Paused'}`}</Text>
                        <View className="flex-row mt-3">
                            {chip('Edit', false, () => { setEditing(item.id); setAmount(String(item.amountPaise / 100)); setCategoryId(item.categoryId || ''); setMethod(item.paymentMethod || 'UPI'); setThreshold(String(item.alertThreshold || 80)); setBudgetBy(item.categoryId ? 'category' : 'method'); if (tab === 'recurring') { setType(item.type); setDescription(item.description || ''); setFrequency(item.frequency); setStartDate(item.startDate.slice(0, 10)); setEndDate(item.endDate?.slice(0, 10) || ''); } })}
                            {tab === 'recurring' && chip(item.isActive ? 'Pause' : 'Resume', false, () => mutate(() => financeService.save('recurring', { type: item.type, amountPaise: item.amountPaise, categoryId: item.categoryId, paymentMethod: item.paymentMethod, description: item.description || '', frequency: item.frequency, startDate: item.startDate, endDate: item.endDate, isActive: !item.isActive }, item.id)))}
                            {chip('Delete', false, () => remove(tab, item.id))}
                        </View>
                    </View>;
                })}
                <Text className="text-white text-xl mt-5 mb-4">{editing ? 'Edit' : 'Add'} {tab === 'budgets' ? 'budget' : 'recurring transaction'}</Text>
                <TextInput placeholder="Amount (₹)" placeholderTextColor="#999" keyboardType="decimal-pad" style={inputStyle} value={amount} onChangeText={setAmount} />
                <View className="flex-row flex-wrap">{tab === 'budgets' ? ['category', 'method'].map(item => chip(item, budgetBy === item, () => setBudgetBy(item as any))) : ['EXPENSE', 'INCOME'].map(item => chip(item, type === item, () => { setType(item as any); setCategoryId(''); }))}</View>
                {(tab === 'recurring' || budgetBy === 'category') && <View className="flex-row flex-wrap">{categories.map(item => chip(item.name, categoryId === item.id, () => setCategoryId(item.id)))}</View>}
                {(tab === 'recurring' || budgetBy === 'method') && <View className="flex-row flex-wrap">{[...PAYMENT_METHODS, ...(PAYMENT_METHODS.includes(method) ? [] : [method])].map(item => chip(item, method === item, () => setMethod(item)))}</View>}
                {tab === 'budgets' ? <TextInput placeholder="Alert threshold (%)" placeholderTextColor="#999" keyboardType="number-pad" style={inputStyle} value={threshold} onChangeText={setThreshold} /> : <>
                    <View className="flex-row flex-wrap">{['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map(item => chip(item, frequency === item, () => setFrequency(item)))}</View>
                    <TextInput placeholder="Description" placeholderTextColor="#999" style={inputStyle} value={description} onChangeText={setDescription} />
                    <TextInput placeholder="Start date YYYY-MM-DD" placeholderTextColor="#999" style={inputStyle} value={startDate} onChangeText={setStartDate} />
                    <TextInput placeholder="End date YYYY-MM-DD (optional)" placeholderTextColor="#999" style={inputStyle} value={endDate} onChangeText={setEndDate} />
                </>}
                <TouchableOpacity disabled={saving} onPress={save} className="p-4 bg-accent rounded-xl mt-2"><Text className="text-white text-center font-bold">{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
            </>}
        </ScrollView>
    </View>;
}
