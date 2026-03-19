import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useRouter } from 'expo-router';
import { authService } from '@/src/services/auth.service';
import * as SecureStore from 'expo-secure-store';

// Re-using validation logic if possible, or defining mobile-specific ones
const LoginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

const RegisterSchema = LoginSchema.extend({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['USER', 'ADMIN']).default('USER'),
});

type AuthType = 'login' | 'register';

interface AuthFormProps {
    type: AuthType;
}

export default function AuthForm({ type }: AuthFormProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const schema = type === 'login' ? LoginSchema : RegisterSchema;
    type FormData = z.infer<typeof schema>;

    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<any>({
        resolver: zodResolver(schema),
        defaultValues: type === 'register' ? { role: 'USER', name: '', email: '', password: '' } : { email: '', password: '' },
    });

    const onSubmit = async (data: any) => {
        setLoading(true);
        try {
            if (type === 'login') {
                const response = await authService.login(data);

                if (response.accessToken && response.refreshToken) {
                    await SecureStore.setItemAsync('accessToken', String(response.accessToken));
                    await SecureStore.setItemAsync('refreshToken', String(response.refreshToken));
                    router.replace('/(protected)/(tabs)/dashboard' as any);
                } else {
                    console.error('Auth Error: Tokens missing in response body. Received keys:', Object.keys(response));
                }
            } else {
                await authService.register(data);
                router.push('/(auth)/login' as any);
            }
        } catch (error: any) {
            console.error('Auth Full Error:', JSON.stringify(error, null, 2));
            console.error('Auth Error Message:', error.response?.data?.error || error.response?.data?.message || error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView 
            style={{ flex: 1, backgroundColor: '#0a0a0a' }} 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48, justifyContent: 'center' }} className="min-h-full">
                <View className="relative w-full items-center justify-center">
                    {/* Decorative Premium Glow */}
                    <View className="absolute w-[150%] h-32 bg-accent/10 rounded-full top-0 opacity-80" style={{ transform: [{ scaleX: 1.5 }] }} />
                    
                    <Card className="w-full relative z-10 shadow-lg shadow-black/50">
                        <CardHeader>
                            <CardTitle className="text-center text-4xl font-bold text-text-primary">
                                {type === 'login' ? 'Welcome Back' : 'Create Account'}
                            </CardTitle>
                        </CardHeader>

                <CardContent>
                    {type === 'register' && (
                        <Controller
                            control={control}
                            name="name"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <Input
                                    label="Full Name"
                                    placeholder="John Doe"
                                    onBlur={onBlur}
                                    onChangeText={onChange}
                                    value={value}
                                    error={(errors as any).name?.message}
                                />
                            )}
                        />
                    )}

                    <Controller
                        control={control}
                        name="email"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <Input
                                label="Email Address"
                                placeholder="john@example.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                                error={errors.email?.message as any}
                            />
                        )}
                    />

                    <Controller
                        control={control}
                        name="password"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <Input
                                label="Password"
                                placeholder="••••••••"
                                secureTextEntry
                                onBlur={onBlur}
                                onChangeText={onChange}
                                value={value}
                                error={errors.password?.message as any}
                            />
                        )}
                    />

                    <Button
                        onPress={handleSubmit(onSubmit)}
                        isLoading={loading}
                        className="mt-4"
                        variant="primary"
                    >
                        {type === 'login' ? 'Sign In' : 'Sign Up'}
                    </Button>

                    <TouchableOpacity
                        onPress={() => router.push(type === 'login' ? '/register' : '/login')}
                        className="mt-6 flex-row justify-center"
                    >
                        <Text className="text-text-secondary text-sm">
                            {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                        </Text>
                        <Text className="text-accent font-bold text-sm underline">
                            {type === 'login' ? 'Sign Up' : 'Sign In'}
                        </Text>
                    </TouchableOpacity>
                </CardContent>
            </Card>
            </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
