'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RegisterSchema, LoginSchema } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
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
        <Card className="max-w-md mx-auto w-full p-space-8 border-border shadow-shadow-lg relative overflow-hidden">
            {/* Soft decorative glow behind the card content */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-32 bg-accent/10 blur-[50px] pointer-events-none rounded-full" />
            
            <h2 className="text-h2 font-bold text-center mb-space-8 text-text-primary relative z-10">
                {type === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-space-4 relative z-10">
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
                    <Select
                        id="role"
                        label="Role"
                        error={(errors as any).role?.message as string}
                        {...register('role' as any)}
                    >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                    </Select>
                )}

                {type === 'login' && (
                    <div className="flex items-center gap-space-2 mt-space-2 mb-space-4">
                        <input 
                            className="w-4 h-4 rounded-radius-sm border-border text-accent focus:ring-accent bg-background-surface cursor-pointer" 
                            type="checkbox" 
                            id="rememberMe" 
                        />
                        <label className="text-small text-text-secondary cursor-pointer select-none font-medium" htmlFor="rememberMe">
                            Remember me
                        </label>
                    </div>
                )}

                <Button type="submit" className="w-full mt-space-6" size="lg" isLoading={loading}>
                    {type === 'login' ? 'Sign In' : 'Sign Up'}
                </Button>

                <p className="text-center mt-space-6 text-text-secondary text-small">
                    {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                    <Link
                        href={type === 'login' ? '/register' : '/login'}
                        className="text-text-primary font-semibold hover:text-accent transition-colors underline decoration-border underline-offset-4 hover:decoration-accent"
                    >
                        {type === 'login' ? 'Sign Up' : 'Sign In'}
                    </Link>
                </p>
            </form>
        </Card>
    );
}
