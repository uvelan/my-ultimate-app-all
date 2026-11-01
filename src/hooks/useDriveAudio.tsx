'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { NarrationSync } from '@/lib/narration-sync';

interface Folder { id: string; name: string }
interface Configuration { configured: boolean; connected: boolean; clientId: string }
interface Grant { access_token?: string; expires_in?: number; scope?: string; error?: string }
async function request(url: string, init?: RequestInit) {
    const response = await authenticatedFetch(url, init), data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Drive request failed.');
    return data;
}
export function useDriveAudio(enabled: boolean, userId: string, bookId?: string, chapterId?: string) {
    const [configuration, setConfiguration] = useState<Configuration | null>(null);
    const [folders, setFolders] = useState<Folder[]>([]), [folder, setFolder] = useState<Folder | null>(null);
    const [voice, setVoice] = useState('af_bella'), [ready, setReady] = useState(false);
    const [connecting, setConnecting] = useState(false), [preparing, setPreparing] = useState(false);
    const [error, setError] = useState(''), [retry, setRetry] = useState(0);
    const [recording, setRecording] = useState<{ scope: string; url: string; sync: NarrationSync } | null>(null);
    const key = `web-drive-folder-${userId}-${bookId}`;
    const scope = JSON.stringify([userId, bookId, chapterId, folder?.id, voice, retry]);
    useEffect(() => {
        if (!enabled || !userId || !bookId) return;
        const controller = new AbortController();
        setConfiguration(null); setFolders([]); setFolder(null); setError('');
        try { setFolder(JSON.parse(localStorage.getItem(key) || 'null')); } catch { /* No saved folder. */ }
        void request('/api/drive?op=status', { signal: controller.signal }).then(value => {
            if (!controller.signal.aborted) setConfiguration(value);
        })
            .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
        return () => controller.abort();
    }, [enabled, userId, bookId, key]);
    const refresh = async () => { setFolders(await request('/api/drive?op=books')); };
    const connect = () => {
        const google = (window as unknown as { google?: { accounts: { oauth2: { initTokenClient(options: {
            client_id: string; scope: string; callback(response: Grant): void; error_callback(): void;
        }): { requestAccessToken(options: { prompt: string }): void } } } } }).google;
        if (!configuration?.configured || !google) { setError('Google Drive connection is not configured or could not load.'); return; }
        setConnecting(true); setError('');
        google.accounts.oauth2.initTokenClient({ client_id: configuration.clientId,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            error_callback: () => { setConnecting(false); setError('Google connection was cancelled or blocked.'); },
            callback: grant => { void (async () => {
                try {
                    if (!grant.access_token || grant.error || !grant.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.readonly')) throw new Error('Google Drive read permission was not granted.');
                    await request('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accessToken: grant.access_token, expiresIn: grant.expires_in }) });
                    setConfiguration(value => value ? { ...value, connected: true } : value);
                    await refresh(); setRetry(value => value + 1);
                } catch (failure) { setError(failure instanceof Error ? failure.message : 'Connection failed.'); }
                finally { setConnecting(false); }
            })(); },
        }).requestAccessToken({ prompt: '' });
    };
    useEffect(() => {
        const controller = new AbortController();
        setRecording(null); setPreparing(false);
        if (!enabled || !chapterId || !folder || !configuration?.connected) return;
        setPreparing(true); setError('');
        const query = new URLSearchParams({ op: 'prepare', folderId: folder.id, chapterId, voice });
        void request(`/api/drive?${query}`, { signal: controller.signal }).then(result => {
            if (!controller.signal.aborted) setRecording({ scope, url: result.url, sync: result.sync });
        }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
            .finally(() => { if (!controller.signal.aborted) setPreparing(false); });
        return () => controller.abort();
    }, [enabled, scope, configuration?.connected]);
    const current = enabled && recording?.scope === scope ? recording : null;
    useEffect(() => {
        if (!current?.url) return;
        const timer = setInterval(() => { void authenticatedFetch('/api/auth/profile').catch(() => {}); }, 5 * 60_000);
        return () => clearInterval(timer);
    }, [current?.url]);
    return { configuration, folders, folder, voice, setVoice, ready, setReady, busy: connecting || preparing,
        error, setError, url: current?.url || '', sync: current?.sync || null, connect,
        retry: () => setRetry(value => value + 1),
        refresh: () => { setConnecting(true); void refresh().catch(failure => setError(failure.message)).finally(() => setConnecting(false)); },
        chooseFolder: (id: string) => { const selected = folders.find(row => row.id === id) || null;
            setFolder(selected); localStorage.setItem(key, JSON.stringify(selected)); },
        disconnect: () => { setRecording(null); setConfiguration(value => value ? { ...value, connected: false } : value);
            void request('/api/drive', { method: 'DELETE' }).catch(failure => setError(failure.message)); },
    };
}
export function DriveAudioControls({ drive }: { drive: ReturnType<typeof useDriveAudio> }) {
    const button = 'rounded border border-slate-500 bg-slate-700 px-3 py-2 text-sm disabled:opacity-40';
    return <div className="w-full max-w-lg space-y-3 rounded-lg border border-slate-600 bg-slate-800 p-3">
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => drive.setReady(true)} onError={() => drive.setError('Could not load Google authorization.')} />
        <div className="flex flex-wrap gap-2">
            <button className={button} disabled={drive.busy || !drive.ready || !drive.configuration?.configured} onClick={drive.connect}>Connect / reconnect Drive</button>
            <button className={button} disabled={drive.busy || !drive.configuration?.connected} onClick={drive.refresh}>Refresh books</button>
            <button className={button} disabled={drive.busy || !drive.configuration?.connected} onClick={drive.disconnect}>Disconnect</button>
        </div>
        {drive.configuration && !drive.configuration.configured && <p role="alert" className="text-sm text-amber-300">Google Drive web authorization needs setup.</p>}
        {(drive.folders.length > 0 || drive.folder) && <label className="block text-sm">Drive book folder<select aria-label="Drive book folder" className="mt-1 w-full rounded bg-slate-700 p-2" value={drive.folder?.id || ''} onChange={event => drive.chooseFolder(event.target.value)}>
            <option value="">Choose this book’s folder</option>
            {drive.folder && !drive.folders.some(row => row.id === drive.folder!.id) && <option value={drive.folder.id}>{drive.folder.name}</option>}
            {drive.folders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>}
        {drive.error && <p role="alert" className="text-sm text-amber-300">{drive.error}</p>}
    </div>;
}
