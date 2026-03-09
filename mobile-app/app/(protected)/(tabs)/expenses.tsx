import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { StatCard } from '@/src/components/ui/StatCard';
import { ExpensePieChart } from '@/src/components/ui/ExpensePieChart';
import { ExpenseTrendChart } from '@/src/components/ui/ExpenseTrendChart';
import { TrendingDown, Wallet, PieChart as PieIcon, LineChart, History as HistoryIcon, Plus } from 'lucide-react-native';
import { Card } from '@/src/components/ui/Card';
import { expenseService } from '@/src/services/features.service';

type Segment = 'overview' | 'history';

export default function ExpensesScreen() {
    const [activeSegment, setActiveSegment] = useState<Segment>('overview');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [historical, setHistorical] = useState<any>([]);
    const [breakdown, setBreakdown] = useState<any>([]);
    const [expenses, setExpenses] = useState<any[]>([]);

    const fetchData = async () => {
        try {
            const [statsRes, trendRes, listRes] = await Promise.all([
                expenseService.getStats(),
                expenseService.getHistorical('month', 'category'),
                expenseService.getExpenses()
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

            console.log('Expense Data Loaded:', {
                stats: !!statsRes,
                trend: !!trendRes,
                historyCount: listRes?.length || 0
            });

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
                    <TouchableOpacity className="bg-[#8b4513] p-2 rounded-full shadow-lg">
                        <Plus size={20} color="#e6dccf" />
                    </TouchableOpacity>
                </View>

                {/* Segment Switcher */}
                <View className="flex-row mt-6 bg-[#2e1d15] rounded-xl p-1 border border-[#5c4033]">
                    <TouchableOpacity
                        onPress={() => setActiveSegment('overview')}
                        className={`flex-1 py-2 rounded-lg items-center ${activeSegment === 'overview' ? 'bg-[#5c4033]' : ''}`}
                    >
                        <Text className={`font-bold ${activeSegment === 'overview' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>Overview</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setActiveSegment('history')}
                        className={`flex-1 py-2 rounded-lg items-center ${activeSegment === 'history' ? 'bg-[#5c4033]' : ''}`}
                    >
                        <Text className={`font-bold ${activeSegment === 'history' ? 'text-[#e6dccf]' : 'text-[#6f4e37]'}`}>History</Text>
                    </TouchableOpacity>
                </View>
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
                ) : (
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
                )}
                <View className="h-10" />
            </ScrollView>
        </View>
    );
}
