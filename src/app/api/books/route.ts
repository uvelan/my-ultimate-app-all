import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { EPub } from 'epub2';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { load } from 'cheerio';
import AdmZip from 'adm-zip';

// Helper to resolve zip paths
function getZipEntry(zip: AdmZip, href: string, rootDir: string): AdmZip.IZipEntry | null {
    // 1. Try relative to rootDir (standard OPF behavior)
    let targetPath = path.posix.join(rootDir, href);
    let entry = zip.getEntry(targetPath);
    if (entry) return entry;

    // 2. Try exact href (if it was somehow absolute)
    entry = zip.getEntry(href);
    if (entry) return entry;

    // 3. Try to find by ending match (loose matching)
    // This is expensive but useful for fallback
    const entries = zip.getEntries();
    const normalizedHref = href.toLowerCase();
    return entries.find(e => e.entryName.toLowerCase().endsWith(normalizedHref)) || null;
}

// Helper to extract and resize cover image using ADM-ZIP
async function extractCover(epub: any, filePath: string): Promise<string | null> {
    try {
        console.log('Starting cover extraction via AdmZip...');
        const zip = new AdmZip(filePath);

        if (!epub.manifest) {
            console.log('No manifest found');
            return null;
        }

        // Determine OPF root directory
        const rootFile = epub.rootFile || 'OEBPS/content.opf'; // Fallback guess
        const rootDir = path.posix.dirname(rootFile);

        const candidates: { id: string, score: number, type: 'image' | 'html' }[] = [];

        Object.keys(epub.manifest).forEach(key => {
            const item = epub.manifest[key];
            const id = (item.id || '').toLowerCase();
            const href = (item.href || '').toLowerCase();
            const mediaType = (item['media-type'] || item.media_type || '').toLowerCase();
            const properties = (item.properties || '');

            let score = 0;
            let type: 'image' | 'html' | null = null;

            if (mediaType.startsWith('image')) type = 'image';
            else if (mediaType.includes('html') || mediaType.includes('xhtml')) type = 'html';
            else return;

            if (epub.metadata.cover && item.id === epub.metadata.cover) score += 1000;
            if (properties.includes('cover-image')) score += 500;
            if (id.includes('cover')) score += 50;
            if (href.includes('cover')) score += 50;
            if (key.toLowerCase().includes('cover')) score += 10;
            if (type === 'image') score += 5;

            if (score > 0) candidates.push({ id: item.id, score, type });
        });

        if (candidates.length === 0 && epub.flow) {
            console.log('No scored candidates, trying aggressive fallback on first 10 items');
            const limit = Math.min(epub.flow.length, 10);
            for (let i = 0; i < limit; i++) {
                const id = epub.flow[i].id;
                const item = epub.manifest[id];
                if (item) {
                    const mediaType = (item['media-type'] || item.media_type || '').toLowerCase();
                    if (mediaType.includes('html') || mediaType.includes('xhtml')) {
                        candidates.push({ id, score: 20 - i, type: 'html' });
                    } else if (mediaType.startsWith('image')) {
                        candidates.push({ id, score: 30 - i, type: 'image' });
                    }
                }
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        console.log(`Found ${candidates.length} candidates`);

        for (const candidate of candidates) {
            console.log(`Trying candidate ${candidate.id} (${candidate.type}, score: ${candidate.score})`);
            const item = epub.manifest[candidate.id];
            if (!item) continue;

            let imageBuffer: Buffer | null = null;

            if (candidate.type === 'image') {
                const entry = getZipEntry(zip, item.href, rootDir);
                if (entry) {
                    try {
                        imageBuffer = entry.getData();
                    } catch (e) {
                        console.log(`Failed to read zip entry for ${candidate.id}`);
                    }
                } else {
                    console.log(`Could not find zip entry for ${item.href}`);
                }
            } else if (candidate.type === 'html') {
                const entry = getZipEntry(zip, item.href, rootDir);
                if (entry) {
                    try {
                        const text = entry.getData().toString('utf8');
                        const $ = load(text);
                        const img = $('img').first();
                        const svgImage = $('image').first();
                        let src = img.attr('src') || svgImage.attr('xlink:href') || svgImage.attr('href');

                        if (src) {
                            console.log(`Found src in HTML: ${src}`);
                            const decodedSrc = decodeURIComponent(src);
                            // Resolve src relative to HTML file
                            const htmlDir = path.posix.dirname(path.posix.join(rootDir, item.href));

                            // Try to find the image entry
                            const imageEntry = getZipEntry(zip, decodedSrc, htmlDir);
                            if (imageEntry) {
                                console.log(`Resolved to zip entry: ${imageEntry.entryName}`);
                                imageBuffer = imageEntry.getData();
                            } else {
                                console.log('Could not resolve src to zip entry');
                            }
                        }
                    } catch (err) {
                        console.log(`Failed to parse HTML ${candidate.id}`);
                    }
                }
            }

            if (imageBuffer) {
                try {
                    console.log(`Processing image buffer: length=${imageBuffer.length}, magic=${imageBuffer.toString('hex').slice(0, 20)}`);
                    const resized = await sharp(imageBuffer)
                        .resize(300, 450, { fit: "cover" })
                        .toFormat("jpeg", { quality: 80 })
                        .toBuffer();
                    console.log('Cover extracted and resized successfully');
                    return `data:image/jpeg;base64,${resized.toString("base64")}`;
                } catch (e) {
                    console.error('Sharp processing failed', e);
                }
            }
        }
    } catch (e) {
        console.error('Critical error in extractCover:', e);
    }
    return null;
}

export async function GET(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let books;
        if (auth.user.role === 'ADMIN') {
            books = await prisma.book.findMany({
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    cover: true,
                    description: true,
                    userName: true,
                    fileName: true,
                    createdAt: true,
                    updatedAt: true,
                    // Exclude content and chapters for list view
                }
            });
        } else {
            books = await prisma.book.findMany({
                where: { userName: auth.user.email },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    title: true,
                    cover: true,
                    description: true,
                    userName: true,
                    fileName: true,
                    createdAt: true,
                    updatedAt: true,
                }
            });
        }

        return NextResponse.json(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const title = formData.get('title') as string;
        const description = formData.get('description') as string || '';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        let content: any = {};
        let coverUrl = '';

        if (file.name.endsWith('.json')) {
            const text = await file.text();
            try {
                content = JSON.parse(text);
            } catch (e) {
                return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
            }
        } else if (file.name.endsWith('.epub')) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const tempDir = os.tmpdir();
            const tempFilePath = path.join(tempDir, `upload-${Date.now()}.epub`);

            await fs.writeFile(tempFilePath, buffer);

            try {
                const epub = await EPub.createAsync(tempFilePath);
                const metadata = epub.metadata;
                const chapters = [];

                if (epub.flow) {
                    for (const chapterRef of epub.flow) {
                        try {
                            const chapterHtml = await epub.getChapterAsync(chapterRef.id);
                            const $ = load(chapterHtml);
                            const paragraphs: string[] = [];

                            $('p').each((_, element) => {
                                const text = $(element).text().trim();
                                if (text.length > 0) {
                                    paragraphs.push(text);
                                }
                            });

                            if (paragraphs.length === 0) {
                                const text = $.root().text().trim();
                                if (text) {
                                    const lines = text.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line.length > 0);
                                    paragraphs.push(...lines);
                                }
                            }

                            chapters.push({
                                id: chapterRef.id,
                                title: chapterRef.title || chapterRef.id,
                                content: paragraphs
                            });
                        } catch (err) {
                            console.error(`Failed to read chapter ${chapterRef.id}`, err);
                        }
                    }
                }

                content = {
                    metadata: metadata,
                    chapters: chapters
                };

                // Extract cover image
                try {
                    // Pass tempFilePath to use AdmZip
                    const coverBase64 = await extractCover(epub, tempFilePath);
                    if (coverBase64) {
                        coverUrl = coverBase64;
                    }
                } catch (coverErr) {
                    console.error('Failed to extract cover:', coverErr);
                }

            } catch (err) {
                console.error('EPUB parsing error:', err);
                return NextResponse.json({ error: 'Failed to parse EPUB' }, { status: 500 });
            } finally {
                await fs.unlink(tempFilePath).catch(() => { });
            }
        } else {
            return NextResponse.json({ error: 'Unsupported file type. Only .json and .epub are allowed.' }, { status: 400 });
        }

        const existingBook = await prisma.book.findFirst({
            where: {
                userName: auth.user.email,
                fileName: file.name
            }
        });

        let book;

        if (existingBook) {
            // Update existing book
            book = await prisma.book.update({
                where: { id: existingBook.id },
                data: {
                    title: title || existingBook.title,
                    description: description || existingBook.description,
                    // content: content, // Deprecated in favor of Chapter model
                    cover: coverUrl || existingBook.cover,
                }
            });

            // Delete old chapters to replace with new ones
            await prisma.chapter.deleteMany({
                where: { bookId: book.id }
            });

        } else {
            // Create new book
            book = await prisma.book.create({
                data: {
                    title: title || (content.metadata?.title as string) || 'Untitled',
                    description: description || (content.metadata?.description as string),
                    // content: content, // Deprecated
                    userName: auth.user.email,
                    fileName: file.name,
                    cover: coverUrl,
                }
            });
        }

        // Save Chapters
        if (content.chapters && Array.isArray(content.chapters)) {
            console.log(`Saving ${content.chapters.length} chapters for book ${book.id}`);

            // Prepare chapter data
            const chapterData = content.chapters.map((c: any, index: number) => ({
                bookId: book.id,
                title: c.title || `Chapter ${index + 1}`,
                content: c.content,
                order: index
            }));

            // Create chapters in batches/transactions if possible, or serially
            // MongoDB allows createMany
            await prisma.chapter.createMany({
                data: chapterData
            });
            console.log('Chapters saved successfully');
        }

        return NextResponse.json(book);

    } catch (error) {
        console.error('Error creating book:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
