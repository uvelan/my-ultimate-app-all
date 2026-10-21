import { prisma } from './prisma';
import { chapterParagraphBlocks } from './chapter-paragraphs';
import * as cheerio from 'cheerio';
import { fetchScraperResource } from './scraper-fetch';
import { SCRAPE_HEARTBEAT_MS } from './scraper-jobs';
import { loadScrapeJob, writeScrapeProgress, readSavedChapterBatch } from './scraper-store';

function isSavedChapter(chapter: any): boolean {
    return chapter.status === 'done' && Boolean(chapter.content || chapter.hasSavedContent);
}

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
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
        const novel = await loadScrapeJob(novelId);

        if (!novel) {
            log('ERROR', 'Sync', `Novel not found, aborting`, { novelId });
            return;
        }
        if (novel.status !== 'SCRAPING') { await stopIfRequested(novelId); return; }

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

        const alreadyDone = chapters.filter(isSavedChapter).length;
        const pending = chapters.filter(c => !isSavedChapter(c)).length;

        log('INFO', 'Sync', `Chapter map loaded`, {
            total: chapters.length,
            alreadyDone,
            pendingToScrape: pending
        });

        if (await stopIfRequested(novelId)) return;
        await writeScrapeProgress(novelId, {}, 'SCRAPING');
        log('INFO', 'Sync', `Status set to SCRAPING`);
        let heartbeatBusy = false;
        heartbeat = setInterval(async () => {
            if (heartbeatBusy) return;
            heartbeatBusy = true;
            try {
                // Keep long page loads/manual verification alive without changing
                // saved content or reviving a finished/interrupted job.
                await writeScrapeProgress(novelId, {}, ['SCRAPING', 'IMPORTING']);
            } catch (error: any) {
                log('WARN', 'Sync', 'Could not update worker heartbeat', { novelId, error: error.message });
            } finally { heartbeatBusy = false; }
        }, SCRAPE_HEARTBEAT_MS);
        heartbeat.unref?.();

        let scrapedCount = alreadyDone;
        let failedCount = 0;
        const pendingIndexes = chapters
            .map((c, i) => ({ c, i }))
            .filter(x => !isSavedChapter(x.c))
            .map(x => x.i);

        for (const idx of pendingIndexes) {
            if (await stopIfRequested(novelId)) return;
            const chap = chapters[idx];
            const chapterStart = Date.now();
            try {
                const tags = novel.sourceWebsite?.tagsToExtract as Record<string, string> | null;
                await fetchAndSaveChapterContent(chap.url, novel.sourceWebsite?.url || '', tags?.content, async content => {
                    const saveStart = Date.now();
                    const nextChapters = [...chapters];
                    nextChapters[idx] = { ...chap, content, status: 'done' };
                    delete nextChapters[idx].error;
                    delete nextChapters[idx].errorCode;
                    delete nextChapters[idx].attempts;
                    // The browser queue stays locked until this write succeeds.
                    const saved = await writeScrapeProgress(novelId, { chapterIndex: idx, chapter: nextChapters[idx] });
                    if (!saved.count) throw new Error('Novel no longer exists; chapter was not saved');
                    chapters = nextChapters;
                    scrapedCount++;
                    log('SUCCESS', 'Chapter', 'Chapter loaded and saved', {
                        title: chap.title, url: chap.url, chars: content.length,
                        progress: scrapedCount + '/' + chapters.length,
                        loadMs: saveStart - chapterStart,
                        saveMs: Date.now() - saveStart,
                        totalMs: Date.now() - chapterStart,
                    });
                }, () => stopIfRequested(novelId));
            } catch (error: any) {
                if (await stopIfRequested(novelId)) return;
                failedCount++;
                chapters[idx] = {
                    ...chap, status: 'error', error: error.message || 'Chapter could not be loaded or saved',
                    errorCode: error.code || 'CHAPTER_FAILED', attempts: error.attempts || 1,
                };
                // Stop at this chapter. Sync will resume here without re-fetching
                // the chapters whose content has already been saved.
                const failed = await writeScrapeProgress(novelId, { status: 'ERROR', chapterIndex: idx, chapter: chapters[idx] }, 'SCRAPING');
                if (!failed.count) { await stopIfRequested(novelId); return; }
                log('ERROR', 'Chapter', 'Stopped at chapter; no later chapter will be opened', {
                    title: chap.title, url: chap.url, error: error.message,
                });
                break;
            }
            const chapterDelay = Math.min(10000, Math.max(0, Number(process.env.SCRAPER_CHAPTER_DELAY_MS) || 0));
            if (chapterDelay > 0 && idx !== pendingIndexes[pendingIndexes.length - 1]) {
                await new Promise(r => setTimeout(r, chapterDelay));
            }
        }

        if (await stopIfRequested(novelId)) return;
        const finalStatus = chapters.every(isSavedChapter) ? 'DONE' : 'ERROR';
        let expectedStatus = 'SCRAPING';
        if (scrapedCount > 0) {
            if (finalStatus === 'DONE') {
                const importing = await writeScrapeProgress(novelId, { status: 'IMPORTING' }, 'SCRAPING');
                if (!importing.count) { await stopIfRequested(novelId); return; }
                expectedStatus = 'IMPORTING';
            }
            log('INFO', 'Sync', 'Adding saved chapters to library', { scrapedCount });
            const imported = await createBookFromNovel(novelId, chapters, userId);
            if (!imported && finalStatus === 'DONE') {
                await writeScrapeProgress(novelId, { status: 'IMPORT_ERROR' }, expectedStatus);
                return;
            }
        }

        const finished = await writeScrapeProgress(novelId, { status: finalStatus }, expectedStatus);
        if (!finished.count) { await stopIfRequested(novelId); return; }

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
        if (await stopIfRequested(novelId).catch(() => false)) return;
        await writeScrapeProgress(novelId, { status: 'ERROR' }, ['SCRAPING', 'IMPORTING']).catch(() => {});
    } finally {
        clearInterval(heartbeat);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateStatus(id: string, status: string, chapters: any[]) {
    await writeScrapeProgress(id, { status });
}

async function stopIfRequested(id: string): Promise<boolean> {
    const novel = await prisma.novel.findUnique({ where: { id }, select: { status: true } });
    if (novel?.status === 'STOPPING') {
        await writeScrapeProgress(id, { status: 'PAUSED' }, 'STOPPING');
        log('INFO', 'Sync', 'Stopped at a saved chapter boundary', { novelId: id });
        return true;
    }
    return !novel || ['PAUSED', 'INTERRUPTED', 'DONE'].includes(novel.status);
}

async function fetchAndSaveChapterContent(
    url: string, sourceHost: string, contentSelector: string | undefined,
    save: (content: string) => Promise<void>, shouldStop: () => Promise<boolean>
): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let saving = false;
        try {
            await fetchScraperResource(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            }, {
                attempt,
                chapterSelector: contentSelector || '#chapter-content, .chapter-c',
                consume: async res => {
                    if (!res.ok) {
                        const retryHeader = res.headers.get('retry-after');
                        const retrySeconds = retryHeader ? (/^\d+$/.test(retryHeader)
                            ? Number(retryHeader) : Math.max(0, (Date.parse(retryHeader) - Date.now()) / 1000)) : 5;
                        throw Object.assign(new Error('HTTP ' + res.status + ' from ' + url), {
                            code: 'HTTP_' + res.status,
                            retryable: res.status >= 500 || (res.status === 429 && Number.isFinite(retrySeconds) && retrySeconds <= 30),
                            retryAfterMs: res.status === 429 ? Math.max(1000, retrySeconds * 1000) : undefined,
                        });
                    }
                    const content = extractChapterContent(await res.text(), url, sourceHost, contentSelector);
                    if (content.length <= 50) throw Object.assign(new Error('Chapter content is empty or incomplete: ' + url), {
                        code: 'CHAPTER_EMPTY', retryable: true,
                    });
                    saving = true;
                    // Do not retry navigation after saving starts. A save failure
                    // stops at this chapter and leaves all later chapters untouched.
                    await save(content);
                },
            });
            return;
        } catch (error: any) {
            error.attempts = attempt;
            if (saving) { error.code ||= 'SAVE_FAILED'; error.retryable = false; }
            const retryable = !saving && (error.retryable === true || error.name === 'AbortError' || error.name === 'TypeError');
            if (!retryable || attempt === 3) throw error;
            if (await shouldStop()) throw Object.assign(new Error('Job stopped'), { code: 'SCRAPE_STOPPED', retryable: false });
            const delay = error.retryAfterMs ?? 500 * Math.pow(2, attempt - 1);
            log('WARN', 'Chapter', 'Retrying the current chapter before advancing', {
                url, attempt, nextAttempt: attempt + 1, delayMs: delay, error: error.message,
            });
            await new Promise(resolve => setTimeout(resolve, delay));
        } finally { clearTimeout(timeoutId); }
    }
}

