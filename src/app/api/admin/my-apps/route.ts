import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

// GET all apps for admin (could be same as public, but maybe with more info later)
export async function GET() {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apps = await prisma.myApp.findMany({
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(apps);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST create new app
export async function POST(req: Request) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, description, imageLink, appLink, isNative } = body;

        if (!name || !description || !imageLink || !appLink) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const app = await prisma.myApp.create({
            data: {
                name,
                description,
                imageLink,
                appLink,
                isNative: isNative || false,
            },
        });

        return NextResponse.json(app);
    } catch (error) {
        console.error('Error creating My App:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
