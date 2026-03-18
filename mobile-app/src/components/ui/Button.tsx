import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface ButtonProps extends TouchableOpacityProps {
    className?: string;
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg" | "icon";
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
    textClassName?: string;
}

export function Button({ 
    className, 
    variant = "primary", 
    size = "md", 
    isLoading, 
    leftIcon, 
    rightIcon, 
    children, 
    disabled, 
    textClassName,
    ...props 
}: ButtonProps) {
    const baseStyles = "flex-row items-center justify-center rounded-radius-lg";
    
    const variants = {
        primary: "bg-accent",
        secondary: "border border-border bg-transparent",
        outline: "border border-border bg-transparent",
        ghost: "bg-transparent",
        danger: "bg-error",
    };

    const textVariants = {
        primary: "text-white font-medium tracking-wide",
        secondary: "text-text-primary font-medium tracking-wide",
        outline: "text-text-primary font-medium tracking-wide",
        ghost: "text-text-primary font-medium tracking-wide",
        danger: "text-white font-medium tracking-wide",
    };

    const sizes = {
        sm: "h-8 px-4",
        md: "px-6 py-3",
        lg: "px-8 py-4",
        icon: "h-10 w-10 p-0",
    };

    const textSizes = {
        sm: "text-caption",
        md: "text-small",
        lg: "text-body",
        icon: "",
    };

    return (
        <TouchableOpacity
            disabled={isLoading || disabled}
            activeOpacity={0.7}
            className={cn(
                baseStyles,
                variants[variant],
                sizes[size],
                (isLoading || disabled) && "opacity-50",
                className
            )}
            {...props}
        >
            {isLoading ? (
                <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? 'white' : '#8b5cf6'} />
            ) : (
                <>
                    {leftIcon && <View className="mr-2">{leftIcon}</View>}
                    {children && (
                        <Text className={cn(textVariants[variant], textSizes[size], textClassName)}>
                            {children}
                        </Text>
                    )}
                    {rightIcon && <View className="ml-2">{rightIcon}</View>}
                </>
            )}
        </TouchableOpacity>
    );
}
