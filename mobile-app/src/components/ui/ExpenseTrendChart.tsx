import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { VictoryChart, VictoryBar, VictoryLine, VictoryAxis, VictoryGroup, VictoryTheme, VictoryTooltip, VictoryStack } from 'victory-native';

interface TrendData {
    period: string;
    expense: number;
    [key: string]: any;
}

interface ExpenseTrendChartProps {
    data: TrendData[];
    categories?: { name: string, color: string }[];
    hiddenCategories?: Set<string>;
}

export function ExpenseTrendChart({ data, categories = [], hiddenCategories = new Set() }: ExpenseTrendChartProps) {
    const { width } = useWindowDimensions();
    const chartWidth = width - 32;

    const visibleCategories = categories.filter(cat => !hiddenCategories.has(cat.name));

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

                {visibleCategories.length > 0 ? (
                    <VictoryStack>
                        {visibleCategories.map((cat, idx) => (
                            <VictoryBar
                                key={`bar-${idx}`}
                                data={data}
                                x="period"
                                y={(datum: any) => datum[cat.name] || 0}
                                style={{
                                    data: { fill: cat.color, width: 20 }
                                }}
                            />
                        ))}
                    </VictoryStack>
                ) : (
                    <VictoryBar
                        data={data}
                        x="period"
                        y="expense"
                        style={{
                            data: { fill: '#8b4513', width: 20 }
                        }}
                    />
                )}

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
