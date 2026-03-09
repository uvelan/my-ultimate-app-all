import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { siteId, sourceUrl } = body;

        if (!siteId || !sourceUrl) {
            return NextResponse.json({ error: 'siteId and sourceUrl are required' }, { status: 400 });
        }

        // Fetch source configuration
        const sourceSite = await prisma.sourceWebsite.findUnique({ where: { id: siteId } });
        if (!sourceSite) {
            return NextResponse.json({ error: 'Source website not found' }, { status: 404 });
        }

        // Validate Hostname
        const urlObj = new URL(sourceUrl);
        if (!urlObj.hostname.includes(sourceSite.url) && !sourceSite.url.includes(urlObj.hostname.replace('www.', ''))) {
            return NextResponse.json({ error: 'URL hostname does not match the chosen Source Website' }, { status: 400 });
        }

        // Fetch the HTML
        const response = await fetch(sourceUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch URL. Status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Parse tags logic
        const tags = (sourceSite.tagsToExtract as Record<string, string>) || {};

        // Variables for extracted data
        let title = '';
        let description = '';
        let imageLink = '';
        let base64Image = '';

        // 1. Try DB-configured tags first
        if (tags.title && $(tags.title).length > 0) {
            title = $(tags.title).first().text().trim();
        }
        if (tags.description && $(tags.description).length > 0) {
            description = $(tags.description).text().trim();
        }
        if (tags.image && $(tags.image).length > 0) {
            imageLink = $(tags.image).first().attr('src') || '';
        }

        // 2. Try site-specific hardcoded logic
        if (urlObj.hostname.includes('novelfull')) {
            if (!title) title = $('.desc > h3.title').first().text().trim() || $('.desc h3.title').first().text().trim() || $('h3.title').first().text().trim();
            if (!description) description = $('.desc-text').text().trim();
            if (!imageLink) imageLink = $('.info-holder .book img').attr('src') || $('.info-holder img').first().attr('src') || '';
        } else if (urlObj.hostname.includes('novelfire')) {
            if (!title) title = $('.novel-info .novel-title').first().text().trim() || $('h1.novel-title').first().text().trim();
            if (!description) description = $('.summary .content').text().trim() || $('.description').text().trim();
            if (!imageLink) imageLink = $('.cover img').attr('src') || $('.novel-cover img').first().attr('src') || '';
        }

        // 3. Fallback heuristics for Title
        if (!title) {
            title = $('h1.novel-title').first().text().trim() ||
                $('h1[itemprop="name"]').first().text().trim() ||
                $('h1').first().text().trim() ||
                $('h3.title').first().text().trim() ||
                $('.novel-title').first().text().trim() ||
                $('.post-title').first().text().trim() ||
                $('.book-title').first().text().trim() ||
                $('title').text().trim().split('-')[0].trim();
        }
        if (!title) title = 'Unknown Novel';

        // 4. Fallback heuristics for Description
        if (!description) {
            description = $('.desc-text, .description, [itemprop="description"], .summary').text().trim() || '';
        }

        // 5. Fallback heuristics for Image
        if (!imageLink) {
            imageLink = $('.info-holder img, .book-img img, .novel-cover img, [itemprop="image"]').first().attr('src') || '';
        }

        if (imageLink) {
            // Resolve absolute URL
            if (imageLink.startsWith('//')) {
                imageLink = `https:${imageLink}`;
            } else if (imageLink.startsWith('/')) {
                imageLink = `${urlObj.origin}${imageLink}`;
            } else if (!imageLink.startsWith('http')) {
                imageLink = `${urlObj.origin}/${imageLink}`;
            }

            try {
                const imgRes = await fetch(imageLink);
                if (imgRes.ok) {
                    const arrayBuffer = await imgRes.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                    base64Image = `data:${contentType};base64,${buffer.toString('base64')}`;
                }
            } catch (err) {
                console.error("Failed to download image: ", err);
            }
        }

        // 4. Chapter Links
        const chapters: { title: string, url: string, status: string }[] = [];
        const chapterSelector = tags.chapters || '#list-chapter a, .chapter-list a, .list-chapter a, ul.list-chapter li a';

        // NovelFull and NovelFire specific chapters fetch
        if (urlObj.hostname.includes('novelfull')) {
            const novelIdMatch = html.match(/novelId\s*[:=]\s*['"]?(\d+)['"]?/i) || html.match(/data-novel-id=['"]?(\d+)['"]?/i);
            if (novelIdMatch && novelIdMatch[1]) {
                try {
                    const ajaxRes = await fetch(`${urlObj.origin}/ajax-chapter-option?novelId=${novelIdMatch[1]}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (ajaxRes.ok) {
                        const ajaxHtml = await ajaxRes.text();
                        const $ajax = cheerio.load(ajaxHtml);
                        $ajax('select option').each((_, el) => {
                            let href = $ajax(el).attr('value');
                            let text = $ajax(el).text().trim();
                            if (href) {
                                if (href.startsWith('//')) href = `https:${href}`;
                                else if (href.startsWith('/')) href = `${urlObj.origin}${href}`;
                                else if (!href.startsWith('http')) href = `${urlObj.origin}/${href}`;

                                chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: href, status: 'pending' });
                            }
                        });
                    }
                } catch (e) {
                    console.error("NovelFull AJAX fetch failed:", e);
                }
            }
        } else if (urlObj.hostname.includes('novelfire')) {
            const slugMatch = urlObj.pathname.match(/\/book\/([^\/]+)/);
            if (slugMatch && slugMatch[1]) {
                const slug = slugMatch[1];
                let page = 1;
                let hasMore = true;
                while (hasMore) {
                    try {
                        const chaptersRes = await fetch(`${urlObj.origin}/book/${slug}/chapters?page=${page}`, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        if (chaptersRes.ok) {
                            const chaptersHtml = await chaptersRes.text();
                            const $c = cheerio.load(chaptersHtml);
                            const chapterLinks = $c('#list-chapter a, .chapter-list a, ul.list-chapter li a');

                            if (chapterLinks.length === 0) {
                                hasMore = false;
                                break;
                            }

                            chapterLinks.each((_, el) => {
                                let href = $c(el).attr('href');
                                let text = $c(el).text().trim();
                                if (href) {
                                    if (href.startsWith('//')) href = `https:${href}`;
                                    else if (href.startsWith('/')) href = `${urlObj.origin}${href}`;
                                    else if (!href.startsWith('http')) href = `${urlObj.origin}/${href}`;

                                    if (!chapters.find(c => c.url === href)) {
                                        chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: href, status: 'pending' });
                                    }
                                }
                            });

                            // Check if there is a link for the next page
                            const nextLink = $c(`a[href*="page=${page + 1}"]`);
                            if (nextLink.length === 0) {
                                hasMore = false;
                            } else {
                                page++;
                            }
                        } else {
                            hasMore = false;
                        }
                    } catch (e) {
                        console.error(`NovelFire chapter fetch failed for page ${page}:`, e);
                        hasMore = false;
                    }
                }
            }
        }

        // Generic fallback if AJAX didn't work or for other sites
        if (chapters.length === 0 && $(chapterSelector).length > 0) {
            $(chapterSelector).each((_, el) => {
                let href = $(el).attr('href');
                let text = $(el).text().trim();
                if (!text) text = $(el).attr('title') || '';
                if (href) {
                    if (href.startsWith('//')) href = `https:${href}`;
                    else if (href.startsWith('/')) href = `${urlObj.origin}${href}`;
                    else if (!href.startsWith('http')) href = `${urlObj.origin}/${href}`;

                    // avoid duplicating same chapter URL if a site has multiple links per chapter
                    if (!chapters.find(c => c.url === href)) {
                        chapters.push({ title: text || `Chapter ${chapters.length + 1}`, url: href, status: 'pending' });
                    }
                }
            });
        }

        // Upsert to DB as we might be re-scraping a URL
        const novel = await prisma.novel.upsert({
            where: { sourceLink: sourceUrl },
            update: {
                title,
                description,
                imageLink: base64Image || undefined,
                allChapters: chapters.length > 0 ? JSON.parse(JSON.stringify(chapters)) : undefined,
                status: 'PENDING',
                wordReplacementSetting: sourceSite.wordReplacementSetting
            },
            create: {
                title,
                sourceLink: sourceUrl,
                sourceWebsiteId: siteId,
                description,
                imageLink: base64Image || undefined,
                allChapters: chapters.length > 0 ? JSON.parse(JSON.stringify(chapters)) : [],
                status: 'PENDING',
                wordReplacementSetting: sourceSite.wordReplacementSetting
            }
        });

        return NextResponse.json(novel, { status: 201 });

    } catch (error: any) {
        console.error("Scrape Error:", error);
        return NextResponse.json({ error: error.message || 'Scrape link failed' }, { status: 500 });
    }
}
