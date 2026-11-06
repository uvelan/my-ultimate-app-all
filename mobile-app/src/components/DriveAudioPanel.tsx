import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { directDriveService, importDriveAudio, type DriveBookFolder, type DriveSyncProgress, type DriveChapterIssue } from '../services/drive-audio.service';

import { convertPhoneChapter } from '../services/phone-chapter.service';

export function DriveAudioPanel({ book, userId, chapterIndex, voice, chunkTarget }: {
    book?: { id: string; title: string; chapters: { id: string; title: string; content?: unknown }[] };
    userId: string; chapterIndex: number; voice: string; chunkTarget: number;
}) {
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    const [folderMenu, setFolderMenu] = useState(false);
    const [converting, setConverting] = useState(false);
    const phoneRun = useRef<AbortController | null>(null);
    const [folders, setFolders] = useState<DriveBookFolder[]>([]);
    const [selected, setSelected] = useState<DriveBookFolder | null>(null);
    const [progress, setProgress] = useState<DriveSyncProgress | null>(null);
    const updateProgress = (value: DriveSyncProgress) => { if (mounted.current) setProgress(value); };
    const cancelled = useRef(false), mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; phoneRun.current?.abort(); }; }, []);
    useEffect(() => { cancelled.current = true; phoneRun.current?.abort(); setProgress(null); setFolderMenu(false); setSelected(book ? directDriveService.selected(userId, book.id) || null : null); setFolders([]); }, [userId, book?.id, voice]);
    const connect = async () => {
        if (busy) return;
        setBusy(true); setMessage('Connecting Google Drive…');
        try { const books = await directDriveService.connect(userId); if (mounted.current) { setFolders(books); setFolderMenu(true); setMessage(books.length ? 'Select this book’s Colab output folder below.' : 'No books found under Myepub/UltimateAudio. Generate chapters in Colab first.'); } }
        catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Drive connection failed'); }
        finally { if (mounted.current) setBusy(false); }
    };
    const sync = async (retry = false) => {
        if (!book || !selected || busy) return;
        if (retry) directDriveService.resetChecks(userId, book.id, selected.id, voice);
        cancelled.current = false; setBusy(true); setProgress(null); setMessage('Preparing direct Drive sync…');
        try { await directDriveService.sync(book, userId, selected, chapterIndex, book.chapters.length,
            text => { if (mounted.current) setMessage(text); }, () => cancelled.current, updateProgress, voice); }
        catch (error) { if (mounted.current) { setProgress(value => value ? { ...value, phase: cancelled.current ? 'stopped' : 'error' } : value); setMessage(error instanceof Error ? error.message : 'Drive sync failed'); } }
        finally { if (mounted.current) setBusy(false); }
    };
    const run = async () => {
        if (!book || busy) return;
        cancelled.current = false; setBusy(true); setProgress(null); setMessage('Choose Google Drive in the file picker, then select the Colab audio ZIP.');
        try { await importDriveAudio(book, userId, chapterIndex, book.chapters.length,
            text => { if (mounted.current) setMessage(text); }, () => cancelled.current, updateProgress, voice); }
        catch (error) { if (mounted.current) { setProgress(value => value ? { ...value, phase: cancelled.current ? 'stopped' : 'error' } : value); setMessage(error instanceof Error ? error.message : 'Drive import failed'); } }
        finally { if (mounted.current) setBusy(false); }
    };
    const convert = async (issues: DriveChapterIssue[]) => {
        if (!book || busy || phoneRun.current) return;
        const controller = new AbortController();
        phoneRun.current = controller;
        setBusy(true);
        setConverting(true);
        const failures: string[] = [];
        let saved = 0;
        try {
            for (const issue of issues) {
                if (controller.signal.aborted) break;
                setMessage(`Converting on phone · ${issue.title}`);
                try {
                    await convertPhoneChapter(book, issue.chapterId, userId, voice, chunkTarget, controller.signal, event => {
                        if (mounted.current && !controller.signal.aborted) setMessage(`${issue.title} · ${event.message || 'Generating audio'}`);
                    });
                    if (controller.signal.aborted || !mounted.current) break;
                    saved++;
                    setProgress(value => value ? { ...value, saved: value.saved + 1,
                        mismatched: Math.max(0, value.mismatched - 1),
                        issues: value.issues.filter(item => item.chapterId !== issue.chapterId) } : value);
                } catch (error) {
                    if (!controller.signal.aborted) failures.push(`${issue.title}: ${error instanceof Error ? error.message : 'Conversion failed'}`);
                }
            }
            if (mounted.current) setMessage(`${controller.signal.aborted ? 'Stopped' : 'Phone conversion finished'} · ${saved} saved${failures.length ? '\n' + failures.join('\n') : ''}`);
        } finally {
            phoneRun.current = null;
            if (mounted.current) { setBusy(false); setConverting(false); }
        }
    };
    return <View style={{ padding: 16, marginVertical: 12, borderRadius: 14, backgroundColor: '#1e293b', gap: 10 }}>
        <Text style={{ color: '#f8fafc', fontSize: 17, fontWeight: '700' }}>Google Drive audio</Text>
        <Text style={{ color: '#cbd5e1' }}>{book ? `Download all available Drive chapters from section ${chapterIndex + 1} onward${book.chapters[chapterIndex]?.title ? ` (${book.chapters[chapterIndex].title})` : ''}. Future syncs check new or changed recordings for your selected voice. Keep this screen open.` : 'Open a book in Listen, then open Sync to import its Drive audio.'}</Text>
        {progress && <View style={{ gap: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{progress.phase === 'downloading' ? `Downloading chapter ${progress.chapter}` : progress.phase === 'finished' ? (progress.mismatched ? 'Drive check finished with missing chapters' : 'Drive sync finished') : progress.phase === 'stopped' ? 'Drive sync stopped' : progress.phase === 'error' ? 'Drive sync failed' : `Matching chapter ${progress.chapter}`}</Text>
            <Text style={{ color: '#cbd5e1' }}>Checked {progress.checked}/{progress.total} · Imported {progress.saved} · Already saved {progress.skipped}</Text>
            <View accessibilityRole="progressbar" accessibilityLabel="Drive chapters checked" accessibilityValue={{ min: 0, max: progress.total || 1, now: progress.checked }} style={{ height: 7, backgroundColor: '#475569', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ height: 7, width: `${Math.min(100, progress.checked / Math.max(1, progress.total) * 100)}%`, backgroundColor: '#60a5fa' }} />
            </View>
            <Text style={{ color: '#94a3b8' }}>On Drive: {progress.available}</Text>
            {!!(progress.mismatched) && <Text style={{ color: '#fbbf24' }}>{progress.mismatched} chapters need attention</Text>}
            {progress.issues.length > 0 && <View style={{ gap: 6 }}>
                {progress.issues.map(issue => <View key={issue.chapterId}>
                    <Text style={{ color: '#fbbf24' }}>Section {issue.section} · {issue.title}: {issue.reason}</Text>
                    <Pressable disabled={busy} onPress={() => { void convert([issue]); }}>
                        <Text style={{ color: '#93c5fd', paddingVertical: 6 }}>Convert on phone</Text>
                    </Pressable>
                </View>)}
                {progress.issues.length > 1 && <Pressable disabled={busy} onPress={() => { void convert(progress.issues); }}>
                    <Text style={{ color: '#93c5fd', paddingVertical: 6 }}>Convert all failed chapters on phone</Text>
                </Pressable>}
                {selected && <Pressable disabled={busy} onPress={() => { void sync(true); }}>
                    <Text style={{ color: '#93c5fd', paddingVertical: 6 }}>Recheck failed Drive chapters</Text>
                </Pressable>}
            </View>}
            {progress.phase === 'downloading' && !!progress.totalBytes && <>
                <Text style={{ color: '#cbd5e1' }}>{((progress.downloadedBytes || 0) / 1e6).toFixed(1)} / {(progress.totalBytes / 1e6).toFixed(1)} MB</Text>
                <View accessibilityRole="progressbar" accessibilityLabel="Current Drive audio download" accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round((progress.downloadedBytes || 0) / progress.totalBytes * 100)) }} style={{ height: 5, backgroundColor: '#475569', borderRadius: 3, overflow: 'hidden' }}><View style={{ height: 5, width: `${Math.min(100, (progress.downloadedBytes || 0) / progress.totalBytes * 100)}%`, backgroundColor: '#34d399' }} /></View>
            </>}
        </View>}
        <Pressable disabled={busy || !userId} onPress={connect} style={{ padding: 13, borderRadius: 10, backgroundColor: '#334155' }}><Text style={{ color: '#fff', textAlign: 'center' }}>Connect / refresh Drive books</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: folderMenu }} disabled={busy || !book}
            onPress={() => { if (folders.length) setFolderMenu(value => !value); else void connect(); }}
            style={{ padding: 12, borderColor: '#475569', borderWidth: 1, borderRadius: 8 }}>
            <Text style={{ color: '#fff' }}>{selected ? `Linked book: ${selected.name}` : 'Select Drive book'} ▾</Text>
        </Pressable>
        {folderMenu && folders.map(folder => <Pressable key={folder.id} disabled={busy || !book} onPress={() => {
            if (book) { directDriveService.select(userId, book.id, folder); setSelected(folder); setFolderMenu(false); setProgress(null); setMessage('Book linked. Future sync checks new or changed recordings.'); }
        }} accessibilityState={{ selected: selected?.id === folder.id }}
            style={{ padding: 10, borderColor: '#475569', borderWidth: 1, borderRadius: 8 }}>
            <Text style={{ color: '#fff' }}>{folder.name}{selected?.id === folder.id ? ' ✓' : ''}</Text>
        </Pressable>)}
        <Pressable disabled={!book || !selected || busy || !userId} onPress={() => { void sync(); }} style={{ padding: 13, borderRadius: 10, backgroundColor: '#2563eb', opacity: !book || !selected || busy ? .5 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Sync chapters directly from Drive</Text>}
        </Pressable>
        <Text style={{ color: '#94a3b8' }}>ZIP import is available as a fallback. Direct sync does not download a ZIP.</Text>
        <Pressable disabled={!book || busy || !userId} onPress={run} style={{ padding: 13, borderRadius: 10, backgroundColor: '#334155', opacity: !book || busy || !userId ? .5 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Choose audio ZIP from Drive</Text>}
        </Pressable>
        {busy && <Pressable onPress={() => { cancelled.current = true; if (converting) { phoneRun.current?.abort(); return; } void directDriveService.cancel(userId).catch(() => {}); setMessage('Stopping… Partial direct downloads are kept for resume. ZIP import stops after the current chapter.'); }}><Text style={{ color: '#fbbf24' }}>{converting ? 'Stop phone conversion' : 'Stop sync'}</Text></Pressable>}
        {!busy && selected && book && <Pressable onPress={async () => { await directDriveService.disconnect(userId, book.id); setSelected(null); setMessage('Drive disconnected locally. Offline audio is kept.'); }}><Text style={{ color: '#94a3b8' }}>Disconnect Drive</Text></Pressable>}
        {!!message && <Text accessibilityLiveRegion="polite" style={{ color: '#cbd5e1' }}>{message}</Text>}
    </View>;
}
