const fetch = require('node-fetch') || globalThis.fetch;
const cheerio = require('cheerio');

fetch('https://novelfull.net/nanomancer-reborn-ive-become-a-snow-girl.html', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}).then(r => r.text()).then(html => {
    const $ = cheerio.load(html);

    const h3Titles = [];
    $('h3.title').each((i, el) => {
        h3Titles.push($(el).text().trim());
    });
    console.log('All h3.title texts:', h3Titles);

    const pureTitle = $('.desc > h3.title').text().trim() || $('.books > .info > h3.title').text().trim();
    console.log('Targeted title:', pureTitle);
}).catch(console.error);
