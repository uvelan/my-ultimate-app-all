import React from 'react';
import { View, Text, ViewProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface CardProps extends ViewProps {
    className?: string;
    children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
    return (
        <View
            className={cn("bg-[#1a110d] rounded-xl border border-[#5c4033] p-6 shadow-2xl", className)}
            {...props}
        >
            {children}
        </View>
    );
}
