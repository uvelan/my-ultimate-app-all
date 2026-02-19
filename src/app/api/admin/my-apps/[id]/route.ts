import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { id } = await params;

        const app = await prisma.myApp.update({
            where: { id },
            data: {
                name: body.name,
                description: body.description,
                imageLink: body.imageLink,
                appLink: body.appLink,
                isNative: body.isNative,
            },
        });

        return NextResponse.json(app);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        await prisma.myApp.delete({
            where: { id },
        });

        return NextResponse.json({ message: 'App deleted' });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
