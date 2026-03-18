import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: ViewProps) {
    return (
        <View
            className={cn(
                "rounded-radius-xl border border-border bg-background-surface shadow-shadow-md",
                className
            )}
            {...props}
        />
    );
}

export function CardHeader({ className, ...props }: ViewProps) {
    return (
        <View 
            className={cn("flex flex-col space-y-space-1 p-space-6 pb-2", className)} 
            {...props} 
        />
    );
}

export function CardTitle({ className, ...props }: TextProps) {
    return (
        <Text 
            className={cn("text-h3 font-semibold tracking-tight text-text-primary", className)} 
            {...props} 
        />
    );
}

export function CardDescription({ className, ...props }: TextProps) {
    return (
        <Text 
            className={cn("text-small text-text-secondary", className)} 
            {...props} 
        />
    );
}

export function CardContent({ className, ...props }: ViewProps) {
    return (
        <View 
            className={cn("p-space-6 pt-0", className)} 
            {...props} 
        />
    );
}

export function CardFooter({ className, ...props }: ViewProps) {
    return (
        <View 
            className={cn("flex-row items-center p-space-6 pt-0", className)} 
            {...props} 
        />
    );
}
