// Scrapers keep blank lines between source paragraphs. Preserve those boundaries
// when converting plain chapter text into library blocks or cached reader text.
export function chapterParagraphs(text: string): string[] {
    return text.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n+/)
        .map(paragraph => paragraph.trim()).filter(Boolean);
}

export function chapterParagraphBlocks(text: string) {
    return chapterParagraphs(text).map(paragraph => ({
        type: 'paragraph', children: [{ text: paragraph }],
    }));
}
