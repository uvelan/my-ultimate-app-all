import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

// GET all apps for admin (could be same as public, but maybe with more info later)
export async function GET() {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'SUPERUSER')) {
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

        let name = '', description = '', imageLink = '', appLink = '', isNative = false;

        if (isFormData) {
            const formData = body as FormData;
            name = formData.get('name') as string;
            description = formData.get('description') as string;
            appLink = formData.get('appLink') as string;
            isNative = formData.get('isNative') === 'true';
            
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
                
                imageLink = `/uploads/apps/${filename}`;
            } else {
                imageLink = formData.get('imageLink') as string;
            }
        } else {
            // Fallback for JSON
            name = body.name;
            description = body.description;
            imageLink = body.imageLink;
            appLink = body.appLink;
            isNative = body.isNative;
        }

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
