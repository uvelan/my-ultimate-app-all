'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { saveBookToCache } from '@/lib/book-db';

type ChapterBook = { id: string; chapters: { id: string; content?: unknown }[] };

export function useChapterWindow<T extends ChapterBook>(book: T | null, index: number,
    setBook: Dispatch<SetStateAction<T | null>>, cache = false) {
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const pending = book?.chapters.slice(index, index + 5).some(c => c.content === undefined) ?? false;
    useEffect(() => {
        if (!book || !pending) { setError(null); return; }
        const controller = new AbortController();
        let active = true;
        const timer = setTimeout(() => controller.abort(), 20_000);
        setError(null);
        void (async () => {
            try {
                const response = await authenticatedFetch(`/api/books/${book.id}/chapters?start=${index}&limit=5`, { signal: controller.signal });
                if (!response.ok) throw new Error(`Could not load chapters (HTTP ${response.status})`);
                const data = await response.json();
                if (!Array.isArray(data.chapters) || !data.chapters.length || data.chapters.some((c: any) => c.content === undefined)) throw new Error('No chapter content returned');
                if (!active) return;
                const loaded = new Map(data.chapters.map((c: any) => [c.id, c]));
                if (book.chapters.slice(index, index + 5).some(c => c.content === undefined && !loaded.has(c.id))) {
                    throw new Error('The chapter list changed. Refresh the book and retry.');
                }
                setBook(previous => {
                    if (!previous || previous.id !== book.id) return previous;
                    const next = { ...previous, chapters: previous.chapters.map(c => c.content === undefined && loaded.has(c.id) ? { ...c, ...(loaded.get(c.id) as object) } : c) };
                    if (cache) void saveBookToCache(next).catch(console.error);
                    return next;
                });
            } catch (error) {
                if (active) setError(controller.signal.aborted ? 'Chapter loading timed out. Please retry.' : error instanceof Error ? error.message : 'Could not load chapter');
            } finally { clearTimeout(timer); }
        })();
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [book, index, pending, attempt, setBook, cache]);
    return { loading: pending && !error, error, retry: () => setAttempt(value => value + 1) };
}
