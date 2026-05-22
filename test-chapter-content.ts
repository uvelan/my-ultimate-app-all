import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

async function fetchChapterContent(url: string): Promise<string> {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const urlObj = new URL(url);

    let content = '';
    if (urlObj.hostname.includes('novelfull')) {
        content = $('#chapter-content').html() || $('.chapter-c').html() || '';
    } else if (urlObj.hostname.includes('novelfire')) {
        content = $('#chapter-container .content').html() || $('.chapter-content').html() || '';
    } else {
        content = $('#chapter-content').html() || $('.chapter-content').html() || $('.reading-content').html() || '';
    }

    if (!content) return '[NO CONTENT FOUND]';

    const $c = cheerio.load(content);
    $c('script, style, iframe, .ads, .adsbygoogle').remove();

    const textNodes: string[] = [];
    $c('p').each((_, el) => {
        const t = $c(el).text().trim();
        if (t && !textNodes.includes(t)) textNodes.push(t);
    });

    return textNodes.length > 0 ? textNodes.join('\n\n') : $c.root().text().trim();
}

async function run() {
    const novel = await prisma.novel.findFirst({ where: { title: "The King's Avatar" } });
    if (!novel) { console.log("Novel not found!"); return; }

    const chapters = novel.allChapters as any[];
    const testChapters = chapters.slice(0, 3); // Test first 3 chapters

    console.log(`\n== Novel: ${novel.title} ==`);
    console.log(`Total chapters in DB: ${chapters.length}`);
    console.log(`Status: ${novel.status}`);
    console.log(`\n-- Testing content fetch for first 3 chapters --\n`);

    for (const chap of testChapters) {
        console.log(`\n[Chapter] ${chap.title}`);
        console.log(`[URL]     ${chap.url}`);
        console.log(`[DB Status] ${chap.status}`);
        try {
            const content = await fetchChapterContent(chap.url);
            const preview = content.slice(0, 400);
            console.log(`[Content Preview (first 400 chars)]:\n${preview}...`);
            console.log(`[Total Content Length]: ${content.length} chars`);
        } catch (e: any) {
            console.log(`[ERROR]: ${e.message}`);
        }
        console.log('---');
    }
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
