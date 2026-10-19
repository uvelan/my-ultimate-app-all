/** Portable playback cues. start/end are fractions of the decoded audio duration. */
export interface NarrationCue { text: string; start: number; end: number }
export interface NarrationSync {
    version: 1;
    title: string;
    paragraphs: string[];
    segments: { text: string; start: number; end: number }[];
}

function clean(text: string): string {
    return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
        .replace(/!\[.*?\]\(.*?\)/g, ' ').replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/<[^>]*>?/gm, ' ').replace(/[#*~_>]/g, '').replace(/\s+/g, ' ').trim();
}
function paragraphsFrom(content: unknown): string[] {
    if (typeof content === 'string') {
        try { const value = JSON.parse(content); if (Array.isArray(value)) content = value; } catch { /* Plain chapter text. */ }
    }
    return (Array.isArray(content) ? content : typeof content === 'string' ? [content] : [])
        .filter((value): value is string => typeof value === 'string').map(clean).filter(Boolean);
}
function weight(text: string): number {
    // Word length and punctuation approximate speaking time inside one measured
    // provider chunk. This is not a word-timestamp/forced-alignment service.
    const words = text.match(/\S+/g) || [];
    return Math.max(1, words.reduce((sum, word) => sum + 1 + Math.min(word.length, 16) / 12, 0)
        + (text.match(/[,;:]/g)?.length || 0) * 0.6 + (text.match(/[.!?\u3002\uff01\uff1f]/g)?.length || 0) * 1.5);
}
function passages(text: string): string[] {
    const sentences = clean(text).match(/[^.!?\u3002\uff01\uff1f]+(?:[.!?\u3002\uff01\uff1f]+["'\u201d\u2019)]*|$)/g) || [];
    const result: string[] = [];
    for (const sentence of sentences) {
        let rest = sentence.trim();
        while (rest.length > 180) {
            let cut = rest.lastIndexOf(' ', 180);
            if (cut < 65) cut = 180;
            result.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        if (rest) result.push(rest);
    }
    return result;
}
export function validNarrationSync(value: unknown): value is NarrationSync {
    if (!value || typeof value !== 'object') return false;
    const sync = value as NarrationSync;
    if (sync.version !== 1 || typeof sync.title !== 'string' || !Array.isArray(sync.paragraphs)
        || !sync.paragraphs.every(text => typeof text === 'string') || !Array.isArray(sync.segments)
        || !sync.segments.length || sync.segments.length > 10000) return false;
    let previous = 0;
    for (const segment of sync.segments) {
        if (!segment || typeof segment.text !== 'string' || !segment.text.trim()
            || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)
            || segment.start < previous - 0.001 || segment.start < 0 || segment.end <= segment.start) return false;
        previous = segment.end;
    }
    return true;
}
export function buildNarrationCues(content: unknown, title = '', sync?: NarrationSync | null): NarrationCue[] {
    let segments: NarrationSync['segments'];
    if (validNarrationSync(sync)) {
        segments = sync.segments;
    } else {
        const body = paragraphsFrom(content);
        if (!body.length) return [];
        const heading = clean(title);
        const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(new RegExp('[\\p{P}\\p{Z}\\s]+', 'gu'), ' ').trim();
        const normalizedHeading = normalize(heading), normalizedBody = normalize(body.join(' '));
        if (normalizedHeading && normalizedBody !== normalizedHeading && !normalizedBody.startsWith(normalizedHeading + ' ')) body.unshift(heading + (/[.!?\u2026\u3002\uff01\uff1f:]$/.test(heading) ? '' : '.'));
        // Separate paragraph entries preserve natural breaks in legacy narration.
        let cursor = 0;
        segments = body.map(text => { const start = cursor; cursor += weight(text); return { text, start, end: cursor }; });
    }
    const total = segments[segments.length - 1]?.end || 0;
    if (!(total > 0)) return [];
    const cues: NarrationCue[] = [];
    for (const segment of segments) {
        const parts = passages(segment.text);
        const weights = parts.map(weight), sum = weights.reduce((a, b) => a + b, 0);
        let cursor = segment.start;
        parts.forEach((text, index) => {
            const end = index === parts.length - 1 ? segment.end : cursor + (segment.end - segment.start) * weights[index] / sum;
            cues.push({ text, start: cursor / total, end: end / total });
            cursor = end;
        });
    }
    return cues;
}
export function activeNarrationCue(cues: NarrationCue[], currentSeconds: number, durationSeconds: number): number {
    if (!cues.length || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(currentSeconds)) return -1;
    const progress = Math.max(0, Math.min(1, currentSeconds / durationSeconds));
    let low = 0, high = cues.length - 1;
    while (low <= high) {
        const middle = (low + high) >>> 1;
        if (cues[middle].start <= progress) low = middle + 1; else high = middle - 1;
    }
    return Math.max(0, high);
}
