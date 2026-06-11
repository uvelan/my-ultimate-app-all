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
        <div className="w-full max-w-sm mx-auto relative overflow-visible animate-in fade-in slide-in-from-bottom-4 duration-base ease-stitch">
            <h2 className="text-3xl font-bold text-center mb-10 text-white tracking-tight relative z-10">
                {type === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 relative z-10">
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
                    className="bg-[#151515] border-transparent rounded-xl text-white placeholder:text-[#555] focus:border-[#5B6EF2] focus:ring-[#5B6EF2]/20"
                />

                <Input
                    id="password"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    error={errors.password?.message as string}
                    {...register('password')}
                    className="bg-[#151515] border-transparent rounded-xl text-white placeholder:text-[#555] focus:border-[#5B6EF2] focus:ring-[#5B6EF2]/20 tracking-widest"
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
                    <div className="flex items-center gap-3 mt-4 mb-6 group">
                        <div className="relative flex items-center justify-center">
                            <input 
                                className="peer w-5 h-5 rounded-md border-transparent bg-[#151515] text-[#5B6EF2] focus:ring-2 focus:ring-[#5B6EF2]/30 cursor-pointer appearance-none transition-all checked:bg-[#5B6EF2] checked:border-transparent" 
                                type="checkbox" 
                                id="rememberMe" 
                            />
                            <svg 
                                className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 scale-50 peer-checked:opacity-100 peer-checked:scale-100 transition-all duration-fast" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor" 
                                strokeWidth={3}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <label className="text-sm text-[#888] cursor-pointer select-none font-medium group-hover:text-[#ccc] transition-colors duration-fast" htmlFor="rememberMe">
                            Remember me
                        </label>
                    </div>
                )}

                <Button type="submit" className="w-full mt-6 bg-[#5B6EF2] hover:bg-[#4959cc] text-white rounded-xl shadow-lg border-none transition-all py-6 text-base font-semibold" size="lg" isLoading={loading}>
                    {type === 'login' ? 'Sign In' : 'Sign Up'}
                </Button>

                <p className="text-center mt-6 text-[#888] text-sm">
                    {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                    <Link
                        href={type === 'login' ? '/register' : '/login'}
                        className="text-white font-semibold hover:text-[#5B6EF2] transition-colors"
                    >
                        {type === 'login' ? 'Sign Up' : 'Sign In'}
                    </Link>
                </p>
            </form>
        </div>
    );
}
