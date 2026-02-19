'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ProtectedRoute({
    children,
    adminOnly = false,
}: {
    children: React.ReactNode;
    adminOnly?: boolean;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!loading) {
            if (!user) {
                router.push('/login');
            } else if (adminOnly && user.role !== 'ADMIN') {
                router.push('/dashboard');
            }
        }
    }, [user, loading, adminOnly, router]);

    if (!mounted || loading) {
        return (
            <div className="d-flex justify-content-center align-items-center min-vh-50">
                <div className="spinner-border text-light" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    if (!user || (adminOnly && user.role !== 'ADMIN')) {
        return null;
    }

    return <>{children}</>;
}
