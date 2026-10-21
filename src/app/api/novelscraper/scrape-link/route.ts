export const runtime = 'nodejs';
import { verifyAuth } from '@/lib/auth-server';


import { after, NextRequest, NextResponse } from 'next/server';
import { discoverFreeWebNovelChapters } from '@/lib/freewebnovel';
import { matchesScraperSource } from '@/lib/scraper-url';
import { startNovelSyncAsync } from '@/lib/chapter-scraper';
import { fetchScraperResource } from '@/lib/scraper-fetch';
import { staleScrapeCutoff } from '@/lib/scraper-jobs';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';

const REQUEST_TIMEOUT_MS = 15000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
const MAX_PAGINATION_DEPTH = 50; // Guard against infinite scraping loops

const fetchWithTimeout = async (url: string, options: RequestInit = {}, retries = 2): Promise<Response> => {
    let lastErr: any;
    for (let tryCount = 0; tryCount <= retries; tryCount++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetchScraperResource(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.status === 403 || res.status === 429) {
                throw Object.assign(new Error(res.status === 403
                    ? 'The source website blocked the scraper (HTTP 403 / possible Cloudflare challenge). For NovelFull locally, use Open verification browser, complete verification, then retry.'
                    : 'The source website is rate limiting requests (HTTP 429). Please try again later.'),
                    { code: 'SOURCE_BLOCKED', retryable: false, status: 502 });
            }
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            return res;
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.retryable === false) throw err;
            lastErr = err;
            if (err.name !== 'AbortError' && tryCount < retries) {
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, tryCount))); // Exponential backoff
            }
        }
    }
    throw new Error(`Fetch failed after ${retries} retries. Reason: ${lastErr?.message || 'Timeout'}`);
};

