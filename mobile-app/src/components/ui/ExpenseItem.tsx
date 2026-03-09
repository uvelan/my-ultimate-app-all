import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { TrendingDown, TrendingUp, MoreVertical } from 'lucide-react-native';
import { Badge } from './Badge';

interface ExpenseItemProps {
    amount: number;
    category: string;
    date: string;
    type: 'expense' | 'income';
    color?: string;
    onPress?: () => void;
}

export function ExpenseItem({ amount, category, date, type, color, onPress }: ExpenseItemProps) {
    const isExpense = type === 'expense';

    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center justify-between py-4 border-b border-[#5c4033]/30"
        >
            <View className="flex-row items-center">
                <View
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: isExpense ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)' }}
                >
                    {isExpense ? (
                        <TrendingDown size={22} color="#ef4444" />
                    ) : (
                        <TrendingUp size={22} color="#22c55e" />
                    )}
                </View>
                <View className="ml-4">
                    <Text className="text-[#e6dccf] font-bold text-base">{category}</Text>
                    <Text className="text-[#d4c5b0]/60 text-xs mt-0.5">{date}</Text>
                </View>
            </View>

            <View className="items-end">
                <Text className={`font-bold text-lg ${isExpense ? 'text-red-400' : 'text-green-400'}`}>
                    {isExpense ? '-' : '+'}₹{amount.toLocaleString()}
                </Text>
                <Badge label={type} className="mt-1" />
            </View>
        </Pressable>
    );
}
