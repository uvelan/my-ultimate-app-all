// Kept identical in src/lib and mobile-app/src/lib for both runtimes.
// Accept uploaded plain text and the rich-text blocks produced by the scraper.
export function chapterContentParagraphs(content: unknown): string[] {
    if (typeof content === 'string') {
        const text = content.trim();
        if (text.startsWith('[') || text.startsWith('{')) {
            try {
                const parsed: unknown = JSON.parse(text);
                if (parsed && typeof parsed === 'object') return chapterContentParagraphs(parsed);
            } catch { /* Ordinary text that starts with a bracket. */ }
        }
        return content.split(/\r?\n+/).map(value => value.trim()).filter(Boolean);
    }
    if (Array.isArray(content)) return content.flatMap(chapterContentParagraphs);
    if (!content || typeof content !== 'object') return [];
    const node = content as { text?: unknown; children?: unknown; content?: unknown; type?: unknown };
    if (typeof node.text === 'string') return chapterContentParagraphs(node.text);
    const children = Array.isArray(node.children) ? node.children : Array.isArray(node.content) ? node.content : null;
    if (!children) return [];
    // Text leaves are inline: joining them with newlines would split styled words.
    const inline = (value: unknown): string => {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object') return '';
        const child = value as typeof node;
        if (typeof child.text === 'string') return child.text;
        if (child.type === 'hardBreak') return '\n';
        const nested = Array.isArray(child.children) ? child.children : Array.isArray(child.content) ? child.content : [];
        return nested.map(inline).join('');
    };
    if (node.type === 'paragraph' || node.type === 'heading' || children.every(child => child && typeof child === 'object' && 'text' in child)) {
        return chapterContentParagraphs(children.map(inline).join(''));
    }
    return children.flatMap(chapterContentParagraphs);
}
