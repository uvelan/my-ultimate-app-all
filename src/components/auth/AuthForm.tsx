'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RegisterSchema, LoginSchema } from '@/lib/validation';
import { Button, Input, Card } from '@/components/ui/components';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

type AuthType = 'login' | 'register';

interface AuthFormProps {
    type: AuthType;
}

export default function AuthForm({ type }: AuthFormProps) {
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const router = useRouter();

    const schema = type === 'login' ? LoginSchema : RegisterSchema;
    type FormData = z.infer<typeof schema>;

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            const endpoint = type === 'login' ? '/api/auth/login' : '/api/auth/register';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Something went wrong');
            }

            toast.success(type === 'login' ? 'Logged in successfully!' : 'Registered successfully!');

            if (type === 'login') {
                login(result.user);
            } else {
                router.push('/login');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="max-w-md mx-auto w-full">
            <h2 className="text-2xl font-bold text-center mb-6 text-white">
                {type === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)}>
                {type === 'register' && (
                    <Input
                        id="name"
                        label="Full Name"
                        placeholder="John Doe"
                        error={(errors as any).name?.message as string}
                        {...register('name' as any)}
                    />
                )}

                <Input
                    id="email"
                    label="Email Address"
                    type="email"
                    placeholder="john@example.com"
                    error={errors.email?.message as string}
                    {...register('email')}
                />

                <Input
                    id="password"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    error={errors.password?.message as string}
                    {...register('password')}
                />

                {type === 'register' && (
                    <div className="mb-3">
                        <label className="form-label">Role</label>
                        <select
                            className="form-select glass-input"
                            {...register('role' as any)}
                        >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>
                )}

                {type === 'login' && (
                    <div className="form-check mb-3">
                        <input className="form-check-input" type="checkbox" id="rememberMe" />
                        <label className="form-check-label" htmlFor="rememberMe">
                            Remember me
                        </label>
                    </div>
                )}

                <Button type="submit" className="w-100 mt-3" isLoading={loading}>
                    {type === 'login' ? 'Sign In' : 'Sign Up'}
                </Button>

                <p className="text-center mt-4 text-white/80 text-sm">
                    {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                    <Link
                        href={type === 'login' ? '/register' : '/login'}
                        className="text-white font-semibold underline hover:text-white/80"
                    >
                        {type === 'login' ? 'Sign Up' : 'Sign In'}
                    </Link>
                </p>
            </form>
        </Card>
    );
}
