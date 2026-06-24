import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJwtEdge } from '@/lib/auth-edge';

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const accessToken = request.cookies.get('accessToken')?.value;
    const refreshToken = request.cookies.get('refreshToken')?.value;

    // Redirect root to dashboard if authenticated, else login
    if (pathname === '/') {
        if (accessToken) {
            const payload = await verifyJwtEdge(accessToken).catch(() => null);
            if (payload) {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect authenticated users away from auth pages
    if (pathname === '/login' || pathname === '/register') {
        if (accessToken) {
            const payload = await verifyJwtEdge(accessToken).catch(() => null);
            if (payload) {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
        }
        return NextResponse.next();
    }

    // All other routes are protected
    if (!accessToken && !refreshToken) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (accessToken) {
        const payload = await verifyJwtEdge(accessToken).catch(() => null) as { role?: string } | null;
        if (!payload) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // Check admin role
        if (pathname.startsWith('/admin') && !['ADMIN', 'SUPERUSER'].includes(payload.role as string)) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
