import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput } from 'react-native';
import { StatCard } from '@/src/components/ui/StatCard';
import { ExpensePieChart } from '@/src/components/ui/ExpensePieChart';
import { ExpenseTrendChart } from '@/src/components/ui/ExpenseTrendChart';
import { TrendingDown, Wallet, PieChart as PieIcon, LineChart, History as HistoryIcon, Plus, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Card } from '@/src/components/ui/Card';
import { expenseService, incomeService, categoryService } from '@/src/services/features.service';

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

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('UPI');
    const [submitting, setSubmitting] = useState(false);

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
            const [statsRes, trendRes, listRes, listInc, listCat] = await Promise.all([
                expenseService.getStats(),
                expenseService.getHistorical('month', 'category'),
                expenseService.getExpenses(),
                incomeService.getIncomes(),
                categoryService.getCategories()
            ]);

            if (statsRes) {
                setStats(statsRes);
                setBreakdown(statsRes.categorySplit || []);
            }
            if (trendRes) {
                setHistorical(trendRes.chartData || []);
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
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleAddExpense = async () => {
        if (!amount) return;
        setSubmitting(true);
        try {
            await expenseService.addExpense({
                amount: parseFloat(amount),
                categoryId: null,
                date: new Date().toISOString(),
                notes,
                paymentMethod
            });
            setIsAddModalOpen(false);
            setAmount('');
            setNotes('');
            fetchData();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
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
            <View className="flex-1 bg-[#2e1d15] items-center justify-center">
                <ActivityIndicator size="large" color="#8b4513" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#2e1d15]">
            <View className="px-6 pt-12 pb-4 bg-[#1a110d]/50 border-b border-[#5c4033]">
                <View className="flex-row justify-between items-center">
                    <Text className="text-3xl font-bold text-[#e6dccf] font-serif">Financials</Text>
                    <TouchableOpacity onPress={() => setIsAddModalOpen(true)} className="bg-[#8b4513] p-2 rounded-full shadow-lg">
                        <Plus size={20} color="#e6dccf" />
                    </TouchableOpacity>
                </View>

                {/* Segment Switcher */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-6">
                    <View className="flex-row bg-[#2e1d15] rounded-xl p-1 border border-[#5c4033] min-w-full">
                        <TouchableOpacity
                            onPress={() => setActiveSegment('overview')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'overview' ? 'bg-[#5c4033]' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'overview' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>Overview</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('history')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'history' ? 'bg-[#5c4033]' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'history' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('income')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'income' ? 'bg-[#5c4033]' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'income' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>Income</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('calendar')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'calendar' ? 'bg-[#5c4033]' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'calendar' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>Calendar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveSegment('categories')}
                            className={`flex-1 px-4 py-2 rounded-lg items-center ${activeSegment === 'categories' ? 'bg-[#5c4033]' : ''}`}
                        >
                            <Text className={`font-bold ${activeSegment === 'categories' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>Categories</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </View>

            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b4513" />}
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
                                label="Spent"
                                value={`₹${stats?.totalExpense?.toLocaleString() || '0'}`}
                                icon={TrendingDown}
                                color="#ef4444"
                            />
                        </View>

                        <View className="flex-row items-center mb-4 gap-2">
                            <PieIcon size={20} color="#8b4513" />
                            <Text className="text-[#e6dccf] font-bold text-xl font-serif">Breakdown</Text>
                        </View>
                        <Card className="p-6 mb-8">
                            <ExpensePieChart data={breakdown} />
                        </Card>

                        <View className="flex-row items-center mb-4 gap-2">
                            <LineChart size={20} color="#8b4513" />
                            <Text className="text-[#e6dccf] font-bold text-xl font-serif">Trends</Text>
                        </View>
                        <Card className="p-4 pt-8">
                            <ExpenseTrendChart data={historical} />
                        </Card>
                    </View>
                ) : activeSegment === 'history' ? (
                    <View className="p-6">
                        <View className="flex-row items-center mb-6 gap-2">
                            <HistoryIcon size={20} color="#8b4513" />
                            <Text className="text-[#e6dccf] font-bold text-xl font-serif">History</Text>
                        </View>

                        {expenses.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-[#d4c5b0]/40 italic text-center">No transactions found</Text>
                            </View>
                        ) : (
                            expenses.map((item) => (
                                <Card key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm">
                                    <View className="flex-1">
                                        <Text className="text-[#e6dccf] font-bold text-base">{item.notes || item.category?.name || 'Expense'}</Text>
                                        <Text className="text-[#d4c5b0]/60 text-xs mt-0.5">
                                            {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-[#ef4444] font-bold text-lg">-₹{item.amount.toLocaleString()}</Text>
                                        <Text className="text-[#d4c5b0]/40 text-[10px] uppercase tracking-tighter">{item.paymentMethod}</Text>
                                    </View>
                                </Card>
                            ))
                        )}
                    </View>
                ) : activeSegment === 'income' ? (
                    <View className="p-6">
                        <View className="flex-row items-center mb-6 gap-2">
                            <Wallet size={20} color="#10b981" />
                            <Text className="text-[#e6dccf] font-bold text-xl font-serif">Income Stream</Text>
                        </View>

                        {incomes.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-[#d4c5b0]/40 italic text-center">No income records found</Text>
                            </View>
                        ) : (
                            incomes.map((item) => (
                                <Card key={item.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#10b981]">
                                    <View className="flex-1">
                                        <Text className="text-[#e6dccf] font-bold text-base">{item.source}</Text>
                                        <Text className="text-[#d4c5b0]/60 text-xs mt-0.5">
                                            {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-[#10b981] font-bold text-lg">+₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </Card>
                            ))
                        )}
                    </View>
                ) : activeSegment === 'categories' ? (
                    <View className="p-6">
                        <View className="flex-row justify-between items-center mb-6">
                            <View className="flex-row items-center gap-2">
                                <PieIcon size={20} color="#8b4513" />
                                <Text className="text-[#e6dccf] font-bold text-xl font-serif">Categories</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsAddCategoryModalOpen(true)} className="bg-[#5c4033] px-3 py-1.5 rounded-lg flex-row items-center">
                                <Plus size={16} color="#e6dccf" />
                                <Text className="text-[#e6dccf] font-bold ml-1 text-xs">Add</Text>
                            </TouchableOpacity>
                        </View>

                        {categories.length === 0 ? (
                            <View className="mt-10 items-center">
                                <Text className="text-[#d4c5b0]/40 italic text-center">No categories found</Text>
                            </View>
                        ) : (
                            <View className="flex-row flex-wrap justify-between">
                                {categories.map((item) => (
                                    <Card key={item.id} className="p-4 mb-3 w-[48%] flex-col items-center shadow-sm border border-[#5c4033]">
                                        <View className="w-8 h-8 rounded-full mb-2" style={{ backgroundColor: item.color }} />
                                        <Text className="text-[#e6dccf] font-bold text-center mb-2">{item.name}</Text>
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
                        <View className="flex-row justify-between items-center mb-6">
                            <View className="flex-row items-center gap-2">
                                <CalendarIcon size={20} color="#8b4513" />
                                <Text className="text-[#e6dccf] font-bold text-xl font-serif">
                                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </Text>
                            </View>
                            <View className="flex-row items-center bg-[#1a110d] rounded-lg border border-[#5c4033] p-1">
                                <TouchableOpacity onPress={prevMonth} className="px-2 py-1">
                                    <ChevronLeft size={18} color="#d4c5b0" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={goToday} className="px-3 py-1">
                                    <Text className="text-[#e6dccf] font-bold text-xs uppercase tracking-wider">Today</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={nextMonth} className="px-2 py-1">
                                    <ChevronRight size={18} color="#d4c5b0" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Card className="p-0 overflow-hidden border-[#5c4033]">
                            {/* Days Header */}
                            <View className="flex-row border-b border-[#5c4033] bg-[#1a110d]">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                    <View key={i} className="flex-1 py-3 items-center border-r last:border-r-0 border-[#5c4033]/30">
                                        <Text className="text-[#d4c5b0]/80 font-bold text-[10px] uppercase">{d}</Text>
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
                                            className={`w-[14.28%] h-20 border-r border-b border-[#5c4033]/30 p-1 ${isCurrentMonth ? '' : 'bg-black/20'} ${hasActivity ? 'bg-[#5c4033]/10' : ''}`}
                                        >
                                            <View className={`w-5 h-5 rounded-full items-center justify-center mb-1 ${isToday ? 'bg-[#8b4513]' : ''}`}>
                                                <Text className={`text-[10px] font-bold ${isToday ? 'text-[#e6dccf]' : isCurrentMonth ? 'text-[#d4c5b0]' : 'text-[#d4c5b0]/30'}`}>
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
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 min-h-[50%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#e6dccf] font-serif">Add Expense</Text>
                            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                                <X size={24} color="#d4c5b0" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#d4c5b0] font-bold mb-2">Amount (₹)</Text>
                        <TextInput 
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-4 font-bold text-lg"
                            placeholderTextColor="#6f4e37"
                            placeholder="0.00"
                        />

                        <Text className="text-[#d4c5b0] font-bold mb-2">Notes</Text>
                        <TextInput 
                            value={notes}
                            onChangeText={setNotes}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-6"
                            placeholderTextColor="#6f4e37"
                            placeholder="E.g. Lunch, Groceries..."
                        />

                        <TouchableOpacity 
                            onPress={handleAddExpense}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center ${submitting ? 'bg-[#5c4033]' : 'bg-[#8b4513]'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#e6dccf" />
                            ) : (
                                <Text className="text-[#e6dccf] font-bold text-lg">Save Expense</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Add Category Modal */}
            <Modal visible={isAddCategoryModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 min-h-[40%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#e6dccf] font-serif">Add Category</Text>
                            <TouchableOpacity onPress={() => setIsAddCategoryModalOpen(false)}>
                                <X size={24} color="#d4c5b0" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#d4c5b0] font-bold mb-2">Category Name</Text>
                        <TextInput 
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-4 font-bold text-lg"
                            placeholderTextColor="#6f4e37"
                            placeholder="E.g. Travel, Utilities..."
                        />
                        
                        <Text className="text-[#d4c5b0] font-bold mb-2">Color Code (Hex)</Text>
                        <View className="flex-row items-center mb-6">
                           <View className="w-10 h-10 rounded-full mr-3 border border-[#5c4033]" style={{ backgroundColor: newCategoryColor }} />
                           <TextInput 
                               value={newCategoryColor}
                               onChangeText={setNewCategoryColor}
                               className="flex-1 bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] font-bold"
                               placeholderTextColor="#6f4e37"
                           />
                        </View>

                        <TouchableOpacity 
                            onPress={handleAddCategory}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center ${submitting ? 'bg-[#5c4033]' : 'bg-[#8b4513]'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#e6dccf" />
                            ) : (
                                <Text className="text-[#e6dccf] font-bold text-lg">Save Category</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Day Activity Modal */}
            <Modal visible={isDayModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 h-[70%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-[#e6dccf] font-serif">
                                Activity for {selectedDay?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                            <TouchableOpacity onPress={() => setIsDayModalOpen(false)}>
                                <X size={24} color="#d4c5b0" />
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
                                                        <Text className="bg-[#1a110d] text-[#d4c5b0]/60 text-[10px] px-2 py-0.5 rounded border border-[#5c4033]">Income</Text>
                                                    </View>
                                                    <Text className="text-[#d4c5b0]/60 text-xs mt-1">{i.notes || 'No description'}</Text>
                                                </View>
                                                <Text className="text-[#10b981] font-bold text-lg">+₹{i.amount}</Text>
                                            </Card>
                                        ))}

                                        {dayExp.map(e => (
                                            <Card key={e.id} className="p-4 mb-3 flex-row justify-between items-center shadow-sm border-l-4 border-l-[#ef4444]">
                                                <View className="flex-1">
                                                    <View className="flex-row items-center gap-2">
                                                        <Text className="text-[#e6dccf] font-bold text-base">{e.category?.name || 'Expense'}</Text>
                                                        <Text className="bg-[#1a110d] text-[#d4c5b0]/60 text-[10px] px-2 py-0.5 rounded border border-[#5c4033] uppercase">{e.paymentMethod}</Text>
                                                    </View>
                                                    <Text className="text-[#d4c5b0]/60 text-xs mt-1">{e.notes || 'No description'}</Text>
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
        </View>
    );
}