function extractChapterContent(html: string, url: string, sourceHost: string, contentSelector?: string): string {
    const $ = cheerio.load(html);
    const urlObj = new URL(url);

    let content = '';

    if (contentSelector) content = $(contentSelector).first().html() || '';

    if (!content && (urlObj.hostname.includes('novelfull') || sourceHost.includes('novelfull'))) {
        content = $('#chapter-content').html() || $('.chapter-c').html() || '';
    } else if (!content && (urlObj.hostname.includes('novelfire') || sourceHost.includes('novelfire'))) {
        content = $('#chapter-container .content').html() || $('#chapter-container').html() || $('.chapter-content').html() || $('#novel-content').html() || '';
    } else if (!content) {
        content = $('#chapter-content').html() || $('.chapter-content').html() || $('.reading-content').html() || $('.chapter-inner').html() || '';
    }

    if (!content) return '';

    const $c = cheerio.load(content);
    $c('script, style, iframe, .ads, .adsbygoogle').remove();

    $c('br').replaceWith('\n');
    const textNodes: string[] = [];
    $c('p').each((_, el) => {
        const t = $c(el).text().trim();
        if (t) textNodes.push(t);
    });

    if (textNodes.length > 0) return textNodes.join('\n\n');
    $c('div, section, article, li').append('\n\n');
    return $c.root().text().trim();
}

