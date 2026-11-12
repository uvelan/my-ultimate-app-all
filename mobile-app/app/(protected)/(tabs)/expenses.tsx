import DateTimePicker from '@react-native-community/datetimepicker';
import { financeDateRange, financeDay } from '@/src/lib/finance-range';
import { financePeriodRange, moveFinancePeriod, FinancePeriod } from '@/src/lib/finance-period';
import { financeService } from '@/src/services/finance.service';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StatusBar, ActivityIndicator, TouchableOpacity, Modal, TextInput } from 'react-native';
import { FinanceDashboard } from '@/src/components/finance/FinanceDashboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { Menu, LayoutDashboard, ReceiptText, Shapes, Wallet, PieChart as PieIcon, LineChart, History as HistoryIcon, Plus, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, Pencil, EyeOff } from 'lucide-react-native';
import { Card } from '@/src/components/ui/Card';
import { expenseService, incomeService, categoryService } from '@/src/services/features.service';
import { useSidebar } from '@/src/components/ui/Sidebar';
import { useRouter, useFocusEffect } from 'expo-router';
import { PAYMENT_METHODS } from '@/src/lib/payment-methods';
import { dayStart } from '@shared/calendar';
import { financeDayActivity, formatActivityAmount } from '@shared/finance-day-activity';
import type { DashboardTransaction } from '@/src/lib/finance-dashboard';

type Segment = 'overview' | 'history' | 'income' | 'categories' | 'calendar';
type CalendarTransaction = DashboardTransaction & { category?: { name: string } };

