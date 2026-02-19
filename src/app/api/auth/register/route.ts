import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth-node';
import { RegisterSchema } from '@/lib/validation';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const result = RegisterSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
        }

        const { name, email, password } = result.data;

        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        const hashedPassword = await hashPassword(password);

        // Force role to USER and isActive to false (default in schema)
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'USER',
                // isActive is false by default in schema
            },
        });

        return NextResponse.json({
            message: 'Registration successful. Account pending approval.',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
