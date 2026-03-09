const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function main() {
    const url = 'https://novelfire.net/book/the-legendary-mechanic/chapters';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    const links = $('#list-chapter a, .chapter-list a, ul.list-chapter li a, .chapters a, #chapters a, ul.chapter-list li a');
    console.log("Found links:", links.length);
    if (links.length > 0) {
        console.log("First 5 links:");
        links.slice(0, 5).each((i, el) => {
            console.log($(el).attr('href'), $(el).text().trim().substring(0, 30));
        });
    } else {
        console.log("No links found with standard selectors.");
        const allChapters = $('ul.chapter-list li a, .list-chapter li a, .chapter-list a, .list-chapter a, #chapter-list a');
        console.log("Other selectors?", allChapters.length);
        if (allChapters.length === 0) {
            console.log("Let's look at all ULs:");
            $('ul').each((i, el) => console.log($(el).attr('class')));

            console.log("\nLet's look at all A links containing 'chapter':");
            const allLinks = $('a').map((i, el) => $(el).attr('href')).get().filter(href => href && (href.includes('chapter-') || href.includes('/chapter/')));
            console.log(allLinks.length, allLinks.slice(0, 5));
        }
    }
}
main();
