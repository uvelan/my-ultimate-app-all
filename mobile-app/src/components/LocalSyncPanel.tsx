import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { localSyncService, type SyncStatus, type SyncSnapshot, type SyncConnection } from '../services/local-sync.service';
import { syncDisplayPhase, syncStatusMatches } from '../lib/sync-state';
import { bookService } from '../services/book.service';
import { audioIdentityKey, type NativeAudioIdentity } from '../lib/listen-audio';
import { kokoroNarration } from '../lib/kokoro-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Monitor, Check, RefreshCw, ChevronRight, Download, Pause, ShieldCheck, Wifi, Zap, SlidersHorizontal } from 'lucide-react-native';
import { chapterSyncProgress, batchDeliveryRequired } from '../lib/sync-progress';
import { cacheService } from '../lib/storage';
import { DriveAudioPanel } from './DriveAudioPanel';

interface SyncBook { id: string; title: string; chapters: { id: string; title: string; content?: unknown }[] }
export function LocalSyncPanel({ book, chapterIndex = 0, userId = '', voice = 'af_heart', chunkTarget = 1000, initialCode = '', initialOpen = false }:
    { book?: SyncBook; chapterIndex?: number; userId?: string; voice?: string; chunkTarget?: number; initialCode?: string; initialOpen?: boolean }) {
    const [open, setOpen] = useState(initialOpen), [code, setCode] = useState(initialCode), [host, setHost] = useState('');
    const [peers, setPeers] = useState<Awaited<ReturnType<typeof localSyncService.discover>>>([]);
    const [settings, setSettings] = useState(localSyncService.settings), [paired, setPaired] = useState(false);
    const [status, setStatus] = useState<SyncStatus>({ phase: 'idle' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [countInput, setCountInput] = useState(String(settings.count));
    const [device, setDevice] = useState('');
    const [connection, setConnection] = useState<SyncConnection>({ state: 'unknown' });
    const [paused, setPaused] = useState(true), [now, setNow] = useState(Date.now());
    const [pausing, setPausing] = useState(false);
    const [queue, setQueue] = useState<NonNullable<SyncSnapshot['queue']>>([]);
    const [library, setLibrary] = useState<Awaited<ReturnType<typeof localSyncService.refresh>>['artifacts']>([]);
    const [showPairing, setShowPairing] = useState(false);
    const [batch, setBatch] = useState<{ start: number; end: number } | null>(null);
    const insets = useSafeAreaInsets();
    const alive = useRef(true), preparing = useRef(false), checking = useRef(false), refreshing = useRef(false);
    const operation = useRef(0), preparation = useRef(0), pauseInFlight = useRef(false);
    const batchKey = 'pc-sync-batch-' + userId + '-' + (book?.id || '') + '-' + voice;
    const applySnapshot = (value: SyncSnapshot) => {
        setPaired(value.paired); setPaused(value.paused); setLibrary(value.artifacts); setQueue(value.queue || []);
        setConnection(value.connection || { state: 'unknown' });
        if (!preparing.current) setStatus(syncStatusMatches(value.status, userId, book?.id, book ? voice : undefined) ? value.status : { phase: 'idle' });
    };
    useEffect(() => { setBatch(cacheService.getObject<{ start: number; end: number }>(batchKey)); }, [batchKey]);
    useEffect(() => {
        if (!open) return;
        let active = true;
        const update = async () => {
            if (refreshing.current || AppState.currentState !== 'active') return;
            refreshing.current = true;
            try { const value = await localSyncService.refresh(); if (active) applySnapshot(value); }
            catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Unable to read sync status'); }
            finally { refreshing.current = false; }
        };
        const check = async () => {
            if (checking.current || AppState.currentState !== 'active') return;
            checking.current = true;
            try {
                const value = await localSyncService.refresh(); if (!value.paired) return;
                const health = await localSyncService.health();
                if (active) setDevice(health.backend?.gpu || (health.backend?.ready ? health.backend.device : 'Loads on first chapter'));
            } catch { /* Native connection state contains the failure and recovery guidance. */ }
            finally { checking.current = false; await update(); }
        };
        void update(); void check();
        const timer = setInterval(() => { setNow(Date.now()); void update(); }, 2000);
        const healthTimer = setInterval(() => { void check(); }, 10_000);
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') { void update(); void check(); } });
        return () => { active = false; clearInterval(timer); clearInterval(healthTimer); subscription.remove(); };
    }, [open, userId, book?.id, voice]);
    const light = cacheService.get('reader-theme') === 'light';
    const color = light ? '#0f172a' : '#f8fafc', backgroundColor = light ? '#fafafa' : '#111827';
    const input = { color, borderColor: '#8b5cf6', borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 12 };
    useEffect(() => { if (initialCode) { setCode(initialCode); setOpen(true); } }, [initialCode]);
    useEffect(() => { if (connection.state === 'pairing-required') setShowPairing(true); }, [connection.state]);
    useEffect(() => {
        alive.current = true;
        void localSyncService.refresh().then(value => { if (alive.current) applySnapshot(value); }).catch(() => {});
        const stop = localSyncService.subscribe(value => { if (alive.current) {
            setSettings(localSyncService.settings());
            if (value.phase === 'settings-changed') return;
            if (value.phase === 'connection-changed') { if (value.connection) setConnection(value.connection); return; }
            if (value.phase === 'paused') { setPaused(true); setStatus(value); }
            else if (!preparing.current && syncStatusMatches(value, userId, book?.id, book ? voice : undefined)) setStatus(value);
            if (['chapter-ready', 'complete', 'paused'].includes(value.phase)) void localSyncService.refresh().then(result => { if (alive.current) applySnapshot(result); }).catch(() => {});
        } });
        return () => { alive.current = false; stop(); };
    }, [userId, book?.id, voice]);
    const action = async (work: () => Promise<void>) => {
        if (busy || pauseInFlight.current) return;
        const id = ++operation.current; setBusy(true); setError('');
        try { await work(); } catch (failure) { if (alive.current && id === operation.current) setError(failure instanceof Error ? failure.message : 'Local sync failed'); }
        finally { if (alive.current && id === operation.current) setBusy(false); }
    };
    const pauseTransfers = async () => {
        if (pauseInFlight.current) return;
        pauseInFlight.current = true; ++preparation.current; ++operation.current;
        preparing.current = false; setBusy(false); setPausing(true); setPaused(true); setError('');
        setStatus(value => ({ ...value, phase: 'paused', retryAt: 0 }));
        try { await localSyncService.pause(); }
        catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to pause transfers'); }
        finally { pauseInFlight.current = false; if (alive.current) setPausing(false); }
    };
    const prepare = async (automatic: boolean) => {
        if (!book || !userId || preparing.current || pauseInFlight.current) return;
        const id = ++preparation.current, revision = localSyncService.preparationRevision();
        const allowed = () => alive.current && id === preparation.current && localSyncService.isPreparationCurrent(revision);
        preparing.current = true;
        try {
            const current = await localSyncService.refresh();
            if (!allowed()) return;
            let start = chapterIndex;
            if (!automatic && settings.start === 'continue') start = Math.max(start, (await localSyncService.lastSynced(userId, book.id, voice, chunkTarget)) + 1);
            if (!allowed()) return;
            if (start >= book.chapters.length) { setStatus({ phase: 'complete', message: 'No more chapters to sync.' }); return; }
            const range = { start, end: Math.min(book.chapters.length, start + settings.count) };
            setBatch(range); cacheService.setObject(batchKey, range);
            const entries = [];
            let pending = false;
            const batchId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            for (let index = start; index < Math.min(book.chapters.length, start + settings.count); index++) {
                if (!allowed()) return;
                if (current.queue?.some(item => item.userId === userId && item.bookId === book.id && item.voice === voice && item.chapterIndex === index && item.state !== 'complete')) {
                    pending = true; continue;
                }
                setStatus({ phase: 'preparing', chapterIndex: index });
                const chapter = book.chapters[index];
                const loaded = chapter.content === undefined ? await bookService.getChapterContent(book.id, String(index)) : chapter;
                if (!allowed()) return;
                if (loaded.id !== chapter.id || loaded.content === undefined) throw new Error('The chapter list changed. Reopen the book and sync again.');
                const identity: NativeAudioIdentity = { userId, bookId: book.id, chapterId: chapter.id, title: chapter.title,
                    content: loaded.content, provider: 'kokoro', voice, grammarModel: 'OFF', chunkTarget };
                const saved = await localSyncService.get(identity);
                if (!allowed()) return;
                if (saved) continue;
                const narration = kokoroNarration(loaded.content, chapter.title, chunkTarget);
                const requestKey = audioIdentityKey(identity);
                entries.push({ requestKey, userId, chapterIndex: index, chunkTarget, playbackIndex: chapterIndex, playbackRevision: Date.now(),
                    rangeStart: range.start, rangeEnd: range.end,
                    batchId: batchDeliveryRequired(index, chapterIndex) ? batchId : '',
                    payload: { requestKey, chapterId: chapter.id, bookId: book.id, title: chapter.title, voice, chunks: narration.chunks, paragraphs: narration.paragraphs } });
            }
            if (!allowed()) return;
            if (entries.length) await localSyncService.enqueue(entries, settings.automatic, revision);
            else if (pending) setStatus(syncStatusMatches(current.status, userId, book.id, voice) ? current.status : { phase: 'queued', userId, bookId: book.id, voice });
            else setStatus({ phase: 'complete', message: 'Selected chapters are already saved on this phone.' });
        } finally { if (id === preparation.current) preparing.current = false; }
    };
    useEffect(() => {
        if (paired && settings.enabled && settings.automatic && book && userId) void prepare(true).catch(failure => { if (alive.current) setError(failure.message); });
    }, [paired, settings.enabled, settings.automatic, settings.count, book?.id, chapterIndex, userId, voice, chunkTarget]);
    const discover = () => action(async () => {
        const found = await localSyncService.discover(); setPeers(found);
        const selected = found.find(peer => peer.id === code.trim().split('.')[1]) || (found.length === 1 ? found[0] : undefined);
        if (selected) setHost(selected.host);
        if (!found.length) setError('No PC found yet. Start sync-service on the PC, allow Private network access, or enter its local IP.');
    });
    const pair = () => action(async () => {
        const peer = peers.find(value => value.id === code.trim().split('.')[1]);
        await localSyncService.pair(code, host || peer?.host || connection.host || '', peer?.port || 8766); setPaired(true); setSettings(localSyncService.settings());
        const health = await localSyncService.health(); setDevice(health.backend?.gpu || health.backend?.device || 'Ready');
    });
    const reconnect = () => action(async () => {
        const health = await localSyncService.reconnect(host);
        setDevice(health.backend?.gpu || health.backend?.device || 'Ready');
        applySnapshot(await localSyncService.refresh());
    });
    const setting = (name: Parameters<typeof localSyncService.setSetting>[0], value: string | number | boolean) => { localSyncService.setSetting(name, value); setSettings(localSyncService.settings()); };
    const palette = { bg: light ? '#f5f5fb' : '#0c101b', card: light ? '#ffffff' : '#171d2c', ink: light ? '#17162e' : '#f5f3ff', muted: light ? '#74758a' : '#a5abc0', border: light ? '#eae9f3' : '#2b3246', purple: '#8656ee' };
    const scopeBookId = book?.id || status.bookId || queue.find(item => item.userId === userId)?.bookId;
    const scopeVoice = book ? voice : status.voice || queue.find(item => item.userId === userId && item.bookId === scopeBookId)?.voice || voice;
    const scopedQueue = queue.filter(item => item.userId === userId && item.bookId === scopeBookId && item.voice === scopeVoice);
    const queueIndexes = scopedQueue.map(item => item.chapterIndex);
    const nativeRange = Number.isInteger(status.rangeStart) && Number.isInteger(status.rangeEnd) && status.rangeStart! >= 0 && status.rangeEnd! > status.rangeStart!
        ? { start: status.rangeStart!, end: status.rangeEnd! } : null;
    const range = nativeRange || (book ? batch || { start: chapterIndex, end: Math.min(book.chapters.length, chapterIndex + settings.count) }
        : { start: queueIndexes.length ? Math.min(...queueIndexes) : 0, end: queueIndexes.length ? Math.max(...queueIndexes) + 1 : 0 });
    const visibleQueue = scopedQueue.filter(item => item.chapterIndex >= range.start && item.chapterIndex < range.end);
    const savedFiles = library.filter(file => file.userId === userId && file.bookId === scopeBookId && file.voice === scopeVoice);
    const saved = savedFiles.map(file => file.chapterIndex);
    const activeIndex = status.phase.startsWith('batch-') ? status.chapterIndex ?? -1
        : status.chapterId && book ? book.chapters.findIndex(chapter => chapter.id === status.chapterId) : status.chapterIndex ?? -1;
    const displayPhase = syncDisplayPhase(status.phase, connection, paused, now);
    const rangeProgress = chapterSyncProgress(range.start, range.end, saved, activeIndex, displayPhase, status.progress, status.batchTotal);
    const queueSaved = visibleQueue.filter(item => savedFiles.some(file => file.key === item.key)).length;
    const progress = book ? rangeProgress : { ...rangeProgress, total: visibleQueue.length, complete: queueSaved,
        remaining: visibleQueue.length - queueSaved, percent: visibleQueue.length ? queueSaved / visibleQueue.length * 100 : 0 };
    const savedPercent = progress.total ? progress.complete / progress.total * 100 : 0;
    const working = ['preparing', 'queued', 'generating', 'downloading', 'batch-generating', 'batch-downloading', 'verifying'].includes(displayPhase);
    const phaseLabel = ({ idle: 'Ready to sync', preparing: 'Preparing chapters', queued: 'Queued on PC', generating: 'Creating audio', 'batch-generating': 'Preparing batch on PC', 'batch-downloading': 'Downloading batch', downloading: 'Downloading chapter', verifying: 'Verifying chapter', 'chapter-ready': 'Chapter saved', complete: 'Sync complete', paused: 'Sync paused', waiting: 'Connection interrupted', 'resume-needed': 'Ready to resume transfers', checking: 'Checking PC connection', error: 'Sync needs attention' } as Record<string, string>)[displayPhase] || 'Checking sync status';
    const connectionLabel = connection.state === 'connected' && connection.checkedAt && now - connection.checkedAt <= 30_000 ? 'PC connected'
        : connection.state === 'pairing-required' ? 'Pair again' : connection.state === 'disconnected' ? 'PC disconnected' : 'Checking connection';
    const retrySeconds = status.retryAt ? Math.max(0, Math.ceil((status.retryAt - now) / 1000)) : 0;
    const storageBytes = library.filter(file => file.userId === userId && (!book || file.bookId === book.id)).reduce((sum, file) => sum + file.bytes, 0);
    const card = { backgroundColor: palette.card, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: palette.border, marginBottom: 16 };
    const field = { color: palette.ink, borderColor: palette.border, borderWidth: 1, padding: 14, borderRadius: 13, marginTop: 10, backgroundColor: palette.bg };
    const titleStyle = { color: palette.ink, fontSize: 17, fontWeight: '700' as const };
    const detailStyle = { color: palette.muted, fontSize: 12, lineHeight: 18 };
    const toggle = (title: string, detail: string, value: boolean, onChange: (value: boolean) => void) => <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
        <View style={{ flex: 1, paddingRight: 15 }}><Text style={{ color: palette.ink, fontSize: 14, fontWeight: '600' }}>{title}</Text><Text style={[detailStyle, { marginTop: 3 }]}>{detail}</Text></View>
        <Switch disabled={pausing} accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: light ? '#dedee8' : '#343c50', true: '#b7a0f6' }} thumbColor={value ? '#8052e8' : '#f4f4f7'} />
    </View>;
    return <View style={{ width: '100%', alignItems: 'center', marginBottom: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 22, backgroundColor: light ? '#efe9fd' : '#251e3b' }}>
            <Monitor size={15} color="#9869ee" /><Text style={{ color: '#9565e9', fontWeight: '700', fontSize: 13 }}>PC sync · {working ? Math.round(savedPercent) + '%' : phaseLabel.toLowerCase()}</Text><ChevronRight size={14} color="#9869ee" />
        </Pressable>
        <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
            <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: Math.max(insets.top, 20) }}>
                <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}><Text style={{ color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>YOUR OFFLINE LIBRARY</Text><Text style={{ color: palette.ink, fontSize: 27, fontWeight: '800', marginTop: 5 }}>Audio sync</Text></View>
                    <Pressable accessibilityLabel="Close PC sync" onPress={() => setOpen(false)} style={{ padding: 10, borderRadius: 22, backgroundColor: palette.card }}><X size={22} color={palette.ink} /></Pressable>
                </View>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 24 }} keyboardShouldPersistTaps="handled">
                    <DriveAudioPanel book={book} userId={userId} chapterIndex={chapterIndex} />
                    <View style={{ backgroundColor: '#21173d', borderRadius: 25, padding: 22, marginBottom: 18, overflow: 'hidden' }}>
                        <Text style={{ color: '#b9aacc', fontSize: 12, fontWeight: '700', marginBottom: 10 }}>PC sync &amp; saved offline library</Text>
                        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#332153', right: -65, top: -80 }} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: displayPhase === 'waiting' || displayPhase === 'error' ? '#fbbf24' : working ? '#bda2ff' : '#68d8b0' }} /><Text accessibilityLiveRegion="polite" style={{ color: '#d8c8ff', fontSize: 12, fontWeight: '700' }}>{phaseLabel}</Text>{working && <ActivityIndicator size="small" color="#cdb4ff" />}</View>
                        <Text numberOfLines={1} style={{ color: '#fff', fontSize: 21, fontWeight: '700', marginTop: 15 }}>{book?.title || 'Your next listen, ready offline'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 17 }}><Text style={{ color: '#fff', fontSize: 42, fontWeight: '800' }}>{progress.complete}</Text><Text style={{ color: '#b9aacc', fontSize: 15 }}> / {progress.total} chapters saved</Text><Text style={{ marginLeft: 'auto', color: '#ddd0ff', fontWeight: '700' }}>{Math.round(savedPercent)}%</Text></View>
                        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(savedPercent) }} style={{ height: 8, borderRadius: 5, backgroundColor: '#49375e', marginTop: 14, overflow: 'hidden' }}><View style={{ height: '100%', width: `${savedPercent}%`, backgroundColor: '#b18aff', borderRadius: 5 }} /></View>
                        <Text style={{ color: '#b9aacc', fontSize: 12, lineHeight: 18, marginTop: 12 }}>{displayPhase === 'waiting' ? 'Saved chapters still play offline. Reconnect to resume the remaining transfers.' : paused ? 'Transfers are paused. Saved chapters remain available offline.' : 'Saved means downloaded and verified on this phone.'}</Text>
                        <View style={{ flexDirection: 'row', paddingTop: 18, marginTop: 16, borderTopWidth: 1, borderTopColor: '#48335d' }}>
                            {[['SAVED', String(progress.complete)], ['REMAINING', String(progress.remaining)], ['VOICE', scopeVoice === 'af_bella' ? 'Bella' : 'Heart']].map(([label, value]) => <View key={label} style={{ flex: 1 }}><Text style={{ color: '#a997bf', fontSize: 9, letterSpacing: 1 }}>{label}</Text><Text style={{ color: '#f4efff', fontSize: 15, fontWeight: '700', marginTop: 5 }}>{value}</Text></View>)}
                        </View>
                    </View>
                    {(working || displayPhase === 'waiting' || displayPhase === 'error') && <View style={card}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ padding: 10, borderRadius: 13, backgroundColor: light ? '#f1eafa' : '#2e2343' }}><Download size={20} color="#9560ec" /></View><View style={{ flex: 1 }}><Text style={titleStyle}>{status.phase.startsWith('batch-') ? 'Batch of ' + status.batchTotal + ' chapters' : activeIndex >= 0 ? 'Chapter ' + (activeIndex + 1) : phaseLabel}</Text><Text numberOfLines={1} style={detailStyle}>{book?.chapters[activeIndex]?.title || 'Preparing your chapter audio'}</Text></View><Text style={{ color: '#9161e5', fontWeight: '700' }}>{progress.currentPercent}%</Text></View>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: palette.border, marginTop: 16, overflow: 'hidden' }}><View style={{ height: 5, width: `${progress.currentPercent}%`, backgroundColor: '#9461ec', borderRadius: 3 }} /></View><Text style={[detailStyle, { marginTop: 8 }]}>{phaseLabel}{displayPhase === 'generating' ? ' on your PC' : ''}{status.totalBytes ? ` · ${((status.downloadedBytes || 0) / 1_000_000).toFixed(1)} / ${(status.totalBytes / 1_000_000).toFixed(1)} MB` : ''}</Text>
                        {displayPhase === 'waiting' && <Text accessibilityLiveRegion="polite" style={[detailStyle, { marginTop: 6 }]}>{retrySeconds > 0 ? `Retry ${status.retryAttempt || 1} in ${retrySeconds}s` : 'Tap Reconnect & resume to try now.'}</Text>}
                    </View>}
                    <View style={card}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Monitor size={23} color="#9060df" /><View style={{ flex: 1 }}><Text style={titleStyle}>{paired ? connectionLabel : 'Connect your PC'}</Text><Text style={[detailStyle, { marginTop: 3 }]}>{paired ? [connection.host, connection.state === 'connected' ? device : connection.message || 'Checking the saved PC address'].filter(Boolean).join(' · ') : 'Generate on your PC. Listen on your phone.'}</Text></View>{paired && <ShieldCheck size={21} color={connectionLabel === 'PC connected' ? '#28a887' : '#d99a30'} />}</View>
                        {paired && <Pressable accessibilityRole="button" disabled={busy || pausing} onPress={connection.state === 'pairing-required' ? () => setShowPairing(true) : reconnect} style={{ padding: 13, borderRadius: 12, backgroundColor: '#8656ee', marginTop: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}><Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Connecting…' : connection.state === 'pairing-required' ? 'Pair again' : paused ? 'Reconnect & resume' : 'Reconnect & retry'}</Text></Pressable>}
                        {paired && <Pressable onPress={() => setShowPairing(value => !value)} style={{ paddingTop: 15 }}><Text style={{ color: '#9865e9', fontSize: 12, fontWeight: '700' }}>{showPairing ? 'Hide connection details' : 'Manage connection'}</Text></Pressable>}
                        {(!paired || showPairing) && <View style={{ marginTop: 15 }}>
                            <Pressable onPress={discover} disabled={busy || pausing} style={{ flexDirection: 'row', gap: 8, paddingVertical: 10 }}><Wifi size={17} color="#9160e4" /><Text style={{ color: '#9160e4', fontWeight: '700' }}>Find PC automatically</Text></Pressable>
                            {peers.map(peer => <Pressable key={peer.id + peer.host} onPress={() => setHost(peer.host)} style={{ paddingVertical: 9 }}><Text style={{ color: palette.ink, fontSize: 13 }}>{peer.name} · {peer.host}</Text></Pressable>)}
                            <TextInput accessibilityLabel="PC pairing code" placeholder="Pairing code from your PC" placeholderTextColor={palette.muted} autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} style={field} />
                            <TextInput accessibilityLabel="PC local IP address" placeholder="PC local IP address" placeholderTextColor={palette.muted} autoCapitalize="none" value={host} onChangeText={setHost} style={field} />
                            {paired && <Text style={[detailStyle, { marginTop: 8 }]}>Reconnect keeps the existing pairing. Enter a new local IP if discovery cannot find the PC. Pair again only when its identity or credentials have changed.</Text>}
                            <Pressable onPress={pair} disabled={busy || pausing || !code || !(host || connection.host)} style={{ padding: 14, alignItems: 'center', borderRadius: 13, backgroundColor: '#8656ee', marginTop: 12, opacity: busy || !code || !(host || connection.host) ? 0.5 : 1 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Pair PC</Text></Pressable>
                        </View>}
                    </View>
                    {paired && <>
                        <View style={card}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 }}><SlidersHorizontal size={18} color="#9262e5" /><Text style={titleStyle}>Sync preferences</Text></View>
                            {toggle('PC audio', 'Prefer verified chapters saved on this phone.', settings.enabled, value => { setting('enabled', value); if (!value) void pauseTransfers(); })}
                            {toggle('Automatic sync', 'Nearby chapters first; ready chapters download while the PC generates more.', settings.automatic, value => setting('automatic', value))}
                            {toggle('Phone generation', 'Generate locally when PC audio is unavailable.', settings.phoneFallback, value => setting('phoneFallback', value))}
                            <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 12 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: palette.ink, fontWeight: '600' }}>Chapters per sync</Text><Text style={detailStyle}>Choose between 1 and 50</Text></View><TextInput accessibilityLabel="Chapters per sync" keyboardType="number-pad" maxLength={2} value={countInput} onChangeText={setCountInput} style={[field, { width: 66, textAlign: 'center', marginTop: 0, fontSize: 18, fontWeight: '700' }]} onEndEditing={() => { const count = Number(countInput); if (Number.isInteger(count) && count >= 1 && count <= 50) setting('count', count); else { setCountInput(String(settings.count)); setError('Choose between 1 and 50 chapters.'); } }} /></View>
                            <View style={{ flexDirection: 'row', borderRadius: 13, backgroundColor: palette.bg, padding: 4, marginTop: 20 }}>{(['current', 'continue'] as const).map(value => <Pressable key={value} onPress={() => setting('start', value)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: settings.start === value ? '#8656ee' : 'transparent' }}><Text style={{ color: settings.start === value ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700' }}>{value === 'current' ? 'Current chapter' : 'After last saved'}</Text></Pressable>)}</View>
                        </View>
                        {!!book && <View style={card}><Text style={titleStyle}>Chapter queue</Text><Text style={[detailStyle, { marginTop: 6 }]}>Nearby chapters download individually. Ready chapters farther ahead arrive in groups of up to 3 while generation continues.</Text><Text style={[detailStyle, { marginTop: 5, marginBottom: 10 }]}>Chapters {range.start + 1}–{range.end} · saved audio plays offline</Text>
                            {book.chapters.slice(range.start, Math.min(range.end, range.start + 50)).map((chapter, offset) => { const index = range.start + offset, ready = saved.includes(index), processing = working && index === activeIndex; return <View key={chapter.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderTopWidth: 1, borderTopColor: palette.border }}><View style={{ width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? light ? '#e6f6ef' : '#18382e' : palette.bg }}>{ready ? <Check size={15} color="#28a887" /> : processing ? <ActivityIndicator size="small" color="#9865e9" /> : <Text style={{ color: palette.muted, fontSize: 10 }}>{index + 1}</Text>}</View><Text numberOfLines={1} style={{ color: palette.ink, flex: 1, fontSize: 12 }}>{chapter.title}</Text><Text style={{ color: ready ? '#28a887' : processing ? '#9865e9' : palette.muted, fontSize: 10, fontWeight: '600' }}>{ready ? 'Saved' : processing ? phaseLabel : displayPhase === 'waiting' ? 'Waiting for PC' : paused ? 'Paused' : scopedQueue.find(item => item.chapterIndex === index)?.state === 'pc-ready' ? 'Generated on PC' : 'Queued'}</Text></View>; })}
                        </View>}
                        {!book && visibleQueue.length > 0 && <View style={card}><Text style={titleStyle}>Current sync queue</Text>{visibleQueue.slice(-50).map(item => <View key={item.key} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10 }}><Text style={{ flex: 1, color: palette.ink }}>Chapter {item.chapterIndex + 1}</Text><Text style={detailStyle}>{savedFiles.some(file => file.key === item.key) ? 'Saved' : paused ? 'Paused' : displayPhase === 'waiting' ? 'Waiting for PC' : item.chapterIndex === activeIndex ? phaseLabel : 'Queued'}</Text></View>)}</View>}
                        <View style={card}><Text style={titleStyle}>Offline storage · {(storageBytes / 1_000_000).toFixed(1)} MB</Text><Text style={[detailStyle, { marginTop: 6 }]}>Audio older than 10 chapters behind your playing chapter is removed automatically. The current chapter, the previous 10, and downloaded chapters ahead are kept. Cleanup applies to the book being played.</Text></View>
                        {book ? <Pressable disabled={busy || pausing || working || !settings.enabled} onPress={() => action(() => prepare(false))} style={{ padding: 17, backgroundColor: '#8656ee', borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, opacity: busy || working || !settings.enabled ? 0.6 : 1 }}>{busy ? <ActivityIndicator color="#fff" /> : <RefreshCw size={18} color="#fff" />}<Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{working ? 'Sync in progress' : `Sync ${settings.count} chapters`}</Text></Pressable> : <Text style={detailStyle}>Open a book in Listen to choose chapters.</Text>}
                        <Pressable accessibilityRole="button" disabled={pausing || (paused && !working && !busy)} onPress={() => void pauseTransfers()} style={{ padding: 17, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, opacity: pausing ? 0.6 : 1 }}>{pausing ? <ActivityIndicator size="small" color={palette.muted} /> : <Pause size={15} color={palette.muted} />}<Text style={{ color: palette.muted, fontSize: 13 }}>{pausing ? 'Pausing transfers…' : paused && !working && !busy ? 'Transfers paused · keep listening' : 'Pause transfers · keep listening'}</Text></Pressable>
                        <Text style={[detailStyle, { textAlign: 'center' }]}>Pauses phone transfers. Audio already queued on the PC may finish generating.</Text>
                    </>}
                    {!!status.message && <Text style={[detailStyle, { marginTop: 8 }]}>{status.message}</Text>}
                    {!!error && <View style={{ padding: 14, borderRadius: 12, backgroundColor: light ? '#fceced' : '#3a2028', marginTop: 12 }}><Text accessibilityRole="alert" style={{ color: light ? '#b42331' : '#fca5a5', fontSize: 13 }}>{error}</Text></View>}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}><Zap size={13} color={palette.muted} /><Text style={detailStyle}>PC generation. Less work for your phone.</Text></View>
                </ScrollView>
            </View>
        </Modal>
    </View>;
}
