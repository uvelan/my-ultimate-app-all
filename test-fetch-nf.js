const fs = require('fs');

async function downloadNovelFull() {
    const url = 'https://novelfull.com/search?keyword=overgeared';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    fs.writeFileSync('novelfull-search.html', html);
    console.log("Downloaded NovelFull search HTML, length:", html.length);
}

downloadNovelFull();
