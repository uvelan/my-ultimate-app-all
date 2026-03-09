const fs = require('fs');
const html = fs.readFileSync('novelfire.html', 'utf8');

// find any occurrences of "ajax" and print the 30 chars before and 100 after
const matches = [...html.matchAll(/.{0,30}ajax.{0,100}/gi)];
console.log("Ajax mentions:");
for (let m of matches) {
    console.log(m[0].replace(/\n/g, ' '));
}

// look for "chapter" in javascript
const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
for (let s of scripts) {
    if (s.includes('chapter')) {
        console.log("\nScript with chapter:\n");
        console.log(s);
    }
}
