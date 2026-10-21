import * as cheerio from 'cheerio';

export async function discoverFreeWebNovelChapters(html: string, sourceUrl: string,
    fetchPage: (url: string) => Promise<Response>) {
    const $ = cheerio.load(html);
    const root = $('#indexListPage');
    const total = Number(root.attr('data-total-chapters'));
    if (!Number.isInteger(total) || total < 1) throw new Error('FreeWebNovel did not return a valid chapter list. Check the novel link or verification.');
    const input = new URL(sourceUrl);
    const canonical = new URL($('link[rel="canonical"]').attr('href') || sourceUrl, sourceUrl);
    if (canonical.origin !== input.origin) throw new Error('FreeWebNovel returned an unexpected novel URL');
    canonical.search = ''; canonical.hash = '';
    const chapters: { title: string; url: string; status: string }[] = [];
    const seen = new Set<string>();
    // The site caps pageSize at 200. Read every page, not just the first 40 links
    // or the latest-chapters/recommendations displayed outside #idData.
    const pages = Math.ceil(total / 200);
    for (let page = 1; page <= pages; page++) {
        const url = new URL(canonical);
        url.searchParams.set('page', String(page));
        url.searchParams.set('pageSize', '200');
        const doc = page === 1 && root.attr('data-current-page') === '1' && root.attr('data-page-size') === '200'
            ? $ : cheerio.load(await (await fetchPage(url.href)).text());
        if (Number(doc('#indexListPage').attr('data-current-page')) !== page) throw new Error(`FreeWebNovel chapter page ${page} did not load. Please retry.`);
        const before = chapters.length;
        doc('#idData a[href]').each((_, el) => {
            const link = doc(el);
            const chapter = new URL(link.attr('href')!, canonical);
            if (chapter.origin !== canonical.origin || !chapter.pathname.startsWith(canonical.pathname.replace(/\/$/, '') + '/chapter-') || seen.has(chapter.href)) return;
            seen.add(chapter.href);
            chapters.push({ title: link.attr('title') || link.text().trim(), url: chapter.href, status: 'pending' });
        });
        if (chapters.length - before !== Math.min(200, total - (page - 1) * 200)) {
            throw new Error(`FreeWebNovel returned an incomplete chapter list on page ${page}. Please retry.`);
        }
    }
    return chapters;
}
