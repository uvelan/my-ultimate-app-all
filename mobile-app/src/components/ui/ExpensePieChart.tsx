import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { VictoryPie, VictoryLabel, VictoryContainer } from 'victory-native';

interface PieData {
    name: string;
    value: number;
    color: string;
}

interface ExpensePieChartProps {
    data: PieData[];
    title?: string;
}

export function ExpensePieChart({ data, title }: ExpensePieChartProps) {
    const { width } = useWindowDimensions();
    const chartWidth = width - 48; // Padding

    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
        <View className="items-center">
            <VictoryPie
                data={data.map(item => ({ x: item.name, y: item.value }))}
                width={chartWidth}
                height={300}
                innerRadius={70}
                colorScale={data.map(item => item.color)}
                labels={({ datum }) => datum.y > 0 ? `${((datum.y / total) * 100).toFixed(0)}%` : ''}
                style={{
                    labels: { fill: '#e6dccf', fontSize: 12, fontWeight: 'bold' },
                    data: { stroke: '#1a110d', strokeWidth: 2 }
                }}
                containerComponent={<VictoryContainer responsive={false} />}
            />

            {/* Center Text Wrapper */}
            <View
                className="absolute items-center justify-center"
                style={{ top: '42%', left: '42%', transform: [{ translateX: -width * 0.05 }, { translateY: -width * 0.05 }] }}
            >
                <Text className="text-[#d4c5b0]/60 text-[10px] uppercase font-bold">Total</Text>
                <Text className="text-[#e6dccf] font-bold text-lg">₹{total.toLocaleString()}</Text>
            </View>

            {/* Custom Legend */}
            <View className="flex-row flex-wrap justify-center mt-4 gap-x-4 gap-y-2 px-2">
                {data.map((item, index) => (
                    <View key={index} className="flex-row items-center">
                        <View
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: item.color || '#8b4513' }}
                        />
                        <Text className="text-[#d4c5b0] text-[11px] font-medium">
                            {item.name}: ₹{item.value.toLocaleString()}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
