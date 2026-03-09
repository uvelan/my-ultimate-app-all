import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    containerClassName?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
    ({ label, error, containerClassName, ...props }, ref) => {
        return (
            <View className={cn("mb-4", containerClassName)}>
                {label && (
                    <Text className="text-[#d4c5b0] text-sm font-medium mb-1.5 ml-1">
                        {label}
                    </Text>
                )}
                <TextInput
                    ref={ref}
                    placeholderTextColor="#6f4e37"
                    className={cn(
                        "bg-[#2e1d15] border border-[#5c4033] rounded-xl px-4 py-3.5 text-[#e6dccf] text-base",
                        error && "border-red-500",
                        props.editable === false && "opacity-50"
                    )}
                    {...props}
                />
                {error && (
                    <Text className="text-red-500 text-xs mt-1 ml-1">{error}</Text>
                )}
            </View>
        );
    }
);

Input.displayName = 'Input';
