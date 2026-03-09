const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('novelfire.html', 'utf8');
const $ = cheerio.load(html);

console.log("Image possibilities:");
$('img').each((i, el) => {
    console.log($(el).attr('src'), $(el).attr('data-src'), $(el).parent().attr('class'));
});

console.log("\nNovel ID possibilities:");
console.log("novelId match:", html.match(/novelId\s*[:=]\s*['"]?(\d+)['"]?/i));
console.log("data-novel-id match:", html.match(/data-novel-id=['"]?(\d+)['"]?/i));

console.log("\nChapter config possibilities:");
const scripts = $('script').map((i, el) => $(el).html()).get();
const configScript = scripts.find(s => s && s.includes('chapter'));
if (configScript) {
    console.log("Found script with 'chapter':", configScript.substring(0, 200) + '...');
}
