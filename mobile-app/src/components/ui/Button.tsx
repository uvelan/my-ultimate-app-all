import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends TouchableOpacityProps {
    className?: string;
    isLoading?: boolean;
    children: React.ReactNode;
}

export function Button({ className, isLoading, children, disabled, ...props }: ButtonProps) {
    return (
        <TouchableOpacity
            disabled={isLoading || disabled}
            className={cn(
                "bg-[#8b4513] py-4 rounded-xl items-center justify-center flex-row",
                (isLoading || disabled) && "opacity-50",
                className
            )}
            {...props}
        >
            {isLoading ? (
                <ActivityIndicator color="white" />
            ) : (
                <Text className="text-white font-bold text-lg">{children}</Text>
            )}
        </TouchableOpacity>
    );
}
