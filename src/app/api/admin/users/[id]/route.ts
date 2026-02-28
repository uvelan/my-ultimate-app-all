import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth-node';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAccessToken(accessToken) as { role: string } | null;

    if (!payload || payload.role !== 'SUPERUSER') {
        return NextResponse.json({ error: 'Forbidden. Only Superusers can delete accounts.' }, { status: 403 });
    }

    // Next.js 15: params should be awaited if accessing async, but here it's passed as prop. 
    // In Next 15, route params for dynamic routes are async.
    // Wait, actually in Next 15 `params` is a promise.
    const { id } = await params;

    try {
        await prisma.user.delete({
            where: { id },
        });
        return NextResponse.json({ message: 'User deleted successfully' });
    } catch (error) {
        return NextResponse.json({ error: 'User not found or errors' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;

    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyAccessToken(accessToken) as { role: string } | null;

    if (!payload || !['ADMIN', 'SUPERUSER'].includes(payload.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { role, isActive } = body;

    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (payload.role === 'ADMIN' && userToUpdate.role === 'SUPERUSER') {
        return NextResponse.json({ error: 'Forbidden. Admins cannot modify Superusers.' }, { status: 403 });
    }

    const updateData: { role?: 'USER' | 'ADMIN' | 'SUPERUSER'; isActive?: boolean } = {};

    if (role) {
        if (payload.role === 'ADMIN' && role === 'SUPERUSER') {
            return NextResponse.json({ error: 'Forbidden. Admins cannot grant Superuser status.' }, { status: 403 });
        }
        if (!['USER', 'ADMIN', 'SUPERUSER'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }
        updateData.role = role;
    }

    if (typeof isActive === 'boolean') {
        updateData.isActive = isActive;
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    try {
        const user = await prisma.user.update({
            where: { id },
            data: updateData,
        });
        return NextResponse.json(user);
    } catch (error) {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
