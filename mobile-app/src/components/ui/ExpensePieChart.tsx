import React from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { VictoryPie, VictoryContainer } from 'victory-native';

interface PieData {
    name: string;
    value: number;
    color: string;
}

interface ExpensePieChartProps {
    data: PieData[];
    hiddenCategories: Set<string>;
    onToggleCategory: (name: string) => void;
}

export function ExpensePieChart({ data, hiddenCategories, onToggleCategory }: ExpensePieChartProps) {
    const { width } = useWindowDimensions();
    const chartWidth = width - 48;

    const activeData = data.filter(item => !hiddenCategories.has(item.name));
    const total = activeData.reduce((sum, item) => sum + item.value, 0);

    return (
        <View className="items-center">
            {activeData.length > 0 ? (
                <VictoryPie
                    data={activeData.map(item => ({ x: item.name, y: item.value }))}
                    width={chartWidth}
                    height={300}
                    innerRadius={70}
                    colorScale={activeData.map(item => item.color)}
                    labels={({ datum }) => datum.y > 0 ? `${((datum.y / total) * 100).toFixed(0)}%` : ''}
                    style={{
                        labels: { fill: '#e6dccf', fontSize: 12, fontWeight: 'bold' },
                        data: { stroke: '#1a110d', strokeWidth: 2 }
                    }}
                    containerComponent={<VictoryContainer responsive={false} />}
                />
            ) : (
                <View style={{ height: 300 }} className="items-center justify-center">
                    <Text className="text-[#d4c5b0]/40 italic">All categories hidden</Text>
                </View>
            )}

            {/* Center Text */}
            {activeData.length > 0 && (
                <View
                    className="absolute items-center justify-center"
                    style={{ top: '42%', left: '42%', transform: [{ translateX: -width * 0.05 }, { translateY: -width * 0.05 }] }}
                >
                    <Text className="text-[#d4c5b0]/60 text-[10px] uppercase font-bold">Total</Text>
                    <Text className="text-[#e6dccf] font-bold text-lg">₹{total.toLocaleString()}</Text>
                </View>
            )}

            {/* Interactive Legend */}
            <View className="flex-row flex-wrap justify-center mt-4 mb-2 gap-x-3 gap-y-3 px-2">
                {data.map((item, index) => {
                    const isHidden = hiddenCategories.has(item.name);
                    return (
                        <TouchableOpacity
                            key={index}
                            onPress={() => onToggleCategory(item.name)}
                            activeOpacity={0.6}
                            className={`flex-row items-center px-2 py-1 rounded-md border ${isHidden ? 'bg-[#2e1d15] border-[#3a2a1f]' : 'bg-[#1a110d] border-[#5c4033]'}`}
                        >
                            <View
                                className="w-2.5 h-2.5 rounded-full mr-1.5"
                                style={{ backgroundColor: isHidden ? '#555' : (item.color || '#8b4513') }}
                            />
                            <Text className={`text-[10px] font-bold tracking-tight ${isHidden ? 'text-[#666] line-through' : 'text-[#d4c5b0]'}`}>
                                {item.name}: ₹{item.value.toLocaleString()}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}
