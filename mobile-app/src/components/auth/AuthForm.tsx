import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '../ui/Card';
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
            console.log('Submitting:', data);

            if (type === 'login') {
                console.log('Attempting login...');
                const response = await authService.login(data);
                console.log('Login Response Keys:', Object.keys(response));
                console.log('Login Response:', JSON.stringify(response, null, 2));

                if (response.accessToken && response.refreshToken) {
                    console.log('Tokens found, storing...');
                    await SecureStore.setItemAsync('accessToken', String(response.accessToken));
                    await SecureStore.setItemAsync('refreshToken', String(response.refreshToken));
                    console.log('Tokens stored successfully');
                    router.replace('/(protected)/(tabs)/dashboard' as any);
                } else {
                    console.error('Auth Error: Tokens missing in response body. Received keys:', Object.keys(response));
                }
            } else {
                console.log('Attempting registration...');
                await authService.register(data);
                console.log('Registration successful');
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }} className="bg-[#2e1d15] flex-1">
            <Card className="w-full">
                <Text className="text-3xl font-bold text-center mb-8 text-white font-serif">
                    {type === 'login' ? 'Welcome Back' : 'Create Account'}
                </Text>

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
                >
                    {type === 'login' ? 'Sign In' : 'Sign Up'}
                </Button>

                <TouchableOpacity
                    onPress={() => router.push(type === 'login' ? '/register' : '/login')}
                    className="mt-6 flex-row justify-center"
                >
                    <Text className="text-[#d4c5b0] text-sm">
                        {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                    </Text>
                    <Text className="text-white font-bold text-sm underline">
                        {type === 'login' ? 'Sign Up' : 'Sign In'}
                    </Text>
                </TouchableOpacity>
            </Card>
        </ScrollView>
    );
}
