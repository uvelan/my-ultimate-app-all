import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'SUPERUSER')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body;
        let isFormData = false;
        
        try {
            const contentType = req.headers.get('content-type') || '';
            if (contentType.includes('multipart/form-data')) {
                body = await req.formData();
                isFormData = true;
            } else {
                body = await req.json();
            }
        } catch (e) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const { id } = await params;
        
        let updateData: any = {};

        if (isFormData) {
            const formData = body as FormData;
            if (formData.has('name')) updateData.name = formData.get('name') as string;
            if (formData.has('description')) updateData.description = formData.get('description') as string;
            if (formData.has('appLink')) updateData.appLink = formData.get('appLink') as string;
            if (formData.has('isNative')) updateData.isNative = formData.get('isNative') === 'true';
            
            const imageFile = formData.get('imageFile') as File | null;
            if (imageFile && imageFile.size > 0) {
                const fs = await import('fs/promises');
                const path = await import('path');
                
                const bytes = await imageFile.arrayBuffer();
                const buffer = Buffer.from(bytes);
                
                const ext = imageFile.name.split('.').pop() || 'png';
                const filename = `app-${Date.now()}-${Math.round(Math.random() * 1000)}.${ext}`;
                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'apps');
                
                await fs.mkdir(uploadDir, { recursive: true });
                await fs.writeFile(path.join(uploadDir, filename), buffer);
                
                updateData.imageLink = `/uploads/apps/${filename}`;
            } else if (formData.has('imageLink')) {
                updateData.imageLink = formData.get('imageLink') as string;
            }
        } else {
            updateData = body;
        }

        const app = await prisma.myApp.update({
            where: { id },
            data: {
                ...updateData,
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
        if (!auth.isAuthenticated || (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'SUPERUSER')) {
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
