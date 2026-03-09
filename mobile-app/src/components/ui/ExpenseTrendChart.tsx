import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { VictoryChart, VictoryBar, VictoryLine, VictoryAxis, VictoryGroup, VictoryTheme, VictoryTooltip } from 'victory-native';

interface TrendData {
    period: string;
    expense: number;
}

interface ExpenseTrendChartProps {
    data: TrendData[];
}

export function ExpenseTrendChart({ data }: ExpenseTrendChartProps) {
    const { width } = useWindowDimensions();
    const chartWidth = width - 32;

    return (
        <View>
            <VictoryChart
                width={chartWidth}
                height={250}
                theme={VictoryTheme.grayscale}
                padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
            >
                <VictoryAxis
                    tickValues={data.map(d => d.period)}
                    style={{
                        axis: { stroke: '#5c4033' },
                        tickLabels: { fill: '#d4c5b0', fontSize: 10, angle: -45, textAnchor: 'end' },
                        grid: { stroke: 'transparent' }
                    }}
                />
                <VictoryAxis
                    dependentAxis
                    tickFormat={(x) => `₹${x / 1000}k`}
                    style={{
                        axis: { stroke: '#5c4033' },
                        tickLabels: { fill: '#d4c5b0', fontSize: 10 },
                        grid: { stroke: '#5c403333', strokeDasharray: '4, 4' }
                    }}
                />

                <VictoryBar
                    data={data}
                    x="period"
                    y="expense"
                    style={{
                        data: { fill: '#8b4513', width: 20 }
                    }}
                    animate={{
                        duration: 500,
                        onLoad: { duration: 500 }
                    }}
                />

                <VictoryLine
                    data={data}
                    x="period"
                    y="expense"
                    style={{
                        data: { stroke: '#e6dccf', strokeWidth: 3 }
                    }}
                />
            </VictoryChart>
        </View>
    );
}
