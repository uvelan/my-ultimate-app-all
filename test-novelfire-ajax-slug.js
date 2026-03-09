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
    await checkAjax('novelId=slug', 'https://novelfire.net/ajax-chapter-option?novelId=the-legendary-mechanic');
    await checkAjax('ajax/chapter-archive slug', 'https://novelfire.net/ajax/chapter-archive?novelId=the-legendary-mechanic');
    await checkAjax('ajax/chapter-archive post_id slug', 'https://novelfire.net/ajax/chapter-archive?post_id=the-legendary-mechanic');
    await checkAjax('ajax/chapter-option slug', 'https://novelfire.net/ajax/chapter-option?novelId=the-legendary-mechanic');

    console.log("\nWhat if we just fetch /book/slug/chapters or something?");
    await checkAjax('book/slug/chapters', 'https://novelfire.net/book/the-legendary-mechanic/chapters');

    // Check if there is a paginated chapter API
    await checkAjax('ajax/chapter-list', 'https://novelfire.net/ajax/chapter-list?novelId=1111');
}
main();
