const fetch = require('node-fetch') || globalThis.fetch;

async function test() {
    console.log("Testing scrape link...");
    try {
        const res = await fetch("http://localhost:3000/api/novelscraper/scrape-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                siteId: "69a8158965cd4de40b770b65",
                sourceUrl: "https://novelfull.net/nanomancer-reborn-ive-become-a-snow-girl.html"
            })
        });
        const text = await res.text();
        console.log(res.status);
        console.log(text);
    } catch (e) {
        console.log("Error:", e);
    }
}
test();
