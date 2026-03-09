const fetch = require('node-fetch') || globalThis.fetch;
fetch('https://novelfull.net/nanomancer-reborn-ive-become-a-snow-girl.html', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
}).then(r => r.text()).then(html => {
    const novelIdMatch = html.match(/novelId\s*[:=]\s*['"]?(\d+)['"]?/i) || html.match(/data-novel-id=['"]?(\d+)['"]?/i);
    console.log('Novel ID:', novelIdMatch ? novelIdMatch[1] : 'Not found');

    // Also look for pagination
    const pagination = html.match(/<ul[^>]*class="[^"]*pagination[^"]*"[^>]*>(.*?)<\/ul>/i);
    console.log('Pagination HTML:', pagination ? pagination[1] : 'Not found');
}).catch(console.error);
