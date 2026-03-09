import { prisma } from './prisma';
import * as cheerio from 'cheerio';
import { Novel } from '@prisma/client';

export async function startNovelSyncAsync(novelId: string, userId: string) {
    try {
        let novel = await prisma.novel.findUnique({
            where: { id: novelId },
            include: { sourceWebsite: true }
        });

        if (!novel) return;

        let chapters = Array.isArray(novel.allChapters) ? [...(novel.allChapters as any[])] : [];
        if (chapters.length === 0) {
            await updateStatus(novelId, 'ERROR', chapters);
            return;
        }

        // Set status to SCRAPING
        await updateStatus(novelId, 'SCRAPING', chapters);

        let scrapedCount = chapters.filter(c => c.status === 'done' && c.content).length;
        let bookCreated = false;
        let consecutiveFailures = 0;

        const maxParallel = 3;
        const pendingIndexes = chapters
            .map((c, i) => ({ c, i }))
            .filter(x => x.c.status !== 'done' || !x.c.content)
            .map(x => x.i);

        let i = 0;

        // Scrape chapters in chunks
        while (i < pendingIndexes.length) {
            if (consecutiveFailures >= 10) {
                console.log(`Sync aborted for ${novelId} due to 10 consecutive failures.`);
                break;
            }

            const chunk = pendingIndexes.slice(i, i + maxParallel);
            i += maxParallel;

            await Promise.all(chunk.map(async (idx) => {
                const chap = chapters[idx];
                try {
                    console.log(`Scraping chapter: ${chap.url}`);
                    const content = await fetchChapterContent(chap.url, novel.sourceWebsite?.url || '');

                    if (content && content.length > 50) {
                        chapters[idx] = { ...chap, content, status: 'done' };
                        scrapedCount++;
                        consecutiveFailures = 0; // reset on success
                    } else {
                        chapters[idx] = { ...chap, status: 'error' };
                        consecutiveFailures++;
                    }
                } catch (e) {
                    chapters[idx] = { ...chap, status: 'error' };
                    consecutiveFailures++;
                    console.error(`Failed to scrape ${chap.url}:`, e);
                }
            }));

            // Save progress every chunk
            await prisma.novel.update({
                where: { id: novelId },
                data: { allChapters: chapters as any }
            });

            // Check if we hit minimum 10 to create book
            if (!bookCreated && scrapedCount >= 10) {
                bookCreated = await createBookFromNovel(novelId, chapters, userId);
            }

            // small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 1000));
        }

        // Once all done (or aborted), if total available is < 10 but we finished array, try to create book anyway if not created
        if (!bookCreated && scrapedCount > 0) {
            await createBookFromNovel(novelId, chapters, userId);
        }

        // If aborted due to failures, we set status to ERROR but save the chapters we got.
        // Otherwise DONE.
        if (consecutiveFailures >= 10) {
            await updateStatus(novelId, 'ERROR', chapters);
        } else {
            await updateStatus(novelId, 'DONE', chapters);
        }

    } catch (e) {
        console.error(`Sync novel ${novelId} failed:`, e);
        await prisma.novel.update({
            where: { id: novelId },
            data: { status: 'ERROR' }
        }).catch(() => { });
    }
}

async function updateStatus(id: string, status: string, chapters: any[]) {
    await prisma.novel.update({
        where: { id },
        data: { status, allChapters: chapters as any }
    });
}

async function fetchChapterContent(url: string, sourceHost: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const urlObj = new URL(url);

    let content = '';

    // Logic separate for different sites
    if (urlObj.hostname.includes('novelfull') || sourceHost.includes('novelfull')) {
        content = $('#chapter-content').html() || $('.chapter-c').html() || '';
    }
    else if (urlObj.hostname.includes('novelfire') || sourceHost.includes('novelfire')) {
        // NovelFire's chapter content is normally inside .content inside the article #chapter-container
        content = $('#chapter-container .content').html() || $('.chapter-content').html() || $('#novel-content').html() || '';
    }
    else {
        // Generic fallback
        content = $('#chapter-content').html() || $('.chapter-content').html() || $('.reading-content').html() || '';
    }

    if (!content) return '';

    // Clean up content (remove scripts, ads)
    const $content = cheerio.load(content);
    $content('script, style, iframe, .ads, .adsbygoogle').remove();

    // Format into clean paragraphs
    let textNodes: string[] = [];
    $content('p, div, br').each((_, el) => {
        const t = $content(el).text().trim();
        if (t && !textNodes.includes(t)) {
            textNodes.push(t);
        }
    });

    if (textNodes.length > 0) {
        return textNodes.join('\n\n');
    }

    // fallback if no paragraphs
    return $content.root().text().trim();
}

async function createBookFromNovel(novelId: string, chapters: any[], userId: string): Promise<boolean> {
    try {
        const novel = await prisma.novel.findUnique({ where: { id: novelId } });
        if (!novel) return false;

        const urlObj = new URL(novel.sourceLink);
        const hostSuffix = urlObj.hostname.replace('www.', '');
        const bookTitle = `${novel.title} - ${hostSuffix}`;

        // Check if book already exists
        const existingBook = await prisma.book.findFirst({
            where: { title: bookTitle }
        });

        if (existingBook) {
            // Already created, but might need to append chapters in future. 
            // For now just return true.
            return true;
        }

        // Find user by id to get actual name
        const user = await prisma.user.findUnique({ where: { id: userId } });

        // Create book
        const book = await prisma.book.create({
            data: {
                title: bookTitle,
                description: novel.description || '',
                cover: novel.imageLink || '',
                userName: user?.name || 'Scraper',
            }
        });

        // Insert valid chapters
        const validChapters = chapters.filter(c => c.status === 'done' && c.content);

        // Prepare chapters payload
        const chapterData = validChapters.map((c, i) => ({
            bookId: book.id,
            title: c.title,
            content: [{
                type: 'paragraph',
                children: [{ text: c.content }]
            }],
            order: i + 1
        }));

        await prisma.chapter.createMany({
            data: chapterData
        });

        console.log(`Created book ${bookTitle} with ${chapterData.length} chapters.`);
        return true;
    } catch (e) {
        console.error("Failed to create book from novel:", e);
        return false;
    }
}
