import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput } from 'react-native';
import { StatCard } from '@/src/components/ui/StatCard';
import { ExpensePieChart } from '@/src/components/ui/ExpensePieChart';
import { ExpenseTrendChart } from '@/src/components/ui/ExpenseTrendChart';
import { TrendingDown, Wallet, PieChart as PieIcon, LineChart, History as HistoryIcon, Plus, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react-native';
import { Card } from '@/src/components/ui/Card';
import { expenseService, incomeService, categoryService } from '@/src/services/features.service';
import { SidebarToggle } from '@/src/components/ui/Sidebar';

type Segment = 'overview' | 'history' | 'income' | 'categories' | 'calendar';

export default function ExpensesScreen() {
    const [activeSegment, setActiveSegment] = useState<Segment>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [historical, setHistorical] = useState<any>([]);
    const [breakdown, setBreakdown] = useState<any>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [incomes, setIncomes] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    
    const [groupingMode, setGroupingMode] = useState<'category' | 'method'>('category');
    const [historicalCategories, setHistoricalCategories] = useState<{name: string, color: string}[]>([]);
    const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
    const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

    const toggleCategory = (name: string) => {
        setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddIncomeModalOpen, setIsAddIncomeModalOpen] = useState(false);
    const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [incomeSource, setIncomeSource] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('UPI');
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
    const [submitting, setSubmitting] = useState(false);

    const [historyFilterCategory, setHistoryFilterCategory] = useState<string>('All');
    const [historyFilterMethod, setHistoryFilterMethod] = useState<string>('All');

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [isDayModalOpen, setIsDayModalOpen] = useState(false);

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

    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const goToday = () => setCurrentMonth(new Date());

    const fetchData = async () => {
        try {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            const startDate = new Date(year, month, 1).toISOString();
            const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

            const [statsRes, trendRes, listRes, listInc, listCat] = await Promise.all([
                expenseService.getStats(startDate, endDate).catch(() => null),
                expenseService.getHistorical('month', groupingMode).catch(() => null),
                expenseService.getExpenses(startDate, endDate).catch(() => []),
                incomeService.getIncomes().catch(() => []), // Assuming APIs exist for these
                categoryService.getCategories().catch(() => [])
            ]);

            if (statsRes) {
                setStats(statsRes);
                setBreakdown(groupingMode === 'category' ? (statsRes.categorySplit || []) : (statsRes.methodSplit || []));
            }
            if (trendRes) {
                setHistorical(trendRes.chartData || []);
                setHistoricalCategories(trendRes.categories || []);
            }
            if (listRes) {
                setExpenses(listRes);
            }
            if (listInc) {
                setIncomes(listInc);
            }
            if (listCat) {
                setCategories(listCat);
            }

        } catch (error: any) {
            console.error('Expense Fetch Error:', error.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentMonth, groupingMode]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const [selectedCategory, setSelectedCategory] = useState<string>('');

    const handleAddExpense = async () => {
        if (!amount || !selectedCategory || !expenseDate) {
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
        if (!amount || !incomeSource || !expenseDate) {
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

    const handleAddCategory = async () => {
        if (!newCategoryName) return;
        setSubmitting(true);
        try {
            await categoryService.addCategory({ name: newCategoryName, color: newCategoryColor });
            setIsAddCategoryModalOpen(false);
            setNewCategoryName('');
            fetchData();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
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
            <View className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator size="large" color="#8b5cf6" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-background">
            <View className="px-6 pt-12 pb-4 bg-background/50 border-b border-border">
                <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center">
                        <SidebarToggle />
                        <Text className="text-3xl font-bold text-text-primary font-serif ml-3">Financials</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                        <TouchableOpacity 
                            onPress={() => activeSegment === 'income' ? setIsAddIncomeModalOpen(true) : setIsAddModalOpen(true)} 
                            className="bg-accent p-2 rounded-full shadow-lg"
                        >
                            <Plus size={20} color="#ffffff" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Segment Switcher */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-6">
                    <View className="flex-row bg-background rounded-xl p-1 border border-border min-w-full">
                        <TouchableOpacity
                            onPress={() => setActiveSegment('overview')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'overview' ? 'bg-accent' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'overview' ? 'text-text-primary' : 'text-text-muted'}`}>Overview</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('history')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'history' ? 'bg-accent' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'history' ? 'text-text-primary' : 'text-text-muted'}`}>History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('income')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'income' ? 'bg-accent' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'income' ? 'text-text-primary' : 'text-text-muted'}`}>Income</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('calendar')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'calendar' ? 'bg-accent' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'calendar' ? 'text-text-primary' : 'text-text-muted'}`}>Calendar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('categories')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'categories' ? 'bg-accent' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'categories' ? 'text-text-primary' : 'text-text-muted'}`}>Categories</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                {/* Global Month Selector */}
                <View className="flex-row justify-between items-center mt-4">
                    <View className="flex-row items-center gap-2">
                        <CalendarIcon size={20} color="#8b5cf6" />
                        <Text className="text-text-primary font-bold text-xl font-serif">
                            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                    </View>
                    <View className="flex-row items-center bg-background rounded-lg border border-border p-1">
                        <TouchableOpacity onPress={prevMonth} className="px-2 py-1">
                            <ChevronLeft size={18} color="#a39b98" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={goToday} className="px-3 py-1">
                            <Text className="text-text-primary font-bold text-xs uppercase tracking-wider">Today</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={nextMonth} className="px-2 py-1">
                            <ChevronRight size={18} color="#a39b98" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />}
            >
                {activeSegment === 'overview' ? (
                    <View className="p-6">
                        <View className="flex-row justify-between gap-3 mb-8">
                            <StatCard
                                label="Balance"
                                value={`₹${stats?.balance?.toLocaleString() || '0'}`}
                                icon={Wallet}
                                color="#60a5fa"
                            />
                            <StatCard
                                label="Income"
                                value={`₹${stats?.totalIncome?.toLocaleString() || '0'}`}
                                icon={Wallet}
                                color="#10b981"
                            />
                            <StatCard
                                label="Spent"
                                value={`₹${stats?.totalExpense?.toLocaleString() || '0'}`}
                                icon={TrendingDown}
                                color="#ef4444"
                            />
                        </View>

                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center gap-2">
                                <PieIcon size={20} color="#8b5cf6" />
                                <Text className="text-text-primary font-bold text-xl font-serif">Breakdown</Text>
                            </View>
                            <View className="flex-row bg-background rounded-lg border border-border p-1">
                                <TouchableOpacity onPress={() => setGroupingMode('category')} className={`px-2 py-1 ${groupingMode === 'category' ? 'bg-accent/30 rounded-md' : ''}`}>
                                    <Text className="text-text-primary text-xs font-bold uppercase">Category</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setGroupingMode('method')} className={`px-2 py-1 ${groupingMode === 'method' ? 'bg-accent/30 rounded-md' : ''}`}>
                                    <Text className="text-text-primary text-xs font-bold uppercase">Method</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <Card className="p-6 mb-8">
                            <ExpensePieChart data={breakdown} hiddenCategories={hiddenCategories} onToggleCategory={toggleCategory} />
                        </Card>

                        <View className="flex-row items-center mb-4 gap-2">
                            <LineChart size={20} color="#8b5cf6" />
                            <Text className="text-text-primary font-bold text-xl font-serif">Trends</Text>
                        </View>
                        <Card className="p-4 pt-8 mb-8">
                            <ExpenseTrendChart data={historical} categories={historicalCategories} hiddenCategories={hiddenCategories} />
                        </Card>

                        {/* Expense Summary Table */}
                        <View className="flex-row items-center mb-4 gap-2">
                            <Wallet size={20} color="#8b5cf6" />
                            <Text className="text-text-primary font-bold text-xl font-serif">Summary</Text>
                        </View>
                        <Card className="p-4 mb-8">
                            <View className="flex-row justify-between py-2 border-b border-border">
                                <Text className="text-text-secondary font-bold text-xs uppercase">{groupingMode === 'category' ? 'Category' : 'Method'}</Text>
                                <Text className="text-text-secondary font-bold text-xs uppercase">Amount</Text>
                            </View>
                            {breakdown
                                .filter((item: any) => !hiddenCategories.has(item.name))
                                .sort((a: any, b: any) => b.value - a.value)
                                .map((item: any, idx: number) => (
                                    <View key={idx} className="flex-row justify-between items-center py-3 border-b border-border/30">
                                        <View className="flex-row items-center">
                                            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: item.color || '#6c757d' }} />
                                            <Text className="text-text-primary font-bold text-sm">{item.name}</Text>
                                        </View>
                                        <Text className="text-[#ef4444] font-bold text-sm">-₹{item.value.toLocaleString()}</Text>
                                    </View>
                                ))}
                            <View className="flex-row justify-between py-3 mt-1">
                                <Text className="text-text-primary font-bold text-sm">Total Expenses</Text>
                                <Text className="text-[#ef4444] font-bold text-sm">
                                    -₹{breakdown
                                        .filter((item: any) => !hiddenCategories.has(item.name))
                                        .reduce((sum: number, item: any) => sum + item.value, 0)
                                        .toLocaleString()}
                                </Text>
                            </View>
                        </Card>
                    </View>
                ) : activeSegment === 'history' ? (
                    <View className="p-6">
                        <View className="flex-row items-center mb-4 gap-2">
                            <HistoryIcon size={20} color="#8b5cf6" />
                            <Text className="text-text-primary font-bold text-xl font-serif">History</Text>
                        </View>

                        {/* Filters */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            <TouchableOpacity onPress={() => setHistoryFilterMethod('All')} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterMethod === 'All' ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}>
                                <Text className={`text-xs font-bold ${historyFilterMethod === 'All' ? 'text-text-primary' : 'text-text-secondary'}`}>All Methods</Text>
                            </TouchableOpacity>
                            {['Cash', 'Card', 'UPI', 'Bank Transfer'].map(m => (
                                <TouchableOpacity key={m} onPress={() => setHistoryFilterMethod(m)} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterMethod === m ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}>
                                    <Text className={`text-xs font-bold ${historyFilterMethod === m ? 'text-text-primary' : 'text-text-secondary'}`}>{m}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                            <TouchableOpacity onPress={() => setHistoryFilterCategory('All')} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterCategory === 'All' ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}>
                                <Text className={`text-xs font-bold ${historyFilterCategory === 'All' ? 'text-text-primary' : 'text-text-secondary'}`}>All Categories</Text>
                            </TouchableOpacity>
                            {categories.map(c => (
                                <TouchableOpacity key={c.id} onPress={() => setHistoryFilterCategory(c.id)} className={`mr-2 px-3 py-1 rounded-full border ${historyFilterCategory === c.id ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}>
                                    <View className="flex-row items-center">
                                        <View className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />
                                        <Text className={`text-xs font-bold ${historyFilterCategory === c.id ? 'text-text-primary' : 'text-text-secondary'}`}>{c.name}</Text>
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
                                        <Text className="text-text-secondary font-bold text-xs uppercase tracking-wider">Count: {filteredHistory.length}</Text>
                                        <Text className="text-[#ef4444] font-bold text-lg tracking-tight">Total: -₹{totalFiltered.toLocaleString()}</Text>
                                    </View>

                                    {filteredHistory.length === 0 ? (
                                        <View className="mt-8 items-center">
                                            <Text className="text-text-secondary/40 italic text-center">No transactions found</Text>
                                        </View>
                                    ) : (
                                        filteredHistory.map((item) => (
                                            <Card key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm">
                                                <View className="flex-1">
                                                    <Text className="text-text-primary font-bold text-base">{item.notes || item.category?.name || 'Expense'}</Text>
                                                    <Text className="text-text-secondary/60 text-xs mt-0.5">
                                                        {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </Text>
                                                </View>
                                                <View className="items-end flex-row gap-3 mt-1">
                                                    <View className="items-end mr-2">
                                                        <Text className="text-[#ef4444] font-bold text-lg">-₹{item.amount.toLocaleString()}</Text>
                                                        <Text className="text-text-secondary/40 text-[10px] uppercase tracking-tighter">{item.paymentMethod}</Text>
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
                            <Text className="text-text-primary font-bold text-xl font-serif">Income Stream</Text>
                        </View>

                        {incomes.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-text-secondary/40 italic text-center">No income records found</Text>
                            </View>
                        ) : (
                            incomes.map((item) => (
                                <Card key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#10b981]">
                                    <View className="flex-1">
                                        <Text className="text-text-primary font-bold text-base">{item.source}</Text>
                                        <Text className="text-text-secondary/60 text-xs mt-0.5">
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
                                <Text className="text-text-primary font-bold text-xl font-serif">Categories</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsAddCategoryModalOpen(true)} className="bg-accent/30 px-3 py-1.5 rounded-lg flex-row items-center">
                                <Plus size={16} color="#ffffff" />
                                <Text className="text-text-primary font-bold ml-1 text-xs">Add</Text>
                            </TouchableOpacity>
                        </View>

                        {categories.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-text-secondary/40 italic text-center">No categories found</Text>
                            </View>
                        ) : (
                            <View className="flex-row flex-wrap justify-between">
                                {categories.map((item) => (
                                    <Card key={item.id} className="p-4 mb-3 w-[48%] flex-col items-center shadow-sm border border-border">
                                        <View className="w-8 h-8 rounded-full mb-2" style={{ backgroundColor: item.color }} />
                                        <Text className="text-text-primary font-bold text-center mb-2">{item.name}</Text>
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
                        <Card className="p-0 overflow-hidden border-border">
                            {/* Days Header */}
                            <View className="flex-row border-b border-border/60 bg-background">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <View key={i} className="flex-1 py-3 items-center border-r last:border-r-0 border-border/30">
                                        <Text className="text-text-secondary/80 font-bold text-[10px] uppercase">{d}</Text>
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
                                                    setSelectedDay(day);
                                                    setIsDayModalOpen(true);
                                                }
                                            }}
                                            className={`w-[14.28%] h-20 border-r border-b border-border/30 p-1 ${isCurrentMonth ? '' : 'bg-black/20'} ${hasActivity ? 'bg-accent/30/10' : ''}`}
                                        >
                                            <View className={`w-5 h-5 rounded-full items-center justify-center mb-1 ${isToday ? 'bg-accent' : ''}`}>
                                                <Text className={`text-[10px] font-bold ${isToday ? 'text-text-primary' : isCurrentMonth ? 'text-text-secondary' : 'text-text-secondary/30'}`}>
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

            {/* Add Expense Modal */}
            <Modal visible={isAddModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[50%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-text-primary font-serif">Add Expense</Text>
                            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-text-secondary font-bold mb-2">Amount (₹)</Text>
                        <TextInput 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-4 font-bold text-lg"
                            placeholderTextColor="#6b7280"
                            placeholder="0.00"
                        />

                        <Text className="text-text-secondary font-bold mb-2">Notes</Text>
                        <TextInput 
                            value={notes}
                            onChangeText={setNotes}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-6"
                            placeholderTextColor="#6b7280"
                            placeholder="E.g. Lunch, Groceries..."
                        />

                        <Text className="text-text-secondary font-bold mb-2">Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            {categories.map(cat => (
                                <TouchableOpacity 
                                    key={cat.id} 
                                    onPress={() => setSelectedCategory(cat.id)}
                                    className={`mr-3 px-4 py-2 rounded-full border ${selectedCategory === cat.id ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}
                                >
                                    <View className="flex-row items-center">
                                        <View className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: cat.color }} />
                                        <Text className={`font-bold ${selectedCategory === cat.id ? 'text-text-primary' : 'text-text-secondary'}`}>{cat.name}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text className="text-text-secondary font-bold mb-2">Payment Method</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                            {['Cash', 'Card', 'UPI', 'Bank Transfer'].map(method => (
                                <TouchableOpacity 
                                    key={method} 
                                    onPress={() => setPaymentMethod(method)}
                                    className={`mr-3 px-4 py-2 rounded-full border ${paymentMethod === method ? 'border-accent bg-accent' : 'border-border/60 bg-background'}`}
                                >
                                    <Text className={`font-bold ${paymentMethod === method ? 'text-text-primary' : 'text-text-secondary'}`}>{method}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <Text className="text-text-secondary font-bold mb-2">Date (YYYY-MM-DD)</Text>
                        <TextInput 
                            value={expenseDate}
                            onChangeText={setExpenseDate}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-6 font-bold"
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
                                <Text className="text-text-primary font-bold text-lg">{editingExpenseId ? 'Update Expense' : 'Save Expense'}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Category Modal */}
            <Modal visible={isAddCategoryModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[40%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-text-primary font-serif">Add Category</Text>
                            <TouchableOpacity onPress={() => setIsAddCategoryModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-text-secondary font-bold mb-2">Category Name</Text>
                        <TextInput 
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-4 font-bold text-lg"
                            placeholderTextColor="#6b7280"
                            placeholder="E.g. Travel, Utilities..."
                        />
                        
                        <Text className="text-text-secondary font-bold mb-2">Color Code (Hex)</Text>
                        <View className="flex-row items-center mb-6">
                           <View className="w-10 h-10 rounded-full mr-3 border border-border" style={{ backgroundColor: newCategoryColor }} />
                           <TextInput 
                               value={newCategoryColor}
                               onChangeText={setNewCategoryColor}
                               className="flex-1 bg-background text-white p-4 rounded-xl border border-border font-bold"
                               placeholderTextColor="#6b7280"
                           />
                        </View>

                        <TouchableOpacity 
                            onPress={handleAddCategory}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center ${submitting ? 'bg-accent/30' : 'bg-accent'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text className="text-text-primary font-bold text-lg">Save Category</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Day Activity Modal */}
            <Modal visible={isDayModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 h-[70%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-text-primary font-serif">
                                Activity for {selectedDay?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                            <TouchableOpacity onPress={() => setIsDayModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                            {(() => {
                                if (!selectedDay) return null;
                                
                                const dayExp = expenses.filter(e => {
                                    const d = new Date(e.date);
                                    return d.getDate() === selectedDay.getDate() && d.getMonth() === selectedDay.getMonth() && d.getFullYear() === selectedDay.getFullYear();
                                });
                                const dayInc = incomes.filter(i => {
                                    const d = new Date(i.date);
                                    return d.getDate() === selectedDay.getDate() && d.getMonth() === selectedDay.getMonth() && d.getFullYear() === selectedDay.getFullYear();
                                });
                                
                                const totalI = dayInc.reduce((sum, i) => sum + i.amount, 0);
                                const totalE = dayExp.reduce((sum, e) => sum + e.amount, 0);

                                return (
                                    <>
                                        <View className="flex-row gap-3 mb-6">
                                            <View className="flex-1 bg-[#10b981]/10 p-3 rounded-xl border border-[#10b981]/20">
                                                <Text className="text-[#10b981]/80 font-bold text-xs mb-1">Income</Text>
                                                <Text className="text-[#10b981] font-bold text-xl">+₹{totalI}</Text>
                                            </View>
                                            <View className="flex-1 bg-[#ef4444]/10 p-3 rounded-xl border border-[#ef4444]/20">
                                                <Text className="text-[#ef4444]/80 font-bold text-xs mb-1">Expense</Text>
                                                <Text className="text-[#ef4444] font-bold text-xl">-₹{totalE}</Text>
                                            </View>
                                        </View>

                                        {dayInc.map(i => (
                                            <Card key={i.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#10b981]">
                                                <View className="flex-1">
                                                    <View className="flex-row items-center gap-2">
                                                        <Text className="text-[#10b981] font-bold text-base">{i.source}</Text>
                                                        <Text className="bg-background-surface text-text-muted text-[10px] px-2 py-0.5 rounded border border-border">Income</Text>
                                                    </View>
                                                    <Text className="text-text-secondary/60 text-xs mt-1">{i.notes || 'No description'}</Text>
                                                </View>
                                                <Text className="text-[#10b981] font-bold text-lg">+₹{i.amount}</Text>
                                            </Card>
                                        ))}

                                        {dayExp.map(e => (
                                            <Card key={e.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#ef4444]">
                                                <View className="flex-1">
                                                    <View className="flex-row items-center gap-2">
                                                        <Text className="text-text-primary font-bold text-base">{e.category?.name || 'Expense'}</Text>
                                                        <Text className="bg-background-surface text-text-muted text-[10px] px-2 py-0.5 rounded border border-border uppercase">{e.paymentMethod}</Text>
                                                    </View>
                                                    <Text className="text-text-secondary/60 text-xs mt-1">{e.notes || 'No description'}</Text>
                                                </View>
                                                <Text className="text-[#ef4444] font-bold text-lg">-₹{e.amount}</Text>
                                            </Card>
                                        ))}
                                    </>
                                )
                            })()}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            {/* Add Income Modal */}
            <Modal visible={isAddIncomeModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-background rounded-t-3xl p-6 min-h-[50%] border-t border-border">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-text-primary font-serif">Add Income</Text>
                            <TouchableOpacity onPress={() => setIsAddIncomeModalOpen(false)}>
                                <X size={24} color="#a39b98" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-text-secondary font-bold mb-2">Amount (₹)</Text>
                        <TextInput 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-4 font-bold text-lg"
                            placeholderTextColor="#6b7280"
                            placeholder="0.00"
                        />

                        <Text className="text-text-secondary font-bold mb-2">Source</Text>
                        <TextInput 
                            value={incomeSource}
                            onChangeText={setIncomeSource}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-4"
                            placeholderTextColor="#6b7280"
                            placeholder="E.g. Salary, Freelance..."
                        />

                        <Text className="text-text-secondary font-bold mb-2">Notes (Optional)</Text>
                        <TextInput 
                            value={notes}
                            onChangeText={setNotes}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-6"
                            placeholderTextColor="#6b7280"
                            placeholder="Extra details..."
                        />

                        <Text className="text-text-secondary font-bold mb-2">Date (YYYY-MM-DD)</Text>
                        <TextInput 
                            value={expenseDate}
                            onChangeText={setExpenseDate}
                            className="bg-background text-white p-4 rounded-xl border border-border mb-6 font-bold"
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
                                <Text className="text-text-primary font-bold text-lg">Save Income</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
