const fs = require('fs');
const html = fs.readFileSync('novelfire.html', 'utf8');
const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];

for (const script of scripts) {
    if (script.includes('post_id')) {
        console.log(script);
    }
}
