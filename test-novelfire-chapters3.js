const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('novelfire.html', 'utf8');
const $ = cheerio.load(html);

const allLinks = $('a').map((i, el) => $(el).attr('href')).get();
const chapterLikeLinks = allLinks.filter(l => l && (l.includes('chapter-') || l.includes('/chapter/')));
console.log(`Found ${chapterLikeLinks.length} links looking like chapters overall.`);
console.dir(chapterLikeLinks);

// Let's also check if there's an ajax call for chapters.
console.log("Looking for ajax regarding chapters...");
const scripts = $('script').map((i, el) => $(el).html()).get();
scripts.forEach(s => {
    if (s && s.toLowerCase().includes('ajax') && s.toLowerCase().includes('chapter')) {
        console.log("--\n", s.substring(0, 500));
    }
});

// Let's look at ul/li inside something that looks like chapters
console.log("Ul/li links:");
$('.list-chapter li a, .chapter-list li a, #list-chapter li a').each((i, el) => {
    console.log($(el).attr('href'));
});

// Let's dump all classes of <ul> elements
console.log("UL classes:");
$('ul').each((i, el) => {
    console.log($(el).attr('class'));
});
