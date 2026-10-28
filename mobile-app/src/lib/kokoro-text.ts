import { chapterContentParagraphs } from './chapter-content';
import { cleanNarrationText, prependChapterTitle } from './chapter-narration';

export const KOKORO_VOICES = { af_heart: 'Heart · female', af_bella: 'Bella · female' };
export const DEFAULT_CHUNK_TARGET = 1000;
export const MAX_KOKORO_CHUNK = 4000;
export function normalizeChunkTarget(value: unknown): number {
    const size = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isInteger(size) && size >= 200 && size <= 2000 ? size : DEFAULT_CHUNK_TARGET;
}
export function kokoroNarration(content: unknown, title: string, requestedTarget: unknown = DEFAULT_CHUNK_TARGET) {
    const target = normalizeChunkTarget(requestedTarget);
    const paragraphs = chapterContentParagraphs(content).map(cleanNarrationText).filter(Boolean);
    if (!paragraphs.length) throw new Error('This chapter has no text to narrate. Refresh the chapter in Reader first.');
    const body = paragraphs.join(' ');
    const opening = prependChapterTitle(body, title);
    const entries = opening === body ? paragraphs : [opening.slice(0, opening.length - body.length).trim(), ...paragraphs];
    const chunks: string[] = [];
    let buffered = '';
    const flush = () => { if (buffered) { chunks.push(buffered); buffered = ''; } };
    for (const paragraph of entries) {
        let rest = paragraph;
        while (rest) {
            // The target is soft: an ordinary paragraph stays whole. Only a
            // paragraph exceeding the native limit needs a continuation chunk.
            let end = Math.min(rest.length, MAX_KOKORO_CHUNK);
            if (end < rest.length) {
                const sentence = [...rest.slice(0, end + 1).matchAll(/[.!?]["'\u201d\u2019)]*\s+/g)]
                    .map(match => match.index! + match[0].length).filter(boundary => boundary <= MAX_KOKORO_CHUNK).pop();
                const word = rest.lastIndexOf(' ', end);
                if (sentence && sentence > end / 2) end = sentence;
                else if (word > end / 2) end = word;
                if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
            }
            const part = rest.slice(0, end).trim();
            if (part) {
                const length = buffered.length + (buffered ? 1 : 0) + part.length;
                if (length > MAX_KOKORO_CHUNK || (length > target && buffered.length >= target / 2)) flush();
                buffered = buffered ? buffered + ' ' + part : part;
                if (buffered.length >= target) flush();
            }
            rest = rest.slice(end).trimStart();
        }
    }
    flush();
    if (chunks.length > 10000) throw new Error('This chapter is too long for offline narration.');
    return { title, paragraphs, chunks };
}
