const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('novelfire.html', 'utf8');
const $ = cheerio.load(html);

console.log("Chapters possibilities:");
console.log("Post ID match:", html.match(/post_id\s*=\s*['"]?(\d+)['"]?/i));

const chapterLinks = $('#list-chapter a, .chapter-list a, .list-chapter a, ul.list-chapter li a, .chapters a, #chapters a, ul.chapters li a').map((i, el) => $(el).attr('href')).get();
console.log(`Found ${chapterLinks.length} chapter links directly inside HTML.`);
if (chapterLinks.length > 0) {
    console.log(chapterLinks.slice(0, 5));
}
