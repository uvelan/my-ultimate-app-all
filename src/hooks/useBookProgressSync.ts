'use client';

import { useEffect, useRef } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

// Refresh when returning to an idle view; never interrupt active playback or a
// selection made while the network request is in flight.
export function useBookProgressSync(bookId: string | undefined, chapterIndex: number,
    playing: boolean, apply: (chapter: number, paragraph: number) => void) {
    const state = useRef({ chapterIndex, playing, apply });
    const changed = useRef(Date.now());
    if (state.current.chapterIndex !== chapterIndex) changed.current = Date.now();
    state.current = { chapterIndex, playing, apply };
    useEffect(() => {
        if (!bookId) return;
        let controller: AbortController | undefined;
        const refresh = async () => {
            if (document.visibilityState !== 'visible' || state.current.playing || Date.now() - changed.current < 1200) return;
            controller?.abort();
            controller = new AbortController();
            const request = controller;
            const before = state.current.chapterIndex;
            try {
                const res = await authenticatedFetch(`/api/books/${bookId}?progress=1`, {
                    signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]), cache: 'no-store',
                });
                if (!res.ok) return;
                const progress = await res.json();
                if (request.signal.aborted || state.current.playing || state.current.chapterIndex !== before) return;
                if (Number.isInteger(progress.chapterId) && progress.chapterId >= 0) {
                    state.current.apply(progress.chapterId, progress.sentenceId || 0);
                }
            } catch { /* Keep the current offline position when the server is unavailable. */ }
        };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            controller?.abort();
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [bookId]);
}
