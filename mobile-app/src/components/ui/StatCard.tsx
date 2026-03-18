import React from 'react';
import { View, Text } from 'react-native';
import { Card } from './Card';
import { LucideIcon } from 'lucide-react-native';

interface StatCardProps {
    label: string;
    value: string;
    subValue?: string;
    icon: LucideIcon;
    color: string;
}

export function StatCard({ label, value, subValue, icon: Icon, color }: StatCardProps) {
    return (
        <Card className="flex-1 p-4 items-center">
            <View
                className="w-10 h-10 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: `${color}20` }}
            >
                <Icon size={20} color={color} />
            </View>
            <Text className="font-bold text-lg" style={{ color }}>{value}</Text>
            <Text className="text-text-muted text-[10px] uppercase tracking-wider">{label}</Text>
            {subValue && (
                <Text className="text-text-muted/60 text-[9px] mt-1">{subValue}</Text>
            )}
        </Card>
    );
}
