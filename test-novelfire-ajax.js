const fs = require('fs');

async function checkAjax(urlLabel, url) {
    console.log(`Testing ${urlLabel}:`, url);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
            const text = await res.text();
            console.log(`Success, length: ${text.length}. Content excerpt:`, text.substring(0, 150));
        } else {
            console.log(`Failed with status: ${res.status}`);
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

async function main() {
    await checkAjax('novelId', 'https://novelfire.net/ajax-chapter-option?novelId=1111');
    await checkAjax('novelId2', 'https://novelfire.net/ajax/chapter-archive?novelId=1111');
    await checkAjax('postId', 'https://novelfire.net/ajax/chapter-archive?post_id=1111');
    await checkAjax('ajax/chapter-option', 'https://novelfire.net/ajax/chapter-option?novelId=1111');
    await checkAjax('ajax/chapter-option post_id', 'https://novelfire.net/ajax/chapter-option?post_id=1111');
}
main();
