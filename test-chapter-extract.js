const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function testNovelFullChapter() {
    const url = 'https://novelfull.com/the-legendary-mechanic/chapter-1.html';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    const content = $('#chapter-content').text().trim() || $('.chapter-c').text().trim();
    console.log("Content length:", content.length);
    console.log("Preview:", content.substring(0, 150));

    // Test NovelFire as well
    const url2 = 'https://novelfire.net/book/the-legendary-mechanic/chapter-1';
    const res2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html2 = await res2.text();
    const $2 = cheerio.load(html2);

    const content2 = $2('#chapter-content').text().trim() || $2('.chapter-content').text().trim() || $2('.content').text().trim();
    console.log("NF Content length:", content2.length);
    console.log("NF Preview:", content2.substring(0, 150));
}

testNovelFullChapter();
