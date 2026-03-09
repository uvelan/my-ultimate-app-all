const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function debugChapter() {
    const res = await fetch('https://novelfull.com/the-legendary-mechanic/chapter-1.html', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log("NF full status:", res.status);
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log("Title:", $('h1').text());
    console.log("Content len:", $('#chapter-content').text().length);
    console.log("Chapter div tags:", $('#chapter').attr('class') || '', $('#chapter-c').attr('class') || '', $('.chapter-c').length);

    console.log("------------------------");
    const res2 = await fetch('https://novelfire.net/book/the-legendary-mechanic/chapter-1', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log("NFire status:", res2.status);
    const html2 = await res2.text();
    const $2 = cheerio.load(html2);
    console.log("NFire Title:", $2('h1').text());
    console.log("NFire Content len:", $2('#chapter-content').text().length, $2('.chapter-content').text().length, $2('#novel-content').text().length, $2('article').text().length);
    if ($2('.chapter-content').length) console.log("Has .chapter-content element");
    if ($2('#novel-content').length) console.log("Has #novel-content");
    console.log("A few classes inside article:", $2('article div').map((i, el) => $2(el).attr('id') || $2(el).attr('class')).get().join(', '));
}

debugChapter();