export default function ExpensesScreen() {
    const router = useRouter();
    useFocusEffect(React.useCallback(() => {
        StatusBar.setBarStyle('dark-content');
        return () => StatusBar.setBarStyle('light-content');
    }, []));
    const { toggle: toggleSidebar, desktop } = useSidebar();
    const insets = useSafeAreaInsets();
    const financeRequest = useRef(0);
    const [loadError, setLoadError] = useState('');
    const [activeSegment, setActiveSegment] = useState<Segment>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [dashboardTransactions, setDashboardTransactions] = useState<CalendarTransaction[]>([]);
    const [dashboardCategories, setDashboardCategories] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [incomes, setIncomes] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    
    const [groupingMode, setGroupingMode] = useState<'category' | 'method'>('category');
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddIncomeModalOpen, setIsAddIncomeModalOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [incomeSource, setIncomeSource] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('UPI');
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
    const [submitting, setSubmitting] = useState(false);

    const [historyFilterCategory, setHistoryFilterCategory] = useState<string>('All');
    const [historyFilterMethod, setHistoryFilterMethod] = useState<string>('All');

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [period, setPeriod] = useState<FinancePeriod | 'custom'>('month');
    const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
    const [rangeOpen, setRangeOpen] = useState(false);
    const [rangeStart, setRangeStart] = useState(financeDay(new Date()));
    const [rangeEnd, setRangeEnd] = useState(financeDay(new Date()));
    const [rangeError, setRangeError] = useState('');
    const [pickerField, setPickerField] = useState<'start' | 'end' | null>(null);
    const rangeEnabled = activeSegment === 'overview' && (dateRange !== null || period !== 'month');
    const dashboardRange = dateRange ? financeDateRange(dateRange.start, dateRange.end)! : financePeriodRange(period === 'custom' ? 'month' : period, currentMonth);
    const openRange = () => {
        setRangeStart(dashboardRange.start);
        setRangeEnd(dashboardRange.end);
        setRangeError(''); setPickerField(null); setRangeOpen(true);
    };
    const applyRange = () => {
        if (!financeDateRange(rangeStart, rangeEnd)) { setRangeError('Start date must be on or before the end date.'); return; }
        setDateRange({ start: rangeStart, end: rangeEnd }); setCurrentMonth(new Date(rangeStart + 'T12:00:00+05:30')); setPeriod('custom'); setRangeOpen(false); setPickerField(null);
    };
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [isDayModalOpen, setIsDayModalOpen] = useState(false);
    const [hiddenDayIds, setHiddenDayIds] = useState<Set<string>>(() => new Set());
    const dayTransactions = useMemo(() => {
        if (!selectedDay) return [];
        const day = dayStart(selectedDay).getTime();
        return dashboardTransactions.filter(item => dayStart(new Date(item.transactionDate)).getTime() === day);
    }, [dashboardTransactions, selectedDay]);
    const dayActivity = useMemo(() => financeDayActivity(dayTransactions, hiddenDayIds), [dayTransactions, hiddenDayIds]);

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = firstDay.getDay();
        
        const days = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        
        for (let i = startOffset - 1; i >= 0; i--) {
            days.push(new Date(year, month - 1, prevMonthLastDay - i));
        }
        
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push(new Date(year, month, i));
        }
        
        const remainingCount = 42 - days.length;
        for (let i = 1; i <= remainingCount; i++) {
            days.push(new Date(year, month + 1, i));
        }
        
        return days;
    };

    const navigatePeriod = (direction: number) => {
        const selected = activeSegment === 'overview' && period !== 'custom' ? period : 'month';
        setDateRange(null);
        if (period === 'custom') setPeriod('month');
        setCurrentMonth(moveFinancePeriod(selected, currentMonth, direction));
    };
    const nextMonth = () => navigatePeriod(1);
    const prevMonth = () => navigatePeriod(-1);
    const goToday = () => { setDateRange(null); setPeriod('month'); setCurrentMonth(new Date()); };

    const fetchData = async () => {
        const request = ++financeRequest.current;
        setRefreshing(true);
        setLoadError('');
        try {
            const selectedRange = activeSegment === 'overview' ? dashboardRange : financePeriodRange('month', currentMonth);
            const [transactions, allCategories] = await Promise.all([
                financeService.transactions({ startDate: selectedRange.startDate, endDate: selectedRange.endDate }),
                financeService.categories(true),
            ]);
            if (request !== financeRequest.current) return;
            const legacy = (item: any) => ({ ...item, amount: item.amountPaise / 100, date: item.transactionDate, notes: item.description, source: item.category?.name || item.description || 'Income' });
            setDashboardTransactions(transactions);
            setHiddenDayIds(new Set());
            setDashboardCategories(allCategories);
            setExpenses(transactions.filter(item => item.type === 'EXPENSE').map(legacy));
            setIncomes(transactions.filter(item => item.type === 'INCOME').map(legacy));
            setCategories(allCategories.filter(item => item.type === 'EXPENSE' && !item.isArchived));
        } catch (error: any) {
            if (request !== financeRequest.current) return;
            console.error('Expense Fetch Error:', error.message);
            setLoadError(error.response?.data?.error || 'Unable to load finance. Pull down to retry.');
        } finally {
            if (request === financeRequest.current) { setLoading(false); setRefreshing(false); }
        }
    };

    useEffect(() => {
        fetchData();
        return () => { financeRequest.current++; };
    }, [currentMonth, period, dateRange, activeSegment === 'overview']);

    const onRefresh = () => {
        setHiddenDayIds(new Set());
        void fetchData();
    };

    const [selectedCategory, setSelectedCategory] = useState<string>('');

    const handleAddExpense = async () => {
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !selectedCategory || Number.isNaN(Date.parse(expenseDate))) {
            alert("Please enter amount, category, and date");
            return;
        }
        setSubmitting(true);
        try {
            const expenseData = {
                amount: parseFloat(amount),
                categoryId: selectedCategory,
                date: new Date(expenseDate).toISOString(),
                notes,
                paymentMethod
            };
            
            if (editingExpenseId) {
                await expenseService.updateExpense(editingExpenseId, expenseData);
            } else {
                await expenseService.addExpense(expenseData);
            }
            
            setIsAddModalOpen(false);
            setAmount('');
            setNotes('');
            setSelectedCategory('');
            setEditingExpenseId(null);
            setExpenseDate(new Date().toISOString().split('T')[0]);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Failed to save expense");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditExpense = (item: any) => {
        setAmount(item.amount.toString());
        setNotes(item.notes || '');
        setSelectedCategory(item.categoryId);
        setPaymentMethod(item.paymentMethod);
        setExpenseDate(new Date(item.date).toISOString().split('T')[0]);
        setEditingExpenseId(item.id);
        setIsAddModalOpen(true);
    };

    const handleAddIncome = async () => {
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !incomeSource.trim() || Number.isNaN(Date.parse(expenseDate))) {
            alert("Please enter amount, source, and date");
            return;
        }
        setSubmitting(true);
        try {
            const incomeData = {
                amount: parseFloat(amount),
                source: incomeSource,
                date: new Date(expenseDate).toISOString(),
                notes
            };
            
            await incomeService.addIncome(incomeData);
            
            setIsAddIncomeModalOpen(false);
            setAmount('');
            setNotes('');
            setIncomeSource('');
            setExpenseDate(new Date().toISOString().split('T')[0]);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Failed to save income");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteIncome = async (id: string) => {
        try {
            await incomeService.deleteIncome(id);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteExpense = async (id: string) => {
        try {
            await expenseService.deleteExpense(id);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        try {
            await categoryService.deleteCategory(id);
            fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 bg-[#f9f9ff] items-center justify-center">
                <ActivityIndicator size="large" color="#8b5cf6" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#f9f9ff' }}>
            <View style={{ backgroundColor: '#fff', paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e8eeff' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{!desktop && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open app menu" onPress={toggleSidebar}><Menu size={24} color="#001642" /></TouchableOpacity>}<Text style={{ fontSize: 24, fontWeight: '800', color: '#001642' }}>Finance</Text></View>
                    <TouchableOpacity accessibilityLabel={activeSegment === 'income' ? 'Add income' : 'Add transaction'} onPress={() => activeSegment === 'income' ? setIsAddIncomeModalOpen(true) : setIsAddModalOpen(true)} style={{ backgroundColor: '#001642', padding: 9, borderRadius: 24 }}><Plus size={22} color="#fff" /></TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}><CalendarIcon size={18} color="#444650" /><Text style={{ fontSize: rangeEnabled ? 11 : 15, fontWeight: '700', color: '#041b3c', flexShrink: 1 }}>{rangeEnabled ? dashboardRange.start + ' – ' + dashboardRange.end : currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text></View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f3ff', borderRadius: 12 }}>
                        <TouchableOpacity accessibilityLabel="Previous period" onPress={prevMonth} style={{ padding: 9 }}><ChevronLeft size={18} color="#001642" /></TouchableOpacity>
                        <TouchableOpacity onPress={goToday} style={{ paddingHorizontal: 5 }}><Text style={{ fontSize: 11, color: '#001642', fontWeight: '700' }}>Today</Text></TouchableOpacity>
                        <TouchableOpacity accessibilityLabel="Next period" onPress={nextMonth} style={{ padding: 9 }}><ChevronRight size={18} color="#001642" /></TouchableOpacity>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                    {activeSegment === 'overview' && <TouchableOpacity accessibilityLabel="Choose dashboard date range" onPress={openRange}><Text style={{ fontSize: 12, fontWeight: '700', color: '#001642' }}>{dateRange ? 'Edit range' : 'Date range'}</Text></TouchableOpacity>}
                    {rangeEnabled && <TouchableOpacity accessibilityLabel="Reset dashboard date range" onPress={() => { setDateRange(null); setPeriod('month'); }}><Text style={{ fontSize: 12, fontWeight: '600', color: '#444650' }}>Reset</Text></TouchableOpacity>}
                    <TouchableOpacity onPress={() => router.push('/(protected)/finance?tab=budgets' as any)}><Text style={{ fontSize: 12, fontWeight: '600', color: '#026c47' }}>Budgets</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/(protected)/finance?tab=recurring' as any)}><Text style={{ fontSize: 12, fontWeight: '600', color: '#026c47' }}>Recurring</Text></TouchableOpacity>
                    {activeSegment === 'history' && <TouchableOpacity onPress={() => setActiveSegment('income')}><Text style={{ fontSize: 12, fontWeight: '600', color: '#001642' }}>View income</Text></TouchableOpacity>}
                    {activeSegment === 'income' && <TouchableOpacity onPress={() => setActiveSegment('history')}><Text style={{ fontSize: 12, fontWeight: '600', color: '#001642' }}>View expenses</Text></TouchableOpacity>}
                </View>
                {activeSegment === 'overview' && <View accessibilityLabel="Dashboard period" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {([{ value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'halfYear', label: 'Half-year' }, { value: 'year', label: 'Year' }, { value: 'custom', label: 'Custom' }] as const).map(option => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: period === option.value }} onPress={() => { if (option.value === 'custom') openRange(); else { setPeriod(option.value); setDateRange(null); } }} style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: period === option.value ? '#001642' : '#f1f3ff' }}><Text style={{ fontSize: 12, fontWeight: '600', color: period === option.value ? '#fff' : '#001642' }}>{option.label}</Text></TouchableOpacity>)}
                </View>}
                {!!loadError && <Text accessibilityRole="alert" style={{ color: '#ba1a1a', marginTop: 12 }}>{loadError}</Text>}
            </View>

            <ScrollView
                style={{ flex: 1, backgroundColor: '#f9f9ff' }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
            >
                {activeSegment === 'overview' ? (
                    <FinanceDashboard transactions={dashboardTransactions} categories={dashboardCategories} grouping={groupingMode} onGrouping={setGroupingMode} rangeStart={dashboardRange.start} rangeEnd={dashboardRange.end} busy={refreshing || !!loadError} />
                ) : activeSegment === 'history' ? (
                    <View className="p-6">
                        <View className="flex-row items-center mb-4 gap-2">
                            <HistoryIcon size={20} color="#8b5cf6" />
                            <Text className="text-[#041b3c] font-bold text-xl font-serif">History</Text>
                        </View>

                        {/* Filters */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            <TouchableOpacity onPress={() => setHistoryFilterMethod('All')} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterMethod === 'All' ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}>
                                <Text className={`text-xs font-bold ${historyFilterMethod === 'All' ? 'text-[#041b3c]' : 'text-[#444650]'}`}>All Methods</Text>
                            </TouchableOpacity>
                            {[...new Set([...PAYMENT_METHODS, ...expenses.map(item => item.paymentMethod).filter(Boolean)])].map(m => (
                                <TouchableOpacity key={m} onPress={() => setHistoryFilterMethod(m)} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterMethod === m ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}>
                                    <Text className={`text-xs font-bold ${historyFilterMethod === m ? 'text-[#041b3c]' : 'text-[#444650]'}`}>{m}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                            <TouchableOpacity onPress={() => setHistoryFilterCategory('All')} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterCategory === 'All' ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}>
                                <Text className={`text-xs font-bold ${historyFilterCategory === 'All' ? 'text-[#041b3c]' : 'text-[#444650]'}`}>All Categories</Text>
                            </TouchableOpacity>
                            {categories.map(c => (
                                <TouchableOpacity key={c.id} onPress={() => setHistoryFilterCategory(c.id)} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterCategory === c.id ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}>
                                    <View className="flex-row items-center">
                                        <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />
                                        <Text className={`text-xs font-bold ${historyFilterCategory === c.id ? 'text-[#041b3c]' : 'text-[#444650]'}`}>{c.name}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {(() => {
                            const filteredHistory = expenses
                                .filter(item => historyFilterMethod === 'All' || item.paymentMethod === historyFilterMethod)
                                .filter(item => historyFilterCategory === 'All' || item.categoryId === historyFilterCategory);
                                
                            const totalFiltered = filteredHistory.reduce((sum, item) => sum + item.amount, 0);

                            return (
                                <>
                                    <View className="flex-row justify-between items-center mb-4 px-2">
                                        <Text className="text-[#444650] font-bold text-xs uppercase tracking-wider">Count: {filteredHistory.length}</Text>
                                        <Text className="text-[#ef4444] font-bold text-lg tracking-tight">Total: -₹{totalFiltered.toLocaleString()}</Text>
                                    </View>

                                    {filteredHistory.length === 0 ? (
                                        <View className="mt-8 items-center">
                                            <Text className="text-[#444650]/40 italic text-center">No transactions found</Text>
                                        </View>
                                    ) : (
                                        filteredHistory.map((item) => (
                                            <Card style={{ backgroundColor: '#fff', borderColor: '#e8eeff' }} key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm">
                                                <View className="flex-1">
                                                    <Text className="text-[#041b3c] font-bold text-base">{item.notes || item.category?.name || 'Expense'}</Text>
                                                    <Text className="text-[#444650]/60 text-xs mt-0.5">
                                                        {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </Text>
                                                </View>
                                                <View className="items-end flex-row gap-3 mt-1">
                                                    <View className="items-end mr-2">
                                                        <Text className="text-[#ef4444] font-bold text-lg">-₹{item.amount.toLocaleString()}</Text>
                                                        <Text className="text-[#444650]/40 text-[10px] uppercase tracking-tighter">{item.paymentMethod}</Text>
                                                    </View>
                                                    <TouchableOpacity onPress={() => handleEditExpense(item)} className="bg-blue-500/10 p-2 rounded-full">
                                                        <Pencil size={16} color="#3b82f6" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => handleDeleteExpense(item.id)} className="bg-red-500/10 p-2 rounded-full">
                                                        <Trash2 size={16} color="#ef4444" />
                                                    </TouchableOpacity>
                                                </View>
                                            </Card>
                                        ))
                                    )}
                                </>
                            );
                        })()}
                    </View>
                ) : activeSegment === 'income' ? (
                    <View className="p-6">
                        <View className="flex-row items-center mb-6 gap-2">
                            <Wallet size={20} color="#10b981" />
                            <Text className="text-[#041b3c] font-bold text-xl font-serif">Income Stream</Text>
                        </View>

                        {incomes.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-[#444650]/40 italic text-center">No income records found</Text>
                            </View>
                        ) : (
                            incomes.map((item) => (
                                <Card style={{ backgroundColor: '#fff', borderColor: '#e8eeff' }} key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#10b981]">
                                    <View className="flex-1">
                                        <Text className="text-[#041b3c] font-bold text-base">{item.source}</Text>
                                        <Text className="text-[#444650]/60 text-xs mt-0.5">
                                            {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                    </View>
                                    <View className="flex-row items-center gap-3">
                                        <View className="items-end">
                                            <Text className="text-[#10b981] font-bold text-lg">+₹{item.amount.toLocaleString()}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleDeleteIncome(item.id)} className="bg-red-500/10 p-2 rounded-full">
                                            <Trash2 size={16} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                </Card>
                            ))
                        )}
                    </View>
                ) : activeSegment === 'categories' ? (
                    <View className="p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <View className="flex-row items-center gap-2">
                                <PieIcon size={20} color="#8b5cf6" />
                                <Text className="text-[#041b3c] font-bold text-xl font-serif">Categories</Text>
                            </View>
                            <TouchableOpacity onPress={() => router.push('../categories?add=1')} className="bg-accent/30 px-3 py-1.5 rounded-lg flex-row items-center">
                                <Plus size={16} color="#ffffff" />
                                <Text className="text-[#041b3c] font-bold ml-1 text-xs">Add</Text>
                            </TouchableOpacity>
                        </View>

                        {categories.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-[#444650]/40 italic text-center">No categories found</Text>
                            </View>
                        ) : (
                            <View className="flex-row flex-wrap justify-between">
                                {categories.map((item) => (
                                    <Card style={{ backgroundColor: '#fff', borderColor: '#e8eeff' }} key={item.id} className="p-4 mb-3 w-[48%] flex-col items-center shadow-sm border border-border">
                                        <View className="w-8 h-8 rounded-full mb-2" style={{ backgroundColor: item.color }} />
                                        <Text className="text-[#041b3c] font-bold text-center mb-2">{item.name}</Text>
                                        <TouchableOpacity onPress={() => handleDeleteCategory(item.id)} className="bg-red-500/10 p-2 rounded-full mt-2">
                                            <X size={14} color="#ef4444" />
                                        </TouchableOpacity>
                                    </Card>
                                ))}
                            </View>
                        )}
                    </View>
                ) : activeSegment === 'calendar' ? (
                    <View className="p-6">
                        <Card style={{ backgroundColor: '#fff', borderColor: '#e8eeff' }} className="p-0 overflow-hidden border-border">
                            {/* Days Header */}
                            <View className="flex-row border-b border-border/60 bg-[#f9f9ff]">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <View key={i} className="flex-1 py-3 items-center border-r last:border-r-0 border-border/30">
                                        <Text className="text-[#444650]/80 font-bold text-[10px] uppercase">{d}</Text>
                                    </View>
                                ))}
                            </View>
                            
                            {/* Grid */}
                            <View className="flex-row flex-wrap">
                                {getDaysInMonth(currentMonth).map((day, idx) => {
                                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                                    const isToday = day.getDate() === new Date().getDate() && day.getMonth() === new Date().getMonth() && day.getFullYear() === new Date().getFullYear();
                                    
                                    const dayExpenses = expenses.filter(e => {
                                        const d = new Date(e.date);
                                        return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getFullYear() === day.getFullYear();
                                    });
                                    const dayIncomes = incomes.filter(i => {
                                        const d = new Date(i.date);
                                        return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getFullYear() === day.getFullYear();
                                    });
                                    
                                    const totalExp = dayExpenses.reduce((sum, e) => sum + e.amount, 0);
                                    const totalInc = dayIncomes.reduce((sum, i) => sum + i.amount, 0);
                                    const hasActivity = totalExp > 0 || totalInc > 0;

                                    return (
                                        <TouchableOpacity
                                            key={idx}
                                            onPress={() => {
                                                if (hasActivity) {
                                                    if (day.getTime() !== selectedDay?.getTime()) setHiddenDayIds(new Set());
                                                    setSelectedDay(day);
                                                    setIsDayModalOpen(true);
                                                }
                                            }}
                                            className={`w-[14.28%] h-20 border-r border-b border-border/30 p-1 ${isCurrentMonth ? '' : 'bg-black/20'} ${hasActivity ? 'bg-accent/30/10' : ''}`}
                                        >
                                            <View className={`w-5 h-5 rounded-full items-center justify-center mb-1 ${isToday ? 'bg-accent' : ''}`}>
                                                <Text className={`text-[10px] font-bold ${isToday ? 'text-[#041b3c]' : isCurrentMonth ? 'text-[#444650]' : 'text-[#444650]/30'}`}>
                                                    {day.getDate()}
                                                </Text>
                                            </View>
                                            
                                            {totalInc > 0 && (
                                                <Text className="text-[#10b981] font-bold text-[8px] bg-[#10b981]/10 px-1 py-0.5 rounded overflow-hidden mb-0.5 whitespace-nowrap" numberOfLines={1}>
                                                    +{totalInc >= 1000 ? (totalInc/1000).toFixed(1) + 'k' : totalInc}
                                                </Text>
                                            )}
                                            {totalExp > 0 && (
                                                <Text className="text-[#ef4444] font-bold text-[8px] bg-[#ef4444]/10 px-1 py-0.5 rounded overflow-hidden whitespace-nowrap" numberOfLines={1}>
                                                    -{totalExp >= 1000 ? (totalExp/1000).toFixed(1) + 'k' : totalExp}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </Card>
                    </View>
                ) : null}
                <View className="h-10" />
            </ScrollView>

            <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8eeff', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 6 }}>
                {[
                    { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
                    { key: 'history', label: 'Transactions', Icon: ReceiptText },
                    { key: 'calendar', label: 'Calendar', Icon: CalendarIcon },
                    { key: 'budgets', label: 'Budgets', Icon: Wallet },
                    { key: 'categories', label: 'Categories', Icon: Shapes },
                ].map(({ key, label, Icon }) => {
                    const active = activeSegment === key || key === 'history' && activeSegment === 'income';
                    return <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => key === 'budgets' ? router.push('/(protected)/finance?tab=budgets' as any) : setActiveSegment(key as Segment)} style={{ flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 20, backgroundColor: active ? '#9df5c5' : 'transparent' }}><Icon size={22} color={active ? '#002113' : '#444650'} /><Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '600', color: active ? '#002113' : '#444650' }}>{label}</Text></TouchableOpacity>;
                })}
            </View>

            <Modal visible={rangeOpen} transparent animationType="slide" onRequestClose={() => setRangeOpen(false)}>
                <View style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}><View style={{ backgroundColor: '#fff', padding: 24, paddingBottom: Math.max(insets.bottom, 24), borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}><Text style={{ fontSize: 22, fontWeight: '800', color: '#001642' }}>Dashboard date range</Text><TouchableOpacity accessibilityLabel="Close date range" onPress={() => setRangeOpen(false)}><X size={24} color="#444650" /></TouchableOpacity></View>
                    <Text style={{ color: '#444650', marginBottom: 20 }}>Include transactions from the start date through the end date.</Text>
                    {(['start', 'end'] as const).map(field => <View key={field} style={{ marginBottom: 18 }}><Text style={{ color: '#444650', fontSize: 12, fontWeight: '600', marginBottom: 8 }}>{field === 'start' ? 'From' : 'To'}</Text><TouchableOpacity accessibilityLabel={field === 'start' ? 'Select start date' : 'Select end date'} onPress={() => setPickerField(field)} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f1f3ff', padding: 14, borderRadius: 12 }}><Text style={{ color: '#041b3c', fontWeight: '600' }}>{field === 'start' ? rangeStart : rangeEnd}</Text><CalendarIcon size={20} color="#001642" /></TouchableOpacity></View>)}
                    {pickerField && <DateTimePicker mode="date" display="default" value={new Date((pickerField === 'start' ? rangeStart : rangeEnd) + 'T12:00:00+05:30')} onChange={(event, date) => { const field = pickerField; setPickerField(null); if (event.type === 'set' && date) { if (field === 'start') setRangeStart(financeDay(date)); else setRangeEnd(financeDay(date)); setRangeError(''); } }} />}
                    {!!rangeError && <Text accessibilityRole="alert" style={{ color: '#ba1a1a', marginBottom: 16 }}>{rangeError}</Text>}
                    <TouchableOpacity accessibilityRole="button" onPress={applyRange} style={{ backgroundColor: '#001642', padding: 16, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>Apply range</Text></TouchableOpacity>
                </View></View>
            </Modal>

            {/* Add Expense Modal */}
            <Modal visible={isAddModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#f9f9ff] rounded-t-3xl p-6 min-h-[50%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#041b3c] font-serif">Add Expense</Text>
                            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#444650] font-bold mb-2">Amount (₹)</Text>
                        <TextInput 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-4 font-bold text-lg"
                            placeholderTextColor="#6b7280"
                            placeholder="0.00"
                        />

                        <Text className="text-[#444650] font-bold mb-2">Notes</Text>
                        <TextInput 
                            value={notes}
                            onChangeText={setNotes}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-6"
                            placeholderTextColor="#6b7280"
                            placeholder="E.g. Lunch, Groceries..."
                        />

                        <Text className="text-[#444650] font-bold mb-2">Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            {categories.map(cat => (
                                <TouchableOpacity 
                                    key={cat.id} 
                                    onPress={() => setSelectedCategory(cat.id)}
                                    className={`mr-3 px-4 py-2 rounded-full border ${selectedCategory === cat.id ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}
                                >
                                    <View className="flex-row items-center">
                                        <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: cat.color }} />
                                        <Text className={`font-bold ${selectedCategory === cat.id ? 'text-[#041b3c]' : 'text-[#444650]'}`}>{cat.name}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text className="text-[#444650] font-bold mb-2">Payment Method</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            {[...PAYMENT_METHODS, ...(PAYMENT_METHODS.includes(paymentMethod) ? [] : [paymentMethod])].map(method => (
                                <TouchableOpacity 
                                    key={method} 
                                    onPress={() => setPaymentMethod(method)}
                                    className={`mr-3 px-4 py-2 rounded-full border ${paymentMethod === method ? 'border-accent bg-accent' : 'border-border/60 bg-[#f9f9ff]'}`}
                                >
                                    <Text className={`font-bold ${paymentMethod === method ? 'text-[#041b3c]' : 'text-[#444650]'}`}>{method}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text className="text-[#444650] font-bold mb-2">Date (YYYY-MM-DD)</Text>
                        <TextInput 
                            value={expenseDate}
                            onChangeText={setExpenseDate}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-6 font-bold"
                            placeholderTextColor="#6b7280"
                            placeholder="YYYY-MM-DD"
                        />

                        <TouchableOpacity 
                            onPress={handleAddExpense}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center ${submitting ? 'bg-accent/30' : 'bg-accent'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text className="text-[#041b3c] font-bold text-lg">{editingExpenseId ? 'Update Expense' : 'Save Expense'}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Day Activity Modal */}
            <Modal visible={isDayModalOpen} animationType="slide" transparent={true} onRequestClose={() => setIsDayModalOpen(false)}>
                <View className="flex-1 justify-end bg-black/50">
                    <View accessibilityViewIsModal className="bg-[#f9f9ff] rounded-t-3xl p-5 h-[80%] border-t border-border">
                        <View className="flex-row justify-between items-center gap-2 mb-3">
                            <Text accessibilityRole="header" className="flex-1 text-xl font-bold text-[#041b3c] font-serif">
                                Activity for {selectedDay?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close day activity" onPress={() => setIsDayModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row gap-3">
                            <View className="flex-1 rounded-xl border border-[#10b981]/20 bg-[#10b981]/10 p-3">
                                <Text className="text-[#087f5b] font-bold text-xs mb-1">Income</Text>
                                <Text accessibilityLiveRegion="polite" className="text-[#087f5b] font-bold text-lg">+{formatActivityAmount(dayActivity.incomePaise)}</Text>
                            </View>
                            <View className="flex-1 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/10 p-3">
                                <Text className="text-[#b42331] font-bold text-xs mb-1">Expense</Text>
                                <Text accessibilityLiveRegion="polite" className="text-[#b42331] font-bold text-lg">−{formatActivityAmount(dayActivity.expensePaise)}</Text>
                            </View>
                        </View>
                        <View className="my-2 flex-row flex-wrap items-center justify-between gap-2">
                            <Text accessibilityLiveRegion="polite" className="flex-1 text-xs text-[#444650]">
                                {dayActivity.hiddenCount ? `${dayActivity.hiddenCount} temporarily hidden` : 'Hide rows to preview different totals'}
                            </Text>
                            {dayActivity.hiddenCount > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => setHiddenDayIds(new Set())} className="min-h-11 justify-center px-2">
                                <Text className="font-bold text-[#087f5b]">Show all</Text>
                            </TouchableOpacity>}
                            <TouchableOpacity accessibilityRole="button" disabled={refreshing} accessibilityState={{ disabled: refreshing }}
                                onPress={onRefresh} className="min-h-11 justify-center px-2">
                                <Text className="font-bold text-[#041b3c]">{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView className="flex-1" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
                            contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}>
                            {!!loadError && <Text className="mb-3 text-[#b42331]">{loadError}</Text>}
                            {!dayActivity.visible.length && <Text className="py-6 text-center text-[#444650]">
                                {dayActivity.hiddenCount ? 'All transactions for this day are hidden.' : 'No transactions for this day.'}
                            </Text>}
                            {(['INCOME', 'EXPENSE'] as const).flatMap(type => dayActivity.visible.filter(item => item.type === type)).map(item => {
                                const income = item.type === 'INCOME';
                                const title = item.category?.name || (income ? item.description || 'Income' : 'Expense');
                                const color = income ? '#087f5b' : '#b42331';
                                const method = income ? 'Income' : item.paymentMethod;
                                return <Card key={item.id}
                                    style={{ backgroundColor: '#fff', borderColor: '#e8eeff', borderLeftColor: income ? '#10b981' : '#ef4444' }}
                                    className="mb-3 flex-row items-center gap-2 border-l-4 p-3 shadow-sm">
                                    <View className="min-w-0 flex-1">
                                        <View className="flex-row flex-wrap items-center gap-2">
                                            <Text className="text-base font-bold" style={{ color: income ? color : '#041b3c' }}>{title}</Text>
                                            {!!method && <Text className="rounded border border-[#dce3f4] bg-[#e8eeff] px-2 py-0.5 text-[10px] uppercase text-[#444650]">{method}</Text>}
                                        </View>
                                        <Text className="mt-1 text-xs text-[#444650]">{item.description || 'No description'}</Text>
                                    </View>
                                    <Text className="shrink-0 text-base font-bold" style={{ color }}>{income ? '+' : '−'}{formatActivityAmount(item.amountPaise)}</Text>
                                    <TouchableOpacity accessibilityRole="button"
                                        accessibilityLabel={`Hide ${item.description || title} temporarily`}
                                        onPress={() => setHiddenDayIds(current => new Set(current).add(item.id))}
                                        className="h-11 w-11 items-center justify-center rounded-lg bg-[#e8eeff]">
                                        <EyeOff size={18} color="#444650" />
                                    </TouchableOpacity>
                                </Card>;
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            {/* Add Income Modal */}
            <Modal visible={isAddIncomeModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#f9f9ff] rounded-t-3xl p-6 min-h-[50%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#041b3c] font-serif">Add Income</Text>
                            <TouchableOpacity onPress={() => setIsAddIncomeModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#444650] font-bold mb-2">Amount (₹)</Text>
                        <TextInput 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-4 font-bold text-lg"
                            placeholderTextColor="#6b7280"
                            placeholder="0.00"
                        />

                        <Text className="text-[#444650] font-bold mb-2">Source</Text>
                        <TextInput 
                            value={incomeSource}
                            onChangeText={setIncomeSource}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-4"
                            placeholderTextColor="#6b7280"
                            placeholder="E.g. Salary, Freelance..."
                        />

                        <Text className="text-[#444650] font-bold mb-2">Notes (Optional)</Text>
                        <TextInput 
                            value={notes}
                            onChangeText={setNotes}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-6"
                            placeholderTextColor="#6b7280"
                            placeholder="Extra details..."
                        />

                        <Text className="text-[#444650] font-bold mb-2">Date (YYYY-MM-DD)</Text>
                        <TextInput 
                            value={expenseDate}
                            onChangeText={setExpenseDate}
                            className="bg-[#f9f9ff] text-[#041b3c] p-4 rounded-xl border border-border mb-6 font-bold"
                            placeholderTextColor="#6b7280"
                            placeholder="YYYY-MM-DD"
                        />

                        <TouchableOpacity 
                            onPress={handleAddIncome}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center ${submitting ? 'bg-accent/30' : 'bg-[#10b981]'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text className="text-[#041b3c] font-bold text-lg">Save Income</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
