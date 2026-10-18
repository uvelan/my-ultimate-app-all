const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/chapter-narration.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleObject = { exports: {} };
new vm.Script(source, { filename }).runInNewContext({ module: moduleObject, exports: moduleObject.exports });
const { readerParagraphNarration } = moduleObject.exports;

test('reader announces the title with the first paragraph without inserting progress entries', () => {
  const paragraphs = ['The village awoke.', 'Children gathered.'];
  assert.equal(readerParagraphNarration(paragraphs, 0, 'Chapter 1 - Dawn'), 'Chapter 1 - Dawn. The village awoke.');
  assert.equal(readerParagraphNarration(paragraphs, 1, 'Chapter 1 - Dawn'), 'Children gathered.');
  assert.deepEqual(paragraphs, ['The village awoke.', 'Children gathered.']);
});

test('reader skips blank and heading-marker-only paragraphs before announcing the title', () => {
  const paragraphs = ['', '   ', '## ', 'The first words.'];
  for (let index = 0; index < 3; index++) assert.equal(readerParagraphNarration(paragraphs, index, 'Dawn'), '');
  assert.equal(readerParagraphNarration(paragraphs, 3, 'Dawn'), 'Dawn. The first words.');
});

test('reader does not repeat a title already present as its first paragraph', () => {
  const paragraphs = ['## CHAPTER 1: Dawn', 'The village awoke.'];
  assert.equal(readerParagraphNarration(paragraphs, 0, 'Chapter 1 - Dawn'), 'CHAPTER 1: Dawn');
  assert.equal(readerParagraphNarration(paragraphs, 1, 'Chapter 1 - Dawn'), 'The village awoke.');
});

test('reader preserves later-paragraph resume and handles a fresh next chapter independently', () => {
  assert.equal(readerParagraphNarration(['Opening.', 'Resume here.'], 1, 'Chapter 1'), 'Resume here.');
  assert.equal(readerParagraphNarration(['New opening.'], 0, 'Chapter 2'), 'Chapter 2. New opening.');
  assert.equal(readerParagraphNarration(['Opening.'], 1, 'Chapter 1'), '');
});

test('reader cleans title markup and retains existing body behavior when title is missing', () => {
  assert.equal(readerParagraphNarration(['Opening.'], 0, '# **Chapter 3** <b>Dawn</b>'), 'Chapter 3 Dawn. Opening.');
  assert.equal(readerParagraphNarration(['## Opening.'], 0), 'Opening.');
});