export async function POST(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { siteId, fromChapter, toChapter } = body;
        const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';

        if (!siteId || !sourceUrl) {
            return NextResponse.json({ error: 'siteId and sourceUrl are required', code: 'MISSING_PARAMS', retryable: false }, { status: 400 });
        }

        const sourceSite = await prisma.sourceWebsite.findUnique({ where: { id: siteId } });
        if (!sourceSite) {
            return NextResponse.json({ error: 'Source website not found', code: 'INVALID_SITE_ID', retryable: false }, { status: 404 });
        }

        if (!matchesScraperSource(sourceUrl, sourceSite.url)) {
            return NextResponse.json({ error: 'URL hostname does not match the chosen Source Website', code: 'HOST_MISMATCH', retryable: false }, { status: 400 });
        }
        const urlObj = new URL(sourceUrl);
        const start = fromChapter === '' || fromChapter == null ? 1 : Number(fromChapter);
        const end = toChapter === '' || toChapter == null ? undefined : Number(toChapter);
        if (!Number.isInteger(start) || start < 1 || (end !== undefined && (!Number.isInteger(end) || end < start))) {
            return NextResponse.json({ error: 'Enter a valid chapter range', code: 'INVALID_RANGE', retryable: false }, { status: 400 });
        }
        const existing = await prisma.novel.findUnique({ where: { sourceLink: sourceUrl } });
        if (existing && ['SCRAPING', 'STOPPING', 'IMPORTING'].includes(existing.status) && existing.updatedAt >= staleScrapeCutoff()) {
            return NextResponse.json({ error: 'This novel is already being scraped' }, { status: 409 });
        }

        console.info(`[Scraper] Initializing scrape for: ${sourceUrl}`);
        const response = await fetchWithTimeout(sourceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        const html = await response.text();
        const $ = cheerio.load(html);
        const tags = (sourceSite.tagsToExtract as Record<string, string>) || {};

        let title = '';
        let description = '';
        let imageLink = '';
        let base64Image = '';

        try {
            if (tags.title && $(tags.title).length > 0) title = $(tags.title).first().text().trim();
            if (tags.description && $(tags.description).length > 0) description = $(tags.description).text().trim();
            if (tags.image && $(tags.image).length > 0) imageLink = $(tags.image).first().attr('src') || '';
        } catch (e) {
            console.warn("[Scraper] DB Selector extraction failed. Attempting heuristics.", e);
        }

        if (urlObj.hostname.includes('novelfull')) {
            if (!title) title = $('.desc > h3.title, .desc h3.title, h3.title').first().text().trim();
            if (!description) description = $('.desc-text').text().trim();
            if (!imageLink) imageLink = $('.info-holder .book img, .info-holder img').first().attr('src') || '';
        } else if (urlObj.hostname.includes('novelfire')) {
            if (!title) title = $('.novel-info .novel-title, h1.novel-title').first().text().trim();
            if (!description) description = $('.summary .content, .description').text().trim();
            if (!imageLink) imageLink = $('.cover img, .novel-cover img').first().attr('src') || '';
        }

        if (!title) title = $('h1.novel-title, h1[itemprop="name"], h1, h3.title, .novel-title, .post-title, .book-title').first().text().trim() || $('title').text().trim().split('-')[0].trim() || 'Unknown Novel';
        if (!description) description = $('.desc-text, .description, [itemprop="description"], .summary').text().trim() || '';
        if (!imageLink) imageLink = $('.info-holder img, .book-img img, .novel-cover img, [itemprop="image"]').first().attr('src') || '';

        if (imageLink) {
            try {
                const imgURLObj = new URL(imageLink, urlObj.origin);
                imageLink = imgURLObj.href;

                const imgRes = await fetchWithTimeout(imageLink, {}, 1); // Only retry image once
                const contentLength = imgRes.headers.get('content-length');
                
                if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
                    throw new Error('Image exceeds 5MB size limit.');
                }
                
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                if (!contentType.toLowerCase().startsWith('image/')) throw new Error('Cover URL did not return an image');
                base64Image = `data:${contentType};base64,${buffer.toString('base64')}`;
            } catch (err: any) {
                console.error(`[Scraper] Failed to download or convert image from ${imageLink}:`, err.message);
            }
        }

        const chapters: { title: string, url: string, status: string }[] = [];
        const chapterSelector = tags.chapters || '#list-chapter a, .chapter-list a, .list-chapter a, ul.list-chapter li a';

        if (/^(www\.)?freewebnovel\.com$/i.test(urlObj.hostname)) {
            chapters.push(...await discoverFreeWebNovelChapters(html, sourceUrl, url => fetchWithTimeout(url)));
        } else if (urlObj.hostname.includes('novelfull')) {
            const novelIdMatch = html.match(/(?:novelId|data-novel-id)\s*[:=]\s*['"]?(\d+)['"]?/i);
            if (novelIdMatch && novelIdMatch[1]) {
                try {
                    const ajaxRes = await fetchWithTimeout(`${urlObj.origin}/ajax-chapter-option?novelId=${novelIdMatch[1]}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const ajaxHtml = await ajaxRes.text();
                    const $ajax = cheerio.load(ajaxHtml);
                    $ajax('option').each((_, el) => {
                        const href = $ajax(el).attr('value');
                        const text = $ajax(el).text().trim();
                        if (href) {
                            const absHref = new URL(href, sourceUrl).href;
                            chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: absHref, status: 'pending' });
                        }
                    });
                } catch (e) {
                    console.error("NovelFull AJAX fetch logic failed:", e);
                }
            }
        } else if (urlObj.hostname.includes('novelfire')) {
            const slugMatch = urlObj.pathname.match(/\/book\/([^\/]+)/);
            if (slugMatch && slugMatch[1]) {
                const slug = slugMatch[1];
                let page = 1;
                let hasMore = true;
                const chapterSet = new Set<string>(); // Fast uniqueness checking
                
                while (hasMore && page <= MAX_PAGINATION_DEPTH) {
                    try {
                        const chaptersRes = await fetchWithTimeout(`${urlObj.origin}/book/${slug}/chapters?page=${page}`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        const chaptersHtml = await chaptersRes.text();
                        const $c = cheerio.load(chaptersHtml);
                        const chapterLinks = $c(chapterSelector);

                        if (chapterLinks.length === 0) break;

                        const previousCount = chapters.length;
                        chapterLinks.each((_, el) => {
                            const href = $c(el).attr('href');
                            const text = $c(el).find('.chapter-title').text().trim() || $c(el).attr('title') || $c(el).text().trim();
                            if (href) {
                                    const absHref = new URL(href, `${urlObj.origin}/book/${slug}/chapters?page=${page}`).href;
                                if (!chapterSet.has(absHref)) {
                                    chapterSet.add(absHref);
                                    chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: absHref, status: 'pending' });
                                }
                            }
                        });

                        const nextLink = $c(`a[href*="page=${page + 1}"]`);
                        if (chapters.length === previousCount || nextLink.length === 0) hasMore = false;
                        else page++;
                    } catch (e) {
                        console.error(`NovelFire chapter fetch failed for page ${page}. Breaking loop.`, e);
                        hasMore = false;
                    }
                }
            }
        }

        if (chapters.length === 0 && $(chapterSelector).length > 0) {
            const chapterSet = new Set<string>();
            $(chapterSelector).each((_, el) => {
                const href = $(el).attr('href');
                let text = $(el).text().trim() || $(el).attr('title') || '';
                if (href) {
                    const absHref = new URL(href, sourceUrl).href;
                    if (!chapterSet.has(absHref)) {
                        chapterSet.add(absHref);
                        chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: absHref, status: 'pending' });
                    }
                }
            });
        }

        console.info(`[Scraper] Successfully extracted ${chapters.length} chapters for ${title}.`);
        const selectedChapters = chapters.slice(start - 1, end);
        if (selectedChapters.length === 0) {
            return NextResponse.json({ error: chapters.length === 0
                ? 'No chapters found. Check the source chapter selector or whether the website blocks automated requests.'
                : 'No chapters found in the requested range.', code: 'NO_CHAPTERS', retryable: false }, { status: 422 });
        }
        const previousChapters = new Map((Array.isArray(existing?.allChapters) ? existing.allChapters : [])
            .filter((c: any) => c?.status === 'done' && c.content)
            .map((c: any) => [c.url, c]));
        const chaptersToSave = selectedChapters.map(c => previousChapters.get(c.url) || c);
        
        const novelData = {
             title,
             description,
             imageLink: base64Image || imageLink || undefined,
             allChapters: chaptersToSave,
             status: 'SCRAPING',
             wordReplacementSetting: sourceSite.wordReplacementSetting
        };

        const novel = await prisma.novel.upsert({
            where: { sourceLink: sourceUrl },
            update: novelData,
            create: {
                ...novelData,
                sourceLink: sourceUrl,
                sourceWebsiteId: siteId,
                allChapters: chaptersToSave,
            }
        });

        after(() => startNovelSyncAsync(novel.id, auth.user!.id));
        return NextResponse.json(novel, { status: 201 });

    } catch (error: any) {
        console.error("[Scraper] Catastrophic Error:", error);
        return NextResponse.json({ 
            error: error.message || 'Scrape link failed',
            code: error.code || 'INTERNAL_ERROR',
            retryable: error.retryable !== false
        }, { status: error.status === 502 ? 502 : 500 });
    }
}
