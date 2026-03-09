const html = require('fs').readFileSync('novelfire.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);
console.log('1.', $('.novel-info .cover img').attr('src'));
console.log('2.', $('.novel-cover img').attr('src'));
console.log('3.', $('.cover img').attr('src'));
console.log('4.', $('img').map((i, el) => $(el).attr('src')).get());
