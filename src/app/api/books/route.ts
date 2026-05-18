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

        const canSeeAll = auth.user.role === 'ADMIN' || auth.user.role === 'SUPERUSER';

        // Fetch books (no chapter content — just metadata)
        const books = await prisma.book.findMany({
            where: canSeeAll ? undefined : { userName: auth.user.email },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                cover: true,
                description: true,
                userName: true,
                fileName: true,
                chapterId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (books.length === 0) {
            return NextResponse.json([]);
        }

        // Use a $group aggregation to count chapters per bookId in ONE query.
        // This only reads the `bookId` field – never touches `content` – so it
        // won't hit MongoDB's 16 MB $lookup document-size limit.
        const bookIds = books.map(b => ({ $oid: b.id }));
        const chapterCounts = await prisma.$runCommandRaw({
            aggregate: 'Chapter',
            pipeline: [
                { $match: { bookId: { $in: bookIds } } },
                { $group: { _id: '$bookId', count: { $sum: 1 } } },
            ],
            cursor: {},
        }) as { cursor: { firstBatch: { _id: { $oid: string } | string; count: number }[] } };

        // Build a lookup map: bookId → chapter count
        const countMap = new Map<string, number>();
        for (const row of chapterCounts.cursor.firstBatch) {
            const id = typeof row._id === 'string' ? row._id : row._id.$oid ?? String(row._id);
            countMap.set(id, row.count);
        }

        // Merge counts into books (matching the _count.chapters shape the UI expects)
        const booksWithCounts = books.map(book => ({
            ...book,
            _count: { chapters: countMap.get(book.id) ?? 0 },
        }));

        return NextResponse.json(booksWithCounts);
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
        const file = formData.get('file') as File | null;
        const url = formData.get('url') as string | null;
        const title = formData.get('title') as string;
        const description = formData.get('description') as string || '';

        if (!file && !url) {
            return NextResponse.json({ error: 'No file or URL provided' }, { status: 400 });
        }

        let content: any = {};
        let coverUrl = '';
        let fileName = '';
        let fileBuffer: Buffer | null = null;
        let fileText: string | null = null;

        if (file) {
            fileName = file.name;
            if (fileName.toLowerCase().endsWith('.json')) {
                fileText = await file.text();
            } else {
                fileBuffer = Buffer.from(await file.arrayBuffer());
            }
        } else if (url) {
            try {
                let fetchUrl = url;
                
                // Transform Google Drive links to direct download
                if (fetchUrl.includes('drive.google.com/file/d/')) {
                    const match = fetchUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match) {
                        fetchUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
                    }
                }
                
                // Transform Dropbox links to direct download
                if (fetchUrl.includes('dropbox.com/') && fetchUrl.includes('dl=0')) {
                    fetchUrl = fetchUrl.replace('dl=0', 'dl=1');
                }

                const response = await fetch(fetchUrl);
                if (!response.ok) {
                    return NextResponse.json({ error: `Failed to download file from URL: ${response.statusText}` }, { status: 400 });
                }
                const arrayBuffer = await response.arrayBuffer();
                fileBuffer = Buffer.from(arrayBuffer);
                
                // Try to infer filename
                const contentDisposition = response.headers.get('content-disposition');
                if (contentDisposition && contentDisposition.includes('filename=')) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match) fileName = match[1];
                }
                if (!fileName) {
                    try {
                        const urlPath = new URL(url).pathname;
                        fileName = path.basename(urlPath);
                    } catch (e) {
                        fileName = '';
                    }
                    if (!fileName || !fileName.includes('.')) {
                        const contentType = response.headers.get('content-type');
                        if (contentType?.includes('application/epub+zip')) {
                            fileName = `downloaded-${Date.now()}.epub`;
                        } else if (contentType?.includes('application/json')) {
                            fileName = `downloaded-${Date.now()}.json`;
                        } else {
                            fileName = `downloaded-${Date.now()}.epub`;
                        }
                    }
                }
                if (fileName.toLowerCase().endsWith('.json') && fileBuffer) {
                    fileText = fileBuffer.toString('utf-8');
                }
            } catch (err) {
                 return NextResponse.json({ error: 'Failed to download file from URL' }, { status: 400 });
            }
        }

        if (fileName.toLowerCase().endsWith('.json') && fileText) {
            try {
                content = JSON.parse(fileText);
            } catch (e) {
                return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
            }
        } else if (fileName.toLowerCase().endsWith('.epub') && fileBuffer) {
            const buffer = fileBuffer;
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
                                // Add newlines to block-level elements so they don't merge into a single line
                                $('div, h1, h2, h3, h4, h5, h6, li, blockquote').append('\n');
                                $('br').replaceWith('\n');
                                
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
                fileName: fileName
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
                    fileName: fileName,
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
