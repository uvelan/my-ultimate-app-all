import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const book = await prisma.book.findUnique({
            where: { id: id },
            include: {
                chapters: {
                    orderBy: { order: 'asc' }
                }
            }
        });

        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        return NextResponse.json(book);
    } catch (error) {
        console.error('Error fetching book:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Use Promise for params
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Await the params promise
        const { id } = await params;

        const book = await prisma.book.findUnique({
            where: { id: id },
        });

        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        // Check ownership or admin status
        if (auth.user.role !== 'ADMIN' && book.userName !== auth.user.email) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Delete cover image if it exists and is a local file
        if (book.cover && book.cover.startsWith('/uploads/covers/')) {
            const coverPath = path.join(process.cwd(), 'public', book.cover);
            try {
                await fs.unlink(coverPath);
                console.log(`Deleted cover image: ${coverPath}`);
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                    console.error('Error deleting cover image:', err);
                }
            }
        }

        await prisma.book.delete({
            where: { id: id },
        });


        return NextResponse.json({ message: 'Book deleted successfully' });
    } catch (error) {
        console.error('Error deleting book:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Use Promise for params
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { chapterId, sentenceId } = body;

        // Basic validations (allow 0 as valid index)
        if (typeof chapterId !== 'number' && typeof sentenceId !== 'number') {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        const data: any = {};
        if (typeof chapterId === 'number') data.chapterId = chapterId;
        if (typeof sentenceId === 'number') data.sentenceId = sentenceId;

        const updatedBook = await prisma.book.update({
            where: { id: id },
            data: data,
        });

        return NextResponse.json(updatedBook);
    } catch (error) {
        console.error('Error updating book progress:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
