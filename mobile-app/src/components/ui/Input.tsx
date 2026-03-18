import React from 'react';
import { View, Text, TextInput, TextInputProps } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    containerClassName?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
    ({ label, error, helperText, leftIcon, rightIcon, containerClassName, ...props }, ref) => {
        return (
            <View className={cn("w-full space-y-space-1 mb-4", containerClassName)}>
                {label && (
                    <Text className="text-small font-medium text-text-secondary mb-1">
                        {label}
                    </Text>
                )}
                
                <View className="relative flex-row items-center w-full">
                    {leftIcon && (
                        <View className="absolute left-4 z-10 pointer-events-none">
                            {leftIcon}
                        </View>
                    )}
                    
                    <TextInput
                        ref={ref}
                        placeholderTextColor="#888888" /* text-muted */
                        className={cn(
                            "w-full px-4 py-3 rounded-radius-lg text-small bg-background-surface border border-border text-text-primary",
                            leftIcon && "pl-11",
                            rightIcon && "pr-11",
                            error && "border-error text-error",
                            props.editable === false && "opacity-50"
                        )}
                        {...props}
                    />
                    
                    {rightIcon && (
                        <View className="absolute right-4 z-10 pointer-events-none">
                            {rightIcon}
                        </View>
                    )}
                </View>

                {error ? (
                    <Text className="text-caption text-error mt-1">{error}</Text>
                ) : helperText ? (
                    <Text className="text-caption text-text-muted mt-1">{helperText}</Text>
                ) : null}
            </View>
        );
    }
);

Input.displayName = 'Input';