export async function importSavedNovelToLibrary(novelId: string, userId: string): Promise<boolean> {
    const novel = await loadScrapeJob(novelId);
    if (!novel) return false;
    return createBookFromNovel(novelId, novel.allChapters, userId);
}

async function createBookFromNovel(novelId: string, chapters: any[], userId: string): Promise<boolean> {
    try {
        const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { title: true, sourceLink: true, description: true, imageLink: true } });
        if (!novel) return false;

        const urlObj = new URL(novel.sourceLink);
        const hostSuffix = urlObj.hostname.replace('www.', '');
        const bookTitle = `${novel.title} - ${hostSuffix}`;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.email) throw new Error('Scraper user not found');
        const existingBook = await prisma.book.findFirst({ where: { title: bookTitle, userName: user.email } });

        const book = existingBook || await prisma.book.create({
            data: {
                title: bookTitle,
                description: novel.description || '',
                cover: novel.imageLink || '',
                userName: user.email,
            }
        });

        const existingChapters = await prisma.chapter.findMany({
            where: { bookId: book.id }, select: { title: true, order: true },
        });
        const existingKeys = new Set(existingChapters.map(c => c.order + ':' + c.title));
        let inserted = 0;
        // Read and write bounded batches; keep existing library edits on retries.
        for (let start = 0; start < chapters.length; start += 50) {
            const metadata = chapters.slice(start, start + 50);
            const missing = metadata.filter((c, offset) => isSavedChapter(c) && !existingKeys.has((start + offset + 1) + ':' + c.title));
            if (!missing.length) continue;
            const batch = missing.some(c => !c.content)
                ? await readSavedChapterBatch(novelId, start, metadata.length) : metadata;
            const data = batch.flatMap((c, offset) => {
                const order = start + offset + 1;
                if (c.status !== 'done' || !c.content || existingKeys.has(order + ':' + c.title)) return [];
                return [{ bookId: book.id, title: c.title,
                    content: chapterParagraphBlocks(c.content), order }];
            });
            if (data.length !== missing.length) throw new Error('Saved chapter text was missing during library import');
            if (data.length) {
                await prisma.chapter.createMany({ data });
                for (const chapter of data) existingKeys.add(chapter.order + ':' + chapter.title);
                inserted += data.length;
                log('INFO', 'Book', 'Library batch saved', { bookId: book.id, inserted, throughChapter: start + metadata.length, total: chapters.length });
            }
        }

        log('SUCCESS', 'Book', `📚 Book created successfully`, {
            bookTitle,
            bookId: book.id,
            chaptersInserted: inserted
        });

        return true;
    } catch (e: any) {
        log('ERROR', 'Book', `Failed to create book`, { novelId, error: e.message });
        return false;
    }
}
