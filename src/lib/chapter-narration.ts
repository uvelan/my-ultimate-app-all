export function cleanNarrationText(text: string): string {
    return text.replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[.*?\]\(.*?\)/g, ' ')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/[#*~_>]/g, '')
        .replace(/\s+/g, ' ').trim();
}

function normalizedHeading(text: string): string {
    return text.normalize('NFKC').toLowerCase()
        .replace(new RegExp('[\\p{P}\\p{Z}\\s]+', 'gu'), ' ').trim();
}

// The body has already been cleaned and checked for empty narration. Keep the
// stored title out of grammar correction so it is announced exactly as named.
export function prependChapterTitle(body: string, title?: string | null): string {
    const heading = cleanNarrationText(title || '');
    if (!heading) return body;
    const normalizedTitle = normalizedHeading(heading);
    const normalizedBody = normalizedHeading(body);
    if (!normalizedTitle || normalizedBody === normalizedTitle
        || normalizedBody.startsWith(normalizedTitle + ' ')) return body;
    const pause = /[.!?\u2026\u3002\uff01\uff1f:]$/.test(heading) ? '' : '.';
    return `${heading}${pause} ${body}`;
}

export function chapterNarrationIdentity(chapter: { title?: string | null; content: unknown }) {
    // Old body-only cache keys must not serve audio that omits the title.
    return { narrationVersion: 2, title: chapter.title || '', content: chapter.content };
}

// Keep reader paragraph indices unchanged for highlighting and saved progress.
// Announce the title only at the first spoken paragraph, not on mid-chapter resume.
export function readerParagraphNarration(paragraphs: string[], index: number, title?: string | null): string {
    const paragraphText = (text: string) => text.replace(/^#+\s+/g, '');
    const body = paragraphText(paragraphs[index] || '');
    if (!body.trim()) return '';
    const firstSpoken = paragraphs.findIndex(text => paragraphText(text).trim().length > 0);
    return index === firstSpoken ? prependChapterTitle(body, title) : body;
}
