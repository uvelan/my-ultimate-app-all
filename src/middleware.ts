import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJwtEdge } from '@/lib/auth-edge';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const accessToken = request.cookies.get('accessToken')?.value;
    const refreshToken = request.cookies.get('refreshToken')?.value;

    // Protect dashboard and admin routes
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
        if (!accessToken && !refreshToken) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        if (accessToken) {
            const payload = await verifyJwtEdge(accessToken) as { role?: string } | null;
            if (!payload) {
                // Token invalid, try refresh logic on client or redirect to logout/refresh? 
                // For simplicity, if invalid, redirect to login (or let client handle refresh flow, but middleware blocks access)
                // Actually, if we have a refresh token, we might want to let them pass? 
                // No, standard practice is: if access token invalid/missing, we fail here. 
                // But Next.js LocalStorage refresh logic is on client. 
                // Server-side: we could try to refresh here but setting cookies in middleware is tricky with response.
                // Let's assume if no valid access token, we redirect.
                return NextResponse.redirect(new URL('/login', request.url));
            }

            // Check admin role
            if (pathname.startsWith('/admin') && payload.role !== 'ADMIN') {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
    }

    // Redirect root to dashboard if authenticated, else login
    if (pathname === '/') {
        if (accessToken) {
            const payload = await verifyJwtEdge(accessToken);
            if (payload) {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect authenticated users away from auth pages
    if (pathname === '/login' || pathname === '/register') {
        if (accessToken) {
            const payload = await verifyJwtEdge(accessToken);
            if (payload) {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/dashboard/:path*', '/admin/:path*', '/login', '/register'],
};
