import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, generateAccessToken } from '@/lib/auth-node';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    const cookieStore = await cookies();
    let refreshToken = cookieStore.get('refreshToken')?.value;

    if (!refreshToken) {
        try {
            const body = await request.json();
            refreshToken = body.refreshToken;
        } catch (e) {
            // No body or invalid JSON
        }
    }

    if (!refreshToken) {
        return NextResponse.json({ error: 'No refresh token found' }, { status: 401 });
    }

    const payload = verifyRefreshToken(refreshToken) as { userId: string } | null;

    if (!payload) {
        return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: payload.userId },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });

    const maxAge = user.role === 'SUPERUSER' ? 24 * 60 * 60 : 15 * 60;

    cookieStore.set('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: maxAge, // 1 day for SUPERUSER, 15 minutes otherwise
        path: '/',
    });

    return NextResponse.json({ accessToken: newAccessToken });
}
