'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { bookExportFilename, exportFileInfo, validateBookExportBytes, type LibraryExportFormat } from '@/lib/book-export-file';

export default function BookExportDialog({ book, onClose }: { book: { id: string; title: string }; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null), request = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState<LibraryExportFormat | null>(null), [error, setError] = useState('');
    useEffect(() => { dialog.current?.showModal(); return () => request.current?.abort(); }, []);
    const download = async (format: LibraryExportFormat) => {
        if (busy) return;
        const controller = new AbortController(); request.current = controller;
        setBusy(format); setError('');
        try {
            const response = await authenticatedFetch(`/api/books/${book.id}/download?format=${format}`, { signal: controller.signal });
            if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Book export failed.'); }
            const headers: Record<string, string> = {}; response.headers.forEach((value, key) => { headers[key] = value; });
            const bytes = validateBookExportBytes(await response.arrayBuffer(), format, headers);
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))).map(b => b.toString(16).padStart(2, '0')).join('');
            if (digest !== headers['x-book-export-sha256']) throw new Error('Download checksum validation failed. No file was downloaded.');
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: exportFileInfo(format).mime }));
            const link = document.createElement('a'); link.href = url; link.download = bookExportFilename(book.title, format);
            document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Export failed.'); }
        finally { if (!controller.signal.aborted) setBusy(null); }
    };
    return <dialog ref={dialog} aria-labelledby="book-export-title" onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto w-[min(480px,92vw)] rounded-xl border border-border bg-background-surface p-6 text-text-primary shadow-xl">
        <h2 id="book-export-title" className="text-lg font-bold">Export book</h2>
        <p className="my-3 break-words">{book.title}</p>
        <p className="mb-4 text-sm text-text-secondary">All chapters are checked before export. Choose an e-reader file or a JSON backup.</p>
        <div className="flex flex-wrap gap-3"><button disabled={!!busy} onClick={() => { void download('epub'); }} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">Export EPUB</button>
            <button disabled={!!busy} onClick={() => { void download('json'); }} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Export JSON</button>
            <button onClick={onClose} className="px-4 py-2">{busy ? 'Cancel' : 'Close'}</button></div>
        {busy && <p role="status" className="mt-4 text-sm">Checking every chapter and preparing {busy.toUpperCase()}…</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </dialog>;
}
