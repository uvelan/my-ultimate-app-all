const fs = require('fs');

async function main() {
    const url = 'https://novelfire.net/book/the-legendary-mechanic';
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        }
    });
    const html = await res.text();
    fs.writeFileSync('novelfire.html', html);
    console.log('done');
}
main();
