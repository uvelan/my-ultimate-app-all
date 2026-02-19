import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, generateAccessToken, generateRefreshToken } from '@/lib/auth-node';
import { LoginSchema } from '@/lib/validation';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const result = LoginSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
        }

        const { email, password } = result.data;

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const isValidPassword = await comparePassword(password, user.password);

        if (!isValidPassword) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ error: 'Account pending approval' }, { status: 403 });
        }

        const accessToken = generateAccessToken({ id: user.id, role: user.role, email: user.email });
        const refreshToken = generateRefreshToken({ id: user.id });

        // Store tokens in HttpOnly cookies
        const cookieStore = await cookies();
        cookieStore.set('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60, // 15 minutes
            path: '/',
        });

        cookieStore.set('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: '/',
        });

        return NextResponse.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
