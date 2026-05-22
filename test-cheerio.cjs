const cheerio = require('cheerio');

const html = `
<html>
  <body>
    <div>This is paragraph 1.</div>
    <div>This is paragraph 2.</div>
    <div>This is <span>inline</span> text.</div>
    No tags text.
  </body>
</html>
`;

const $ = cheerio.load(html);

$('div, h1, h2, h3, h4, h5, h6, li, blockquote').append('\n');
$('br').replaceWith('\n');

const text = $.root().text().trim();
const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
console.log('Fallback lines:', lines);
