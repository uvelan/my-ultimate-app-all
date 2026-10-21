import { verifyAuth } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { scraperSourceUrl } from '@/lib/scraper-url';
import { fetchScraperResource } from '@/lib/scraper-fetch';

export async function POST(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { siteId, query } = body;

        if (!siteId || !query) {
            return NextResponse.json({ error: 'siteId and query are required' }, { status: 400 });
        }

        // Fetch source configuration
        const sourceSite = await prisma.sourceWebsite.findUnique({ where: { id: siteId } });
        if (!sourceSite) {
            return NextResponse.json({ error: 'Source website not found' }, { status: 404 });
        }

        const urlObj = scraperSourceUrl(sourceSite.url);
        let searchUrl = '';

        // Determine a basic search strategy based on known sites, or use a generic one
        if (urlObj.hostname.includes('royalroad')) {
            searchUrl = `${urlObj.origin}/fictions/search?title=${encodeURIComponent(query)}`;
        } else if (urlObj.hostname.includes('novelupdates')) {
            searchUrl = `${urlObj.origin}/?s=${encodeURIComponent(query)}&post_type=novel`;
        } else if (urlObj.hostname.includes('wuxiaworld')) {
            searchUrl = `${urlObj.origin}/search?query=${encodeURIComponent(query)}`;
        } else if (urlObj.hostname.includes('novelfull')) {
            searchUrl = `${urlObj.origin}/search?keyword=${encodeURIComponent(query.trim())}`;
        } else if ((urlObj.hostname.includes('novelfire') || /^(www\.)?freewebnovel\.com$/i.test(urlObj.hostname))) {
            searchUrl = `${urlObj.origin}/search?keyword=${encodeURIComponent(query)}`;
        } else {
            // Generic fallback WordPress-style search
            searchUrl = `${urlObj.origin}/?s=${encodeURIComponent(query)}`;
        }

        // Fetch the HTML
        const response = await fetchScraperResource(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            }
        });

        if (!response.ok) {
            return NextResponse.json({ error: response.status === 403
                ? 'The source blocked search (HTTP 403). Start FlareSolverr or complete browser verification, then retry.'
                : `Search website returned HTTP ${response.status}` }, { status: 502 });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Attempt to generically extract search results
        const results: { title: string, url: string, image?: string }[] = [];
        if (urlObj.hostname.includes('novelfull') || /^(www\.)?freewebnovel\.com$/i.test(urlObj.hostname)) {
            // Both domains place recommendations outside these result containers.
            $('h3.truyen-title a, .rank-list .li .tit a').each((_, el) => {
                const link = $(el);
                const href = link.attr('href');
                if (!href) return;
                const url = new URL(href, searchUrl);
                if (url.origin !== urlObj.origin) return;
                if (/freewebnovel\.com$/i.test(urlObj.hostname) && !/^\/novel\/[^/]+$/.test(url.pathname)) return;
                const title = link.attr('title') || link.text().trim();
                const image = link.closest('.row, .li').find('img').first().attr('src');
                if (title && !results.some(r => r.url === url.href)) {
                    results.push({ title, url: url.href, image: image ? new URL(image, searchUrl).href : undefined });
                }
            });
            return NextResponse.json({ results: results.slice(0, 10) });
        }

        // We check common selectors for search result items
        // This is a naive heuristic that attempts to find links resembling novel containers
        let searchItems = $('.search-result, .search-item, .fiction-list-item, article, .post');
        if (searchItems.length === 0) {
            // fallback: just grab the first 10 large links that aren't navigation
            searchItems = $('a').filter((_, el) => {
                const text = $(el).text().trim();
                return text.length > 5 && ($(el).html() || '').includes('<img'); // Must have image and text
            });

            if (searchItems.length === 0) {
                // Another fallback: just grab any A tags that have images inside
                searchItems = $('a:has(img)');
            }
        }

        searchItems.each((_, el) => {
            // Finding the main link
            let itemLink = $(el).is('a') ? $(el) : $(el).find('a').first();
            let href = itemLink.attr('href');
            if (!href) return;

            // Resolve absolute
            if (href.startsWith('//')) href = `https:${href}`;
            else if (href.startsWith('/')) href = `${urlObj.origin}${href}`;
            else if (!href.startsWith('http')) href = `${urlObj.origin}/${href}`;

            // Finding title
            let title = itemLink.attr('title') || itemLink.text().trim() || $(el).find('h2, h3, .title').first().text().trim();

            // Finding image
            let img = $(el).find('img').first().attr('src');
            if (img) {
                if (img.startsWith('//')) img = `https:${img}`;
                else if (img.startsWith('/')) img = `${urlObj.origin}${img}`;
                else if (!img.startsWith('http')) img = `${urlObj.origin}/${img}`;
            }

            if (title && href && results.filter(r => r.url === href).length === 0) {
                results.push({ title, url: href, image: img });
            }
        });

        // Slice to max 10 results
        return NextResponse.json({ results: results.slice(0, 10) });

    } catch (error: any) {
        console.error("Search API Error:", error);
        return NextResponse.json({ error: error.message || 'Search failed' }, { status: error.status === 502 ? 502 : 500 });
    }
}
