import { cookies, headers as requestHeaders } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export async function verifyAuth() {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('accessToken')?.value;

    // Support Bearer token for mobile apps
    if (!accessToken) {
        const authHeader = (await requestHeaders()).get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            accessToken = authHeader.split(' ')[1];
        }
    }

    if (!accessToken) {
        return { isAuthenticated: false, user: null };
    }

    const payload = verifyAccessToken(accessToken) as { id: string; role: string; email: string } | null;

    if (!payload) {
        return { isAuthenticated: false, user: null };
    }

    return { isAuthenticated: true, user: payload };
}
