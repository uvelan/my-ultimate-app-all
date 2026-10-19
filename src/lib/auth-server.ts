import { cookies, headers as requestHeaders } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export async function verifyAuth() {
    const cookieStore = await cookies();
    const authHeader = (await requestHeaders()).get('Authorization');
    // Native HTTP clients may retain a stale login cookie after refreshing their
    // explicitly supplied token. The caller's Bearer credentials take precedence.
    // An invalid explicit Bearer token must not fall back to a different account.
    const bearer = authHeader?.match(/^Bearer(?:\s+(.*))?$/i);
    const accessToken = bearer ? bearer[1]?.trim() : cookieStore.get('accessToken')?.value;

    if (!accessToken) {
        return { isAuthenticated: false, user: null };
    }

    const payload = verifyAccessToken(accessToken) as { id: string; role: string; email: string } | null;

    if (!payload) {
        return { isAuthenticated: false, user: null };
    }

    return { isAuthenticated: true, user: payload };
}
