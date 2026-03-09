const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('novelfire.html', 'utf8');
const $ = cheerio.load(html);

console.log("Chapters possibilities:");
const postIdMatch = html.match(/post_id\s*=\s*['"]?(\d+)['"]?/i);
console.log("Post ID match:", postIdMatch ? postIdMatch[1] : null);

const chapterLinks = $('#list-chapter a, .chapter-list a, .list-chapter a, ul.list-chapter li a, .chapters a, #chapters a, ul.chapters li a').map((i, el) => $(el).attr('href')).get();
console.log(`Found ${chapterLinks.length} chapter links directly inside HTML.`);
if (chapterLinks.length > 0) {
    console.log(chapterLinks.slice(0, 5));
} else {
    // try to find where they might be dynamically fetched
    const chapterDivs = $('div').filter((i, el) => {
        const id = $(el).attr('id');
        const cls = $(el).attr('class');
        return (id && id.toLowerCase().includes('chapter')) || (cls && cls.toLowerCase().includes('chapter'));
    });
    console.log("Possible chapter containers:", chapterDivs.map((i, el) => `${$(el).attr('id') || ''} .${$(el).attr('class') || ''}`).get().filter(x => x.length > 2));
}

const allLinks = $('a').map((i, el) => $(el).attr('href')).get();
const chapterLikeLinks = allLinks.filter(l => l && (l.includes('chapter-') || l.includes('/chapter/')));
console.log(`Found ${chapterLikeLinks.length} links looking like chapters overall.`);

