import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../lib/api-client';
import { audiobookLoadError } from '../lib/audiobook-load';

type ChapterBook = { id: string; chapters: { id: string; order?: number; content?: unknown }[] };

// Use the existing single-chapter endpoint so older deployed servers also work.
export async function loadListenChapters<T extends ChapterBook>(book: T, index: number, signal: AbortSignal): Promise<T> {
    const window = book.chapters.slice(index, index + 5);
    const results = await Promise.allSettled(window.map(async (chapter, offset) => {
        if (chapter.content !== undefined) return chapter;
        const response = await api.get('/books/' + encodeURIComponent(book.id) + '/chapters/' + (chapter.order ?? index + offset), { signal });
        if (response.data?.id !== chapter.id || response.data.content === undefined)
            throw new Error('The chapter list changed or its content is missing. Reopen the book and retry.');
        return { ...chapter, ...response.data };
    }));
    if (signal.aborted) throw new Error('Chapter loading cancelled');
    // A failed prefetch must not make the selected chapter unavailable.
    const current = results[0];
    if (current?.status === 'rejected') throw current.reason;
    const loaded = new Map(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.id, result.value] as const] : []));
    return { ...book, chapters: book.chapters.map(chapter => loaded.get(chapter.id) || chapter) };
}

export function useListenChapters<T extends ChapterBook>(book: T | null, index: number, setBook: Dispatch<SetStateAction<T | null>>) {
    const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const scope = book?.id + ':' + index;
    const pending = !!book && book.chapters[index]?.content === undefined;
    const error = failure?.scope === scope ? failure.message : null;
    useEffect(() => {
        if (!book || !pending) return;
        const controller = new AbortController();
        let active = true;
        setFailure(null);
        void loadListenChapters(book, index, controller.signal).then(loaded => {
            if (active) setBook(previous => previous?.id === book.id ? loaded : previous);
        }).catch(error => {
            if (active) setFailure({ scope, message: audiobookLoadError(error) });
        });
        return () => { active = false; controller.abort(); };
    }, [book?.id, index, pending, attempt, setBook]);
    return { loading: pending && !error, error, retry: () => { setFailure(null); setAttempt(value => value + 1); } };
}
