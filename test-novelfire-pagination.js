const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
    const url = 'https://novelfire.net/book/the-legendary-mechanic/chapters';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    // pagination for chapters usually looks like:
    const pages = $('.pagination a, .page-numbers a, ul.pagination li a').map((i, el) => $(el).attr('href')).get();
    console.log("Found pagination links:", pages.length);
    if (pages.length > 0) {
        console.log(pages.slice(0, 5));
    } else {
        console.log("No pagination links found.");
    }

    // Is there a "load more" button?
    const btn = $('#load-more, .load-more, #btn-load-more');
    console.log("Load more button?", btn.length);

    // Is there a max page data attribute?
    const maxPage = $('[data-max-page], [data-total-page]');
    if (maxPage.length) {
        console.log("Max page attr present:", maxPage.length);
    }
}
main();
