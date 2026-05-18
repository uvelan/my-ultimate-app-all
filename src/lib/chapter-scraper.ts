import { prisma } from './prisma';
import * as cheerio from 'cheerio';

// ─── Logger ──────────────────────────────────────────────────────────────────

type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';

function log(level: LogLevel, context: string, message: string, meta?: Record<string, any>) {
    const ts = new Date().toISOString();
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'](
        `[${ts}] [${level}] [Scraper:${context}] ${message}${metaStr}`
    );
}

// ─── Main Sync ────────────────────────────────────────────────────────────────

export async function startNovelSyncAsync(novelId: string, userId: string) {
    const syncStart = Date.now();
    log('INFO', 'Sync', `Starting background sync`, { novelId, userId });

    try {
        const novel = await prisma.novel.findUnique({
            where: { id: novelId },
            include: { sourceWebsite: true }
        });

        if (!novel) {
            log('ERROR', 'Sync', `Novel not found, aborting`, { novelId });
            return;
        }

        log('INFO', 'Sync', `Found novel: "${novel.title}"`, {
            novelId,
            sourceLink: novel.sourceLink,
            site: novel.sourceWebsite?.name ?? 'unknown'
        });

        let chapters = Array.isArray(novel.allChapters) ? [...(novel.allChapters as any[])] : [];

        if (chapters.length === 0) {
            log('ERROR', 'Sync', `No chapters found in novel record — aborting`, { novelId });
            await updateStatus(novelId, 'ERROR', chapters);
            return;
        }

        const alreadyDone = chapters.filter(c => c.status === 'done' && c.content).length;
        const pending = chapters.filter(c => c.status !== 'done' || !c.content).length;

        log('INFO', 'Sync', `Chapter map loaded`, {
            total: chapters.length,
            alreadyDone,
            pendingToScrape: pending
        });

        await updateStatus(novelId, 'SCRAPING', chapters);
        log('INFO', 'Sync', `Status set to SCRAPING`);

        let scrapedCount = alreadyDone;
        let failedCount = 0;
        let bookCreated = false;
        let consecutiveFailures = 0;

        const maxParallel = 3;
        const pendingIndexes = chapters
            .map((c, i) => ({ c, i }))
            .filter(x => x.c.status !== 'done' || !x.c.content)
            .map(x => x.i);

        let i = 0;

        while (i < pendingIndexes.length) {
            if (consecutiveFailures >= 10) {
                log('ERROR', 'Sync', `Aborting: 10 consecutive failures hit`, {
                    novelId,
                    scrapedSoFar: scrapedCount,
                    failedSoFar: failedCount
                });
                break;
            }

            const chunk = pendingIndexes.slice(i, i + maxParallel);
            i += maxParallel;

            log('INFO', 'Sync', `Scraping chunk`, {
                chapterIndexes: chunk,
                chunkSize: chunk.length,
                progress: `${scrapedCount}/${chapters.length}`
            });

            await Promise.all(chunk.map(async (idx) => {
                const chap = chapters[idx];
                const chapStart = Date.now();

                try {
                    const content = await fetchChapterContent(chap.url, novel.sourceWebsite?.url || '');

                    if (content && content.length > 50) {
                        chapters[idx] = { ...chap, content, status: 'done' };
                        scrapedCount++;
                        consecutiveFailures = 0;
                        log('SUCCESS', 'Chapter', `✅ Scraped successfully`, {
                            title: chap.title,
                            url: chap.url,
                            chars: content.length,
                            durationMs: Date.now() - chapStart
                        });
                    } else {
                        chapters[idx] = { ...chap, status: 'error' };
                        failedCount++;
                        consecutiveFailures++;
                        log('WARN', 'Chapter', `⚠️ Content too short or empty`, {
                            title: chap.title,
                            url: chap.url,
                            contentLength: content?.length ?? 0,
                            durationMs: Date.now() - chapStart
                        });
                    }
                } catch (e: any) {
                    chapters[idx] = { ...chap, status: 'error' };
                    failedCount++;
                    consecutiveFailures++;
                    log('ERROR', 'Chapter', `❌ Fetch failed`, {
                        title: chap.title,
                        url: chap.url,
                        error: e.message,
                        durationMs: Date.now() - chapStart
                    });
                }
            }));

            // Persist progress after every chunk
            await prisma.novel.update({
                where: { id: novelId },
                data: { allChapters: chapters as any }
            });

            log('INFO', 'Sync', `Progress saved to DB`, {
                scrapedSoFar: scrapedCount,
                failedSoFar: failedCount,
                remaining: pendingIndexes.length - i
            });

            // Create book once 10+ chapters are ready
            if (!bookCreated && scrapedCount >= 10) {
                log('INFO', 'Sync', `Threshold reached — creating book entry`, { scrapedCount });
                bookCreated = await createBookFromNovel(novelId, chapters, userId);
            }

            // Rate-limit delay
            await new Promise(r => setTimeout(r, 1000));
        }

        // Final book creation if not yet done
        if (!bookCreated && scrapedCount > 0) {
            log('INFO', 'Sync', `Creating book after full pass`, { scrapedCount });
            await createBookFromNovel(novelId, chapters, userId);
        }

        const finalStatus = consecutiveFailures >= 10 ? 'ERROR' : 'DONE';
        await updateStatus(novelId, finalStatus, chapters);

        const totalDuration = ((Date.now() - syncStart) / 1000).toFixed(1);
        log(finalStatus === 'DONE' ? 'SUCCESS' : 'ERROR', 'Sync',
            `Sync complete — status: ${finalStatus}`, {
            novelId,
            title: novel.title,
            totalChapters: chapters.length,
            scraped: scrapedCount,
            failed: failedCount,
            durationSec: `${totalDuration}s`
        });

    } catch (e: any) {
        const totalDuration = ((Date.now() - syncStart) / 1000).toFixed(1);
        log('ERROR', 'Sync', `Unhandled sync crash`, {
            novelId,
            error: e.message,
            durationSec: `${totalDuration}s`
        });
        await prisma.novel.update({
            where: { id: novelId },
            data: { status: 'ERROR' }
        }).catch(() => {});
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateStatus(id: string, status: string, chapters: any[]) {
    await prisma.novel.update({
        where: { id },
        data: { status, allChapters: chapters as any }
    });
}

async function fetchChapterContent(url: string, sourceHost: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let res: Response;
    try {
        res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const urlObj = new URL(url);

    let content = '';

    if (urlObj.hostname.includes('novelfull') || sourceHost.includes('novelfull')) {
        content = $('#chapter-content').html() || $('.chapter-c').html() || '';
    } else if (urlObj.hostname.includes('novelfire') || sourceHost.includes('novelfire')) {
        content = $('#chapter-container .content').html() || $('.chapter-content').html() || $('#novel-content').html() || '';
    } else {
        content = $('#chapter-content').html() || $('.chapter-content').html() || $('.reading-content').html() || '';
    }

    if (!content) return '';

    const $c = cheerio.load(content);
    $c('script, style, iframe, .ads, .adsbygoogle').remove();

    const textNodes: string[] = [];
    $c('p').each((_, el) => {
        const t = $c(el).text().trim();
        if (t && !textNodes.includes(t)) textNodes.push(t);
    });

    return textNodes.length > 0 ? textNodes.join('\n\n') : $c.root().text().trim();
}

async function createBookFromNovel(novelId: string, chapters: any[], userId: string): Promise<boolean> {
    try {
        const novel = await prisma.novel.findUnique({ where: { id: novelId } });
        if (!novel) return false;

        const urlObj = new URL(novel.sourceLink);
        const hostSuffix = urlObj.hostname.replace('www.', '');
        const bookTitle = `${novel.title} - ${hostSuffix}`;

        const existingBook = await prisma.book.findFirst({ where: { title: bookTitle } });
        if (existingBook) {
            log('INFO', 'Book', `Book already exists, skipping create`, { bookTitle });
            return true;
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });

        const book = await prisma.book.create({
            data: {
                title: bookTitle,
                description: novel.description || '',
                cover: novel.imageLink || '',
                userName: user?.name || 'Scraper',
            }
        });

        const validChapters = chapters.filter(c => c.status === 'done' && c.content);
        const chapterData = validChapters.map((c, i) => ({
            bookId: book.id,
            title: c.title,
            content: [{ type: 'paragraph', children: [{ text: c.content }] }],
            order: i + 1
        }));

        await prisma.chapter.createMany({ data: chapterData });

        log('SUCCESS', 'Book', `📚 Book created successfully`, {
            bookTitle,
            bookId: book.id,
            chaptersInserted: chapterData.length
        });

        return true;
    } catch (e: any) {
        log('ERROR', 'Book', `Failed to create book`, { novelId, error: e.message });
        return false;
    }
}
