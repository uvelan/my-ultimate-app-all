import React from 'react';
import { View, Text } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface BadgeProps {
    label: string;
    color?: string;
    className?: string;
}

export function Badge({ label, color, className }: BadgeProps) {
    return (
        <View
            style={color ? { backgroundColor: `${color}20` } : {}}
            className={cn(
                "px-2.5 py-0.5 rounded-full",
                !color && "bg-[#8b4513]/20",
                className
            )}
        >
            <Text
                style={color ? { color: color } : {}}
                className={cn(
                    "text-[10px] font-bold uppercase",
                    !color && "text-[#8b4513]"
                )}
            >
                {label}
            </Text>
        </View>
    );
}
