import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyAccessToken } from '@/lib/auth-node';
import { cookies } from 'next/headers';
import { z } from 'zod';

const CreateUserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['USER', 'ADMIN']),
    isActive: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const accessToken = cookieStore.get('accessToken')?.value;

        if (!accessToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyAccessToken(accessToken) as { role: string } | null;

        if (!payload || payload.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const result = CreateUserSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
        }

        const { name, email, password, role, isActive } = result.data;

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        const hashedPassword = await hashPassword(password);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                isActive,
            },
        });

        return NextResponse.json({
            message: 'User created successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        console.error('Create user error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
