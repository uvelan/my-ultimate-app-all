import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
}

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Check for user in local storage or fetch from an API that returns current user
        // Since we are using HttpOnly cookies, we can't read tokens directly.
        // We should have a /api/auth/me endpoint or similar, but for now we can infer from the existence of a successful request or local storage if we stored user info there.
        // Ideally, we persist user info in localStorage after login/register.

        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = (userData: User) => {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        router.push('/dashboard');
        router.refresh(); // Refresh to update server components/middleware state if needed
    };

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('user');
            setUser(null);
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    return { user, loading, login, logout };
}
