const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function testNovelFull() {
    const url = 'https://novelfull.com/search?keyword=overgeared';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    console.log("Looking for h3 title:", $('h3.novel-title').length);
    console.log("Looking for .row:", $('.row').length);
    console.log("Looking for .col-novel-main:", $('.col-novel-main').length);

    // Check if the results are in a list
    const items = $('.col-novel-main .list-novel .row');
    console.log("Items found via main selector:", items.length);

    if (items.length > 0) {
        items.each((i, el) => {
            const titleEl = $(el).find('h3.novel-title a').first();
            console.log("Result:", titleEl.text().trim(), titleEl.attr('href'));
        });
    } else {
        console.log("Let's look at all h3 elements with class novel-title:");
        $('h3.novel-title a').slice(0, 5).each((i, el) => {
            console.log("Found:", $(el).text(), $(el).attr('href'));
        });
    }
}

testNovelFull();
