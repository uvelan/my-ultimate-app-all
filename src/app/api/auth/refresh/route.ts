import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, generateAccessToken } from '@/lib/auth-node';
import { prisma } from '@/lib/prisma';

export async function POST() {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refreshToken')?.value;

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

    cookieStore.set('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60, // 15 minutes
        path: '/',
    });

    return NextResponse.json({ accessToken: newAccessToken });
}
