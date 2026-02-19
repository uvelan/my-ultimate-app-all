import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export async function verifyAuth() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;

    if (!accessToken) {
        return { isAuthenticated: false, user: null };
    }

    const payload = verifyAccessToken(accessToken) as { id: string; role: string; email: string } | null;

    if (!payload) {
        return { isAuthenticated: false, user: null };
    }

    return { isAuthenticated: true, user: payload };
}
