import { readerSpeechText, readerTitlePrefix } from './listen-audio';
import type { SpeechQueueItem } from '../services/tts.service';

export interface PreparedReaderChapter {
    chapterId: string; title: string; rawContent: string | string[];
    sentences: { text: string; paraIdx: number }[];
}
export function prepareReaderChapter(chapterId: string, title: string, rawContent: string | string[],
    rules: { search: string; replace?: string; isRegex?: boolean }[], enabled: boolean): PreparedReaderChapter {
    const paragraphs = (Array.isArray(rawContent) ? rawContent : [rawContent]).flatMap(value => String(value).split(/\n+/))
        .map(value => {
            let result = value.trim();
            if (enabled) for (const rule of rules) {
                try { result = rule.isRegex ? result.replace(new RegExp(rule.search, 'g'), rule.replace || '') : result.split(rule.search).join(rule.replace || ''); }
                catch { /* Invalid saved rules must not interrupt narration. */ }
            }
            return result;
        }).filter(value => value.trim());
    const sentences = paragraphs.flatMap((paragraph, paraIdx) =>
        (paragraph.match(/[^.!?]+[.!?]+["'\u201d\u2019\]\)]*|\s*[^.!?]+$/g) || [paragraph])
            .map(text => ({ text: text.trim(), paraIdx })).filter(sentence => sentence.text));
    return { chapterId, title, rawContent, sentences };
}
export function readerChapterQueue(chapter: PreparedReaderChapter, startIndex = 0, includeTitle = true): SpeechQueueItem[] {
    const start = Math.max(0, Math.min(startIndex, chapter.sentences.length));
    const first = chapter.sentences[start];
    const paragraph = chapter.sentences.slice(start).filter(sentence => sentence.paraIdx === first?.paraIdx).map(sentence => sentence.text).join(' ');
    const title = includeTitle ? readerTitlePrefix(chapter.title, paragraph) : '';
    return [
        ...(title ? [{ chapterId: chapter.chapterId, text: title, sentenceIndex: start, isTitle: true }] : []),
        ...chapter.sentences.slice(start).map((sentence, offset) => ({ chapterId: chapter.chapterId, text: readerSpeechText(sentence.text), sentenceIndex: start + offset })),
    ].filter(item => item.text);
}
