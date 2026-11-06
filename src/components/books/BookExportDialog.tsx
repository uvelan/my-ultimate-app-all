'use client';

import Script from 'next/script';
import { authorizeBookUpload, chooseMyepubFolder, findMyepubFolder, uploadBookToDrive } from '@/lib/book-drive-export';
import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { bookExportFilename, exportFileInfo, validateBookExportBytes, type LibraryExportFormat } from '@/lib/book-export-file';

export default function BookExportDialog({ book, onClose }: { book: { id: string; title: string }; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null), request = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(''), [error, setError] = useState('');
    const [driveClientId, setDriveClientId] = useState<string | null>(null);
    const [picker, setPicker] = useState({ key: '', project: '' });
    const [pickerReady, setPickerReady] = useState(false);
    const [googleReady, setGoogleReady] = useState(false), [googleFailed, setGoogleFailed] = useState(false);
    const [driveLink, setDriveLink] = useState('');
    useEffect(() => {
        dialog.current?.showModal();
        const controller = new AbortController();
        void authenticatedFetch('/api/drive?op=status', { signal: controller.signal })
            .then(async response => response.ok ? await response.json() : null)
            .then(config => {
                if (controller.signal.aborted) return;
                setDriveClientId(config?.clientId || '');
                setPicker({ key: config?.pickerKey || '', project: config?.pickerProject || '' });
            })
            .catch(() => { if (!controller.signal.aborted) setDriveClientId(''); });
        return () => { controller.abort(); request.current?.abort(); request.current = null; };
    }, []);

    const exportBook = async (format: LibraryExportFormat, destination: 'download' | 'drive') => {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        const { signal } = controller;
        setError('');
        setDriveLink('');
        try {
            let token = '';
            let folderId: string | undefined;
            if (destination === 'drive') {
                if (!driveClientId) throw new Error('Google Drive authorization needs setup.');
                setBusy('Waiting for Google authorization…');
                token = await authorizeBookUpload(driveClientId);
                if (signal.aborted) return;
                setBusy('Finding My Drive → Myepub…');
                folderId = await findMyepubFolder(token, signal);
                if (!folderId) {
                    if (!picker.key || !picker.project) throw new Error('Google Picker needs setup before you can authorize Myepub.');
                    if (!pickerReady) throw new Error('Google Picker is still loading. Retry in a moment.');
                    dialog.current?.close();
                    let selected: string;
                    try { selected = await chooseMyepubFolder(token, picker.key, picker.project, signal); }
                    finally { if (!signal.aborted) dialog.current?.showModal(); }
                    folderId = await findMyepubFolder(token, signal, selected);
                    if (!folderId) throw new Error('Choose a writable Myepub folder at the top level of My Drive.');
                }
            }
            setBusy(`Checking every chapter and preparing ${format.toUpperCase()}…`);
            const response = await authenticatedFetch(`/api/books/${book.id}/download?format=${format}`, { signal });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || `Book export failed (HTTP ${response.status}).`);
            }
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => { headers[key] = value; });
            const bytes = validateBookExportBytes(await response.arrayBuffer(), format, headers);
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))).map(b => b.toString(16).padStart(2, '0')).join('');
            if (digest !== headers['x-book-export-sha256']) throw new Error('Book export checksum validation failed.');
            if (signal.aborted) return;
            const file = new File([new Uint8Array(bytes)], bookExportFilename(book.title, format), { type: exportFileInfo(format).mime });
            if (destination === 'drive') {
                setBusy('Uploading EPUB to My Drive → Myepub…');
                const link = await uploadBookToDrive(file, digest, token, folderId!, signal);
                if (!signal.aborted) setDriveLink(link);
                return;
            }
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) {
            if (!signal.aborted) setError(failure instanceof Error ? failure.message : 'Export failed.');
        } finally {
            if (request.current === controller) {
                request.current = null;
                setBusy('');
            }
        }
    };
    return <dialog ref={dialog} aria-labelledby="book-export-title" onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto w-[min(480px,92vw)] rounded-xl border border-border bg-background-surface p-6 text-text-primary shadow-xl">
        {driveClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setGoogleReady(true)} onError={() => setGoogleFailed(true)} />}
        {picker.key && <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" onReady={() => setPickerReady(true)} onError={() => setGoogleFailed(true)} />}
        <h2 id="book-export-title" className="text-lg font-bold">Export book</h2>
        <p className="my-3 break-words">{book.title}</p>
        <p className="mb-4 text-sm text-text-secondary">All chapters are checked before export. Choose an e-reader file or a JSON backup.</p>
        <div className="flex flex-wrap gap-3"><button disabled={!!busy} onClick={() => { void exportBook('epub', 'download'); }} className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">Export EPUB</button>
            <button disabled={!!busy} onClick={() => { void exportBook('json', 'download'); }} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Export JSON</button>
            <button disabled={!!busy || !driveClientId || !googleReady} onClick={() => { void exportBook('epub', 'drive'); }} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Save EPUB to Google Drive</button>
            <button onClick={onClose} className="px-4 py-2">{busy ? 'Cancel' : 'Close'}</button></div>
        {busy && <p role="status" className="mt-4 text-sm">{busy}</p>}
        {driveClientId === '' && <p className="mt-4 text-sm text-text-secondary">Google Drive authorization needs setup.</p>}
        {googleFailed && <p className="mt-4 text-sm text-text-secondary">Google authorization could not load.</p>}
        {driveLink && <p role="status" className="mt-4 text-sm">Saved to My Drive → Myepub. <a href={driveLink} target="_blank" rel="noopener noreferrer" className="underline">Open in Google Drive</a></p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
    </dialog>;
}
