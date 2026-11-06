import { cleanNarrationText } from './chapter-narration';
import { validNarrationSync } from './narration-sync';

/** Match actual prose; printed numbers and EPUB spine indexes may differ. */
export function driveBody(text: string, title: string): string {
    const body = cleanNarrationText(text), heading = cleanNarrationText(title);
    return heading && (body === heading || body.startsWith(heading + ' ') || body.startsWith(heading + '. '))
        ? body.slice(heading.length).replace(/^[ .:]+/, '') : body;
}
function comparisonText(value: string): string {
    return cleanNarrationText(value).normalize('NFKC').toLowerCase()
        .replace(/[\u00ad\u200b\ufeff'‘’ʼ]/g, '')
        .replace(new RegExp('[\\p{P}\\p{Z}\\s]+', 'gu'), ' ').trim();
}

function comparisonBody(value: string, title: string): string {
    const text = comparisonText(value), heading = comparisonText(title);
    if (!heading) return text;
    if (text === heading) return '';
    return text.startsWith(heading + ' ') ? text.slice(heading.length + 1) : text;
}

/** Compare ordered prose while allowing cosmetic differences between EPUB editions. */
export function driveTextMatches(actual: string, actualTitle: string, expected: string, expectedTitle: string): boolean {
    const body = comparisonBody(expected, expectedTitle);
    return !!body && comparisonBody(actual, actualTitle) === body;
}

export function driveManifestMatches(manifest: any, paragraphs: string[], title: string): boolean {
    if (!validNarrationSync(manifest?.sync) || manifest.format !== 'wav' || manifest.model !== 'kokoro-v1.0'
        || manifest.sampleRate !== 24000 || !['af_bella', 'af_heart'].includes(manifest.voice)) return false;
    return driveTextMatches(manifest.sync.paragraphs.join(' '), manifest.sync.title, paragraphs.join(' '), title);
}
export function driveChapterNumber(title: string): number | null {
    const match = /\bchapter\s*(\d+)\b/i.exec(title.normalize('NFKC'));
    return match ? Number(match[1]) : null;
}
export function driveCandidates(recordings: any[], title: string, index: number): any[] {
    const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
    const number = driveChapterNumber(title);
    const named = recordings.filter(record => normalize(record.title || '') === normalize(title)
        || (number !== null && driveChapterNumber(record.title || '') === number));
    return named.length ? named : recordings.filter(record => record.chapterIndex === index
        && (number === null || driveChapterNumber(record.title || '') === null));
}
export function driveRecordings(catalog: any): any[] {
    if (catalog?.schema !== 'ultimate-drive-audio' || catalog.schemaVersion !== 1
        || !/^epub-[a-f0-9]{64}$/.test(catalog.bookId) || !Array.isArray(catalog.chapters)
        || !catalog.recordings || typeof catalog.recordings !== 'object') throw new Error('Unsupported Drive audio package.');
    return Object.entries(catalog.recordings).map(([identity, entry]: [string, any]) => {
        if (!/^[a-f0-9]{64}$/.test(identity) || entry.identity !== identity
            || entry.audioFile !== `chapters/${identity}.${entry.format}` || entry.manifestFile !== `chapters/${identity}.json`)
            throw new Error('Invalid chapter paths in Drive package.');
        return entry;
    }).filter(entry => entry.format === 'wav');
}
