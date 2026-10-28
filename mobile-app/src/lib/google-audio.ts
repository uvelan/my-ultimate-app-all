import { chapterContentParagraphs } from './chapter-content';
import { cleanNarrationText, prependChapterTitle } from './chapter-narration';
import { assertAudioActive, type NativeAudioIdentity } from './listen-audio';
import type { NarrationSync } from './narration-sync';
export function googleAudioChunks(text: string): string[] {
    const chunks: string[] = []; let rest = text.trim();
    while (rest) {
        let end = Math.min(200, rest.length);
        if (end < rest.length) {
            const boundary = rest.lastIndexOf(' ', end); if (boundary > 80) end = boundary;
            if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
        }
        const chunk = rest.slice(0, end).trim(); if (chunk) chunks.push(chunk); rest = rest.slice(end).trimStart();
    }
    return chunks;
}
export function googleAudioUrl(text: string, voice: string): string {
    if (!text || text.length > 200 || !/^en(?:-(?:US|GB|AU|IN|NG))?$/.test(voice)) throw new Error('Invalid Google narration segment.');
    return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + encodeURIComponent(voice)
        + '&q=' + encodeURIComponent(text) + '&total=1&idx=0&textlen=' + text.length + '&ttsspeed=1&prev=input';
}
function duration(bytes: Uint8Array): number | null {
    let offset = 0, limit = bytes.length, seconds = 0;
    if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
        if (bytes.length < 10 || [6,7,8,9].some(i => bytes[i] & 128)) return null;
        offset = 10 + (bytes[6] << 21 | bytes[7] << 14 | bytes[8] << 7 | bytes[9]) + (bytes[5] & 16 ? 10 : 0);
    }
    if (limit >= 128 && bytes[limit - 128] === 84 && bytes[limit - 127] === 65 && bytes[limit - 126] === 71) limit -= 128;
    while (offset + 4 <= limit) {
        const a = bytes[offset], b = bytes[offset + 1], c = bytes[offset + 2];
        const version = b >> 3 & 3, bitrateIndex = c >> 4, rateIndex = c >> 2 & 3;
        if (a !== 255 || (b & 224) !== 224 || version === 1 || (b >> 1 & 3) !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) return null;
        const rates = version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
        const sampleRate = [44100,48000,32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
        const length = Math.floor((version === 3 ? 144000 : 72000) * rates[bitrateIndex] / sampleRate) + (c >> 1 & 1);
        if (offset + length > limit) return null;
        seconds += (version === 3 ? 1152 : 576) / sampleRate; offset += length;
    }
    return offset === limit && seconds > 0 ? seconds : null;
}
export async function generateNativeGoogleAudio(identity: NativeAudioIdentity, signal: AbortSignal, fetcher: typeof fetch = fetch) {
    if (identity.provider !== 'google' || identity.grammarModel !== 'OFF') throw new Error('Direct narration is only available for the original Google voice.');
    assertAudioActive(signal);
    const paragraphs = chapterContentParagraphs(identity.content).map(cleanNarrationText).filter(Boolean);
    if (!paragraphs.length) throw new Error('No chapter text is available to read.');
    const text = prependChapterTitle(cleanNarrationText(paragraphs.join(' ')), identity.title);
    const chunks = googleAudioChunks(text), results: Uint8Array[] = new Array(chunks.length);
    const controller = new AbortController(); const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true }); const timer = setTimeout(abort, 75_000); let next = 0;
    try {
        await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, async () => {
            while (next < chunks.length) {
                assertAudioActive(signal); assertAudioActive(controller.signal); const index = next++;
                // No app authorization headers are forwarded to Google.
                const response = await fetcher(googleAudioUrl(chunks[index], identity.voice), { signal: controller.signal });
                if (!response.ok) throw new Error('Google audio is unavailable (HTTP ' + response.status + '). Retry or select another voice.');
                if (!response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) throw new Error('Google did not return playable audio.');
                const bytes = new Uint8Array(await response.arrayBuffer()); if (!bytes.length) throw new Error('Google returned an empty audio segment.'); results[index] = bytes;
            }
        }));
        assertAudioActive(signal); assertAudioActive(controller.signal);
        const combined = new Uint8Array(results.reduce((sum, bytes) => sum + bytes.length, 0)); let offset = 0, elapsed = 0;
        const segments = results.map((bytes, index) => {
            combined.set(bytes, offset); offset += bytes.length; const start = elapsed; elapsed += duration(bytes) || 0;
            return { text: chunks[index], start, end: elapsed };
        });
        const sync: NarrationSync | undefined = segments.every(segment => segment.end > segment.start)
            ? { version: 1, title: cleanNarrationText(identity.title), paragraphs, segments } : undefined;
        return { data: combined.buffer, headers: { 'content-type': 'audio/mpeg', 'x-tts-provider': 'google', 'x-tts-voice': identity.voice, 'x-tts-cache': 'direct-google' } as Record<string, string>, sync };
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
}
