import { refreshCueLayoutText } from '@/src/lib/narration-layout';
import { ListenTranscript } from '@/src/components/ListenTranscript';
import { ChapterIndexList } from '@/src/components/ChapterIndexList';
import { useForegroundAudioStatus } from '@/src/hooks/useForegroundAudioStatus';
import { useIsFocused } from '@react-navigation/native';
import { listenResumeService } from '@/src/services/listen-resume.service';
import { localSyncService } from '@/src/services/local-sync.service';
import { LocalSyncPanel } from '@/src/components/LocalSyncPanel';
import * as FileSystem from 'expo-file-system/legacy';
import { audioDiagnostics } from '@/src/lib/audio-diagnostics';
import { ProgressiveAudio } from '@/src/lib/progressive-audio';
import { KokoroSetup } from '@/src/components/KokoroSetup';
import { KOKORO_VOICES, kokoroNarration, normalizeChunkTarget } from '@/src/lib/kokoro-text';
import { useListenChapters } from '@/src/hooks/useListenChapters';
import { audiobookLoadError, validateAudiobook } from '@/src/lib/audiobook-load';
import { bookProgress } from '@/src/lib/book-progress';
import { bookService } from '@/src/services/book.service';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, Pressable, ActivityIndicator,
    Modal, Animated, Dimensions, Platform, TouchableOpacity, FlatList, Image, ScrollView, AppState, TextInput
} from 'react-native';
import {
    ChevronLeft, List, SkipBack, SkipForward, Play, Pause as PauseIcon, X, Settings, Clock, BookOpen
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { api } from '@/src/lib/api-client';
import { cacheService } from '@/src/lib/storage';
import { usePlaybackStore } from '@/src/store/playbackStore';
import { playbackNotificationService } from '@/src/services/playback-notification.service';
import { AUDIO_LABELS, AUDIO_VOICES, mobileAudioSettings, AudioProvider, NativeAudioIdentity, audioIdentityKey, nextAudioWindowStart, prepareNativeChapterPlayback } from '@/src/lib/listen-audio';
import { listenAudioService, NativeAudioFile } from '@/src/services/listen-audio.service';
import { buildNarrationCues, activeNarrationCue } from '@/src/lib/narration-sync';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.75);

interface Chapter {
    id: string;
    title: string;
    order?: number;
    content?: unknown;
}

interface Book {
    id: string;
    title: string;
    cover?: string;
    chapters: Chapter[];
    chapterId?: number;
}

export default function ListenScreen() {
    const router = useRouter();
    const idParam = useLocalSearchParams().id;
    const bookId = Array.isArray(idParam) ? idParam[0] : idParam;

    const [book, setBook] = useState<Book | null>(null);
    const [progressReady, setProgressReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

    const alive = useRef(true);
    const lifetimeCleanups = useRef(new Set<() => void>());
    const registerCleanup = useCallback((cleanup: () => void) => {
        let pending = true;
        const cancel = () => {
            if (!pending) return;
            pending = false; lifetimeCleanups.current.delete(cancel); cleanup();
        };
        lifetimeCleanups.current.add(cancel);
        return cancel;
    }, []);
    // Register before useAudioPlayer: Expo's passive cleanup releases its shared
    // native object. Invalidate our callbacks first and let Expo own disposal.
    useEffect(() => {
        alive.current = true;
        return () => {
            if (resumeCursor.current) { const saved = resumeCursor.current; listenResumeService.savePosition(saved.identity, saved.seconds, saved.index, true); listenResumeService.compact(saved.identity); }
            alive.current = false; sourceUri.current = null;
            playIntent.current = false; activeKey.current = null; promotedKey.current = null; awaitingAudio.current = null;
            refill.current = () => {};
            for (const cancel of Array.from(lifetimeCleanups.current)) cancel();
            for (const task of Array.from(tasks.current.values())) task.controller.abort();
            tasks.current.clear();
            listenAudioService.releaseOffline?.();
            playbackNotificationService.stopNotification().catch(() => {});
        };
    }, []);
    
    // Audio Player hook integration
    const player = useAudioPlayer(null) as ReturnType<typeof useAudioPlayer> & { setLocalChapterQueue?(config: string): void; setSleepDeadline?(deadline: number): void };
    const listenFocused = useIsFocused();
    const backgroundAudioStatus = useRef<(snapshot: ReturnType<typeof useForegroundAudioStatus>) => void>(() => {});
    const status = useForegroundAudioStatus(player, listenFocused, backgroundAudioStatus);
    const stream = useRef<ProgressiveAudio | null>(null);
    const streamPlay = useRef<() => void>(() => {});
    const sourceUri = useRef<string | null>(null);
    const nativeReconcile = useRef<() => Promise<boolean>>(async () => false);
    const backgroundNativeSyncScope = useRef({ bookId: '', index: -1 });
    const nativeReconcilePending = useRef<Promise<boolean> | null>(null);
    const nativeScope = useRef({ bookId: '', userId: '' });
    const resumeCursor = useRef<{ identity: NativeAudioIdentity; seconds: number; index: number } | null>(null);
    const pendingSeek = useRef<{ uri: string; seconds: number } | null>(null);
    const [, updateStream] = useState(0);
    const isPlaying = status.playing;
    const positionMillis = ((stream.current?.offset || 0) + (status.currentTime || 0)) * 1000;
    const durationMillis = (stream.current?.duration || status.duration || 0) * 1000;
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRecaching, setIsRecaching] = useState(false);
    const cancelGeneration = useRef<(() => void) | null>(null);
    
    // Settings
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [grammarModel, setGrammarModel] = useState("OFF");
    const [ttsVoice, setTtsVoice] = useState("en");
    const [provider, setProvider] = useState<AudioProvider>('kokoro');
    const [kokoroVoice, setKokoroVoice] = useState('af_heart');
    const [preferredChunkTarget, setPreferredChunkTarget] = useState(1000);
    const [chunkTargetInput, setChunkTargetInput] = useState('1000');
    const [chunkTargetError, setChunkTargetError] = useState('');
    const chunkScope = useRef<{ chapterId?: string; target: number; restored?: boolean }>({ target: 1000 });
    const [handoffVoice, setHandoffVoice] = useState<string | null>(null);
    const voiceSwitchToken = useRef(0);
    const [generationLabel, setGenerationLabel] = useState('');
    const [settingsReady, setSettingsReady] = useState(false);
    const [userId, setUserId] = useState('');
    nativeScope.current = { bookId: book?.id || '', userId };
    const [audioError, setAudioError] = useState('');
    const [audioNotice, setAudioNotice] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [activeAudio, setActiveAudio] = useState<{ key: string; file: NativeAudioFile } | null>(null);
    const [readyAudioUri, setReadyAudioUri] = useState<string | null>(null);
    const awaitingAudio = useRef<string | null>(null);
    const transcriptRef = useRef<ScrollView>(null);
    const transcriptHeight = useRef(0);
    const cueLayouts = useRef(new Map<number, { text: string; y: number; height: number }>());
    const cueLayoutScope = useRef('');
    const [followAudio, setFollowAudio] = useState(true);
    const followAudioRef = useRef(true);
    const screenAwakeGeneration = useRef(0);
    const screenAwakeOwner = useRef('listen-follow-' + bookId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    useFocusEffect(useCallback(() => {
        // Follow audio owns the screen wake lock only while this screen is foregrounded.
        if (!followAudio) return;
        let focused = true;
        let activeTag: string | null = null;
        const release = () => {
            const tag = activeTag; activeTag = null;
            if (tag) void deactivateKeepAwake(tag).catch(() => {});
        };
        const update = (state: string) => {
            release();
            if (!focused || state !== 'active' || (AppState.currentState && AppState.currentState !== 'active')) return;
            const tag = screenAwakeOwner.current + '-' + (++screenAwakeGeneration.current);
            activeTag = tag;
            void activateKeepAwakeAsync(tag).then(() => {
                if (!focused || activeTag !== tag) void deactivateKeepAwake(tag).catch(() => {});
            }).catch(() => {});
        };
        update(AppState.currentState || 'active');
        const subscription = AppState.addEventListener('change', update);
        return () => { focused = false; subscription.remove(); release(); };
    }, [bookId, followAudio]));
    const playIntent = useRef(false);
    const waitingForPcIntent = useRef(false);
    const currentBookRef = useRef(book?.id); currentBookRef.current = book?.id;
    const indexRef = useRef(currentChapterIndex); indexRef.current = currentChapterIndex;
    const windowRef = useRef<{ bookId: string; start: number; current: number } | null>(null);
    const tasks = useRef(new Map<string, { controller: AbortController; identity: NativeAudioIdentity; promise: Promise<NativeAudioFile>; file?: NativeAudioFile; streaming?: boolean }>());
    const activeKey = useRef<string | null>(null);
    const promotedKey = useRef<string | null>(null);
    const lastEndedKey = useRef<string | null>(null);
    const refill = useRef<() => void>(() => {});
    const bypassKeys = useRef(new Set<string>());
    const currentVoice = provider === 'kokoro' ? kokoroVoice : ttsVoice;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Timer State
    const nativeSleepDeadline = useRef(0);
    const [sleepTimer, setSleepTimer] = useState<number | 'EOC' | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    // Sidebar
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const sidebarAnim = useRef(new Animated.Value(SCREEN_W)).current;
    
    // Theme setup matching Reader
    const [isLightMode, setIsLightMode] = useState(false);
    useEffect(() => {
        const theme = cacheService.get('reader-theme');
        if (theme === 'light') setIsLightMode(true);
        
        const savedTarget = normalizeChunkTarget(cacheService.get('listen-chunk-target'));
        setPreferredChunkTarget(savedTarget); setChunkTargetInput(String(savedTarget));
        const storedSpeed = cacheService.get('listen-playback-speed');
        if (storedSpeed) setPlaybackSpeed(Number(storedSpeed));
        
        const storedGrammar = cacheService.get('listen-grammar-model');
        if (storedGrammar && storedGrammar !== 'gemini-2.5-flash') setGrammarModel(storedGrammar);
        const migrated = cacheService.get('listen-offline-migrated');
        const selected = mobileAudioSettings(migrated ? cacheService.get('listen-tts-provider') : 'kokoro',
            cacheService.get(cacheService.get('listen-tts-provider') === 'kokoro' ? 'listen-kokoro-voice' : 'listen-tts-voice'));
        setProvider(selected.provider);
        if (selected.provider === 'kokoro') { setKokoroVoice(selected.voice); setGrammarModel('OFF'); }
        else setTtsVoice(selected.voice);
        cacheService.set('listen-tts-provider', selected.provider);
        cacheService.set('listen-offline-migrated', '1');
        setSettingsReady(true);
    }, []);

    const th = {
        bg: isLightMode ? 'bg-[#fdfdfc]' : 'bg-background',
        surface: isLightMode ? 'bg-[#f3f3f0]' : 'bg-[#2d3748]', 
        text: isLightMode ? 'text-[#171717]' : 'text-text-primary',
        textMuted: isLightMode ? 'text-[#666666]' : 'text-[#a0aec0]',
        textSec: isLightMode ? 'text-[#444444]' : 'text-[#e2e8f0]',
        border: isLightMode ? 'border-[#e5e5e0]' : 'border-[#4a5568]',
        icon: isLightMode ? '#666666' : '#a0aec0',
        playerBg: isLightMode ? 'bg-white' : 'bg-[#1a202c]',
    };

    useEffect(() => {
        const controller = new AbortController();
        setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix'
        }).catch(console.error);
        
        if (bookId) {
            void fetchBook(String(bookId), controller.signal);
        }
        return registerCleanup(() => controller.abort());
    }, [bookId]);

    const fetchBook = async (id: string, signal?: AbortSignal) => {
        if (!alive.current || signal?.aborted) return;
        setLoading(true); setAudioError(''); setProgressReady(false);
        const revision = bookProgress.getRevision(id);
        try {
            const [res, profile] = await Promise.all([api.get(`/books/${encodeURIComponent(id)}?chapters=metadata`, { signal }), api.get('/auth/profile', { signal })]);
            if (!alive.current || signal?.aborted) return;
            const data = validateAudiobook(res.data);
            const account = profile.data?.id || profile.data?.email;
            if (typeof account !== 'string' || !account) throw new Error('The server returned an invalid account. Please sign in again.');
            setUserId(account);
            let chapters: Chapter[] = data.chapters || [];
            let nativeIndex: number | undefined;
            try {
                const snapshot = await localSyncService.refresh?.();
                const checkpoint = snapshot?.playback;
                const consumed = Number(cacheService.get('pc-playback-restored-' + id) || 0);
                if (checkpoint && checkpoint.userId === account && checkpoint.bookId === id && checkpoint.updated > consumed && chapters[checkpoint.chapterIndex]?.id === checkpoint.chapterId) {
                    nativeIndex = checkpoint.chapterIndex;
                    const file = snapshot.artifacts.find(item => item.uri === checkpoint.uri && item.userId === account);
                    if (file) chapters = chapters.map((chapter, index) => index === nativeIndex ? { ...chapter, content: file.sync.paragraphs } : chapter);
                    cacheService.set('pc-playback-restored-' + id, checkpoint.updated);
                    setKokoroVoice(checkpoint.voice); setProvider('kokoro');
                }
            } catch { /* An older native build may not expose a PC playback checkpoint. */ }
            if (!alive.current || signal?.aborted) return;
            setBook({ ...data, chapters });
            
            const finalIdx = nativeIndex !== undefined ? bookProgress.acceptServer(id, nativeIndex)
                : bookProgress.getRevision(id) === revision ? bookProgress.acceptServer(id, data.chapterId ?? 0) : bookProgress.getChapter(id);
            if (!alive.current || signal?.aborted) return;
            if (nativeIndex !== undefined) void saveProgressToDb(id, nativeIndex, true);
            setProgressReady(true);
            setCurrentChapterIndex(Math.max(0, Math.min(finalIdx, (data.chapters?.length || 1) - 1)));
        } catch (error: any) {
            if (!alive.current || signal?.aborted) return;
            setAudioError(audiobookLoadError(error));
        } finally {
            if (alive.current && !signal?.aborted) setLoading(false);
        }
    };

    const saveProgressToDb = async (id: string, index: number, force = false) => {
        try {
            await bookService.updateProgress(id, index, 0, force);
        } catch (error) {}
    };

    useFocusEffect(useCallback(() => {
        if (!book?.chapters.length) return;
        let active = true;
        const refresh = async () => {
            if (await nativeReconcile.current()) { if (active) setProgressReady(true); return; }
            if (!active || !alive.current) return;
            const selected = indexRef.current;
            const saved = await bookService.syncProgress(book.id).catch(() => bookProgress.getChapter(book.id, indexRef.current));
            // A network response can arrive after Android has advanced another chapter.
            if (!active || !alive.current) return;
            if (await nativeReconcile.current()) { if (active) setProgressReady(true); return; }
            if (!active || !alive.current) return;
            if (indexRef.current === selected) setCurrentChapterIndex(Math.max(0, Math.min(saved, book.chapters.length - 1)));
            setProgressReady(true);
        };
        refresh();
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active' && !playIntent.current) refresh();
        });
        return () => { active = false; subscription.remove(); };
    }, [book?.id]));

    const chapterWindow = useListenChapters(book, currentChapterIndex, setBook);
    const currentChapter = book?.chapters[currentChapterIndex];
    if (chunkScope.current.chapterId !== currentChapter?.id) chunkScope.current = { chapterId: currentChapter?.id, target: normalizeChunkTarget(cacheService.get('listen-chunk-target')) };
    if (provider === 'kokoro' && book && userId && currentChapter?.content !== undefined && !chunkScope.current.restored) {
        const saved = listenResumeService.get({ userId, bookId: book.id, chapterId: currentChapter.id, title: currentChapter.title,
            content: currentChapter.content, provider, voice: currentVoice, grammarModel: 'OFF' });
        if (saved) chunkScope.current.target = saved.chunkTarget;
        chunkScope.current.restored = true;
    }
    const sessionChunkTarget = chunkScope.current.target;
    const switching = useRef(false);
    const updateWindow = (index: number) => {
        const previous = windowRef.current;
        const sameBook = previous?.bookId === book?.id;
        const start = nextAudioWindowStart(sameBook ? previous!.start : null, sameBook ? previous!.current : null, index);
        windowRef.current = { bookId: book?.id || '', start, current: index };
        return start;
    };
    const identityFor = (chapter: Chapter, selectedProvider = provider, voice = currentVoice): NativeAudioIdentity => ({
        userId, bookId: book!.id, chapterId: chapter.id, title: chapter.title, content: chapter.content,
        provider: selectedProvider, voice, chunkTarget: selectedProvider === 'kokoro' ? sessionChunkTarget : undefined, grammarModel: selectedProvider === 'kokoro' ? 'OFF' : grammarModel,
    });
    const [offlineChapterIds, setOfflineChapterIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        setOfflineChapterIds(new Set());
        if (!isSidebarOpen || !book || !userId) return;
        let cancelled = false, checking = false;
        const refresh = async () => {
            if (checking) return;
            checking = true;
            try {
                const imported = provider === 'kokoro'
                    ? await localSyncService.cachedChapterIds(userId, book.id, currentVoice) : [];
                // Only loaded text can produce a reliable content-based cache identity.
                const generated = await Promise.all(book.chapters.filter(c => c.content !== undefined).map(async c => {
                    const file = await listenAudioService.get(identityFor(c));
                    return file && file.provider === provider && file.voice === currentVoice ? c.id : null;
                }));
                if (!cancelled) setOfflineChapterIds(new Set([...imported, ...generated.filter((id): id is string => id !== null)]));
            } catch { /* Retry on the next refresh; never interrupt playback. */ }
            finally { checking = false; }
        };
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 5000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [isSidebarOpen, book, userId, provider, currentVoice, sessionChunkTarget, grammarModel]);
    const failAudioLoad = (error: unknown) => {
        if (!alive.current) return;
        if ((error as { code?: string })?.code === 'LOCAL_SYNC_PENDING') waitingForPcIntent.current = playIntent.current || waitingForPcIntent.current;
        else playIntent.current = false;
        if (stream.current) { try { player.pause(); } catch { /* Preserve the original failure. */ } }
        stream.current = null; pendingSeek.current = null; sourceUri.current = null;
        activeKey.current = null; promotedKey.current = null; awaitingAudio.current = null;
        switching.current = false;
        setReadyAudioUri(null); setActiveAudio(null); setIsGenerating(false);
        setAudioError(error instanceof Error ? error.message : 'Unable to load narration. Retry this chapter.');
    };
    const playStreamChunk = () => {
        const current = stream.current;
        const piece = current?.current;
        if (!current || !piece || !book || !currentChapter || !alive.current) return;
        activeKey.current = current.key; lastEndedKey.current = null; switching.current = true;
        awaitingAudio.current = piece.uri; sourceUri.current = piece.uri; setReadyAudioUri(null);
        setActiveAudio({ key: current.key, file: {
            key: current.key, requestKey: current.key, uri: piece.uri, bytes: piece.bytes,
            chapterId: currentChapter.id, provider: 'kokoro', voice: currentVoice, fallback: '',
            created: Date.now(), used: Date.now(), contentType: 'audio/wav', source: 'generated', sync: current.sync,
        } });
        setIsGenerating(false); setAudioNotice('');
        audioDiagnostics.record('playing chunk', { index: piece.index, start: piece.start, end: piece.end });
        prepareNativeChapterPlayback(player, piece.uri, playbackSpeed, {
            title: currentChapter.title, artist: book.title, albumTitle: book.title, artworkUrl: book.cover,
        }, playIntent.current && !pendingSeek.current);
        updateStream(value => value + 1);
    };
    streamPlay.current = () => runPlayerAction(playStreamChunk);
    const runPlayerAction = (action: () => void) => {
        if (!alive.current) return;
        try { action(); } catch (error) { failAudioLoad(error); }
    };
    const retryAudio = () => {
        if (!alive.current || !currentChapter) return;
        if (chapterWindow.error) { chapterWindow.retry(); return; }
        const keys = new Set([audioIdentityKey(identityFor(currentChapter)), activeKey.current]);
        for (const key of keys) {
            if (!key) continue;
            tasks.current.get(key)?.controller.abort(); tasks.current.delete(key); bypassKeys.current.add(key);
        }
        activeKey.current = null; promotedKey.current = null; awaitingAudio.current = null;
        setReadyAudioUri(null); setActiveAudio(null); setAudioError('');
        setRetryCount(value => value + 1);
    };
    const reCacheAudio = async () => {
        if (!alive.current || !currentChapter || !book || isRecaching) return;
        const selected = { bookId: book.id, index: currentChapterIndex, chapterId: currentChapter.id };
        const stillSelected = () => alive.current && currentBookRef.current === selected.bookId && indexRef.current === selected.index;
        cancelGeneration.current?.();
        for (const [key, task] of Array.from(tasks.current.entries())) {
            if (task.identity.chapterId === selected.chapterId) { task.controller.abort(); tasks.current.delete(key); }
        }
        playIntent.current = false;
        try { player.pause(); } catch (error) { failAudioLoad(error); return; }
        failAudioLoad(new Error('')); setIsRecaching(true);
        try {
            listenResumeService.clear(identityFor(currentChapter)); resumeCursor.current = null;
            await localSyncService.invalidate(identityFor(currentChapter));
            await listenAudioService.invalidateChapter(selected.chapterId);
            if (stillSelected()) { chunkScope.current = { chapterId: selected.chapterId, target: preferredChunkTarget, restored: true }; retryAudio(); }
        } catch (error) { if (stillSelected()) failAudioLoad(error); }
        finally { if (alive.current) setIsRecaching(false); }
    };
    const commitVoice = () => { if (handoffVoice) { setKokoroVoice(handoffVoice); setHandoffVoice(null); } };
    const changeKokoroVoice = async (voice: string): Promise<void> => {
        if (!alive.current || !currentChapter || !book || voice === (handoffVoice || kokoroVoice)) return;
        cacheService.set('listen-kokoro-voice', voice);
        const pc = localSyncService.settings();
        if (pc.enabled && !pc.phoneFallback && activeKey.current) {
            player.setLocalChapterQueue?.(JSON.stringify({ userId, bookId: book.id, bookTitle: book.title, voice, endOfChapter: sleepTimer === 'EOC', chapters: book.chapters.map(chapter => ({ id: chapter.id, title: chapter.title })) }));
            setHandoffVoice(voice); setAudioNotice('PC-synced chapters keep one voice. The new voice applies to the next chapter or a new sync.'); return;
        }
        let current = stream.current;
        const key = activeKey.current;
        const uri = activeAudio?.file.uri;
        const sync = activeAudio?.file.sync;
        if (!key || (!current && (!uri || !sync?.segments.length))) { setKokoroVoice(voice); return; }
        const token = ++voiceSwitchToken.current;
        setHandoffVoice(voice);
        const selectedChapter = currentChapter.id;
        try {
            if (current?.current && !current.complete && listenAudioService.changeOfflineVoice?.(key, voice, current.index + 1, current.current.end)) {
                listenResumeService.voiceChange(identityFor(currentChapter), voice, current.index);
                current.truncateAfterCurrent(); setHandoffVoice(voice);
                setAudioNotice('The new voice starts with the next passage.'); updateStream(value => value + 1); return;
            }
            // Cached chapters have one player source. Split their measured prefix
            // locally, preserving the exact playback position in the current passage.
            let prefixUri = tasks.current.get(key)?.file?.uri || uri!;
            if (!current) {
                const time = player.currentStatus.currentTime || 0;
                const index = sync!.segments.findIndex(segment => time < segment.end);
                if (index < 0 || index === sync!.segments.length - 1) {
                    setHandoffVoice(voice); setAudioNotice('This is the last passage. The new voice applies to the next chapter.'); return;
                }
                const pieces = await listenAudioService.splitOfflinePrefix(prefixUri, sync!.segments.slice(0, index + 1));
                if (!alive.current || token !== voiceSwitchToken.current || indexRef.current !== currentChapterIndex) {
                    for (const piece of pieces) void FileSystem.deleteAsync(piece.uri, { idempotent: true }); return;
                }
                const position = player.currentStatus.currentTime || 0;
                if (position >= pieces[index].end) {
                    for (const piece of pieces) void FileSystem.deleteAsync(piece.uri, { idempotent: true });
                    // Do not rewind if the listener crossed a boundary during disk IO.
                    return changeKokoroVoice(voice);
                }
                current = new ProgressiveAudio(key); current.pieces = pieces; current.index = index; current.waiting = false;
                current.sync = { ...sync!, segments: sync!.segments.slice(0, index + 1) }; current.texts = sync!.segments.map(segment => segment.text);
                stream.current = current;
                pendingSeek.current = { uri: pieces[index].uri, seconds: Math.max(0, position - pieces[index].start) };
                streamPlay.current();
            }
            const startIndex = current.index + 1;
            const fullSync = sync || current.sync!;
            const texts = current.texts || kokoroNarration(currentChapter.content, currentChapter.title, sessionChunkTarget).chunks;
            if (startIndex >= texts.length) {
                setHandoffVoice(voice); setAudioNotice('The new voice applies to the next chapter.'); return;
            }
            const prior = tasks.current.get(key);
            // This path is reached only once a uniform/mixed chapter is finished generating.
            // Keep existing pieces for seeks until the replacement session is left.
            const controller = new AbortController();
            const identity = identityFor(currentChapter);
            const continuation = { voice, index: startIndex, uri: prefixUri, seconds: current.current!.end,
                sync: { ...fullSync, segments: texts.map((text, index) => ({ text, start: fullSync.segments[index]?.start || 0, end: fullSync.segments[index]?.end || 0 })) },
                disposeUris: current.pieces.map(piece => piece.uri) };
            current.truncateAfterCurrent();
            listenResumeService.adopt(identity, current.pieces, current.sync!, texts, prefixUri, voice);
            setHandoffVoice(voice); setAudioNotice('The new voice starts with the next passage.');
            listenAudioService.setOfflineDemand?.(key, playIntent.current, current.index);
            const promise = listenAudioService.load(identity, () => currentChapter.id, controller.signal, false, true, (piece, nextSync) => {
                if (!alive.current || controller.signal.aborted || stream.current?.key !== key || selectedChapter !== currentChapter.id) return;
                const queue = stream.current;
                if (!queue.append(piece, nextSync)) return;
                listenResumeService.savePiece(identity, piece, nextSync, texts);
                if (queue.waiting && queue.advance()) streamPlay.current();
                else { setActiveAudio(previous => previous?.key === key ? { ...previous, file: { ...previous.file, sync: nextSync } } : previous); updateStream(value => value + 1); }
            }, continuation);
            const task = { controller, identity, promise, streaming: true } as NonNullable<ReturnType<typeof tasks.current.get>>;
            tasks.current.set(key, task);
            const cancel = () => { controller.abort(); failAudioLoad(new Error('Audio loading cancelled. Tap Retry audio to try again.')); };
            cancelGeneration.current = cancel;
            // Old sessions own old pieces; transfer cleanup until this new session ends.
            controller.signal.addEventListener('abort', () => prior?.controller.abort(), { once: true });
            void promise.then(file => {
                if (!alive.current || controller.signal.aborted || stream.current?.key !== key) return;
                task.file = file; listenResumeService.saveFile(identity, file); stream.current.complete = true; updateStream(value => value + 1);
                if (stream.current.waiting) { switching.current = false; handleAudioEnded(); }
            }).catch(error => { if (alive.current && !controller.signal.aborted) failAudioLoad(error); })
                .finally(() => { if (cancelGeneration.current === cancel) cancelGeneration.current = null; });
        } catch (error) { if (alive.current) failAudioLoad(error); }
    };
    const applyFile = (task: NonNullable<ReturnType<typeof tasks.current.get>>, identity: NativeAudioIdentity, index: number) => {
        if (!alive.current || task.controller.signal.aborted) return null;
        stream.current = null; pendingSeek.current = null;
        const file = task.file!;
        const actual = { ...identity, provider: file.provider, voice: file.voice };
        const key = audioIdentityKey(actual);
        const changed = provider !== file.provider || currentVoice !== file.voice;
        tasks.current.delete(audioIdentityKey(identity)); tasks.current.set(key, task); task.identity = actual;
        activeKey.current = key; lastEndedKey.current = null; switching.current = true;
        const bookmark = listenResumeService.get(identity);
        listenResumeService.saveFile(identity, file); listenResumeService.compact(identity);
        if (bookmark && bookmark.position > 0) pendingSeek.current = { uri: file.uri, seconds: bookmark.position };
        awaitingAudio.current = file.uri; sourceUri.current = file.uri; setReadyAudioUri(null); setActiveAudio({ key, file });
        prepareNativeChapterPlayback(player, file.uri, playbackSpeed, {
            title: book!.chapters[index].title, artist: book!.title, albumTitle: book!.title, artworkUrl: book!.cover,
        }, playIntent.current && !pendingSeek.current);
        if (Platform.OS === 'android' && file.uri.includes('/local-pc-audio/')) {
            player.setLocalChapterQueue?.(JSON.stringify({ userId, bookId: book!.id, bookTitle: book!.title, voice: file.voice,
                endOfChapter: sleepTimer === 'EOC',
                chapters: book!.chapters.map(chapter => ({ id: chapter.id, title: chapter.title })) }));
        }
        if (changed) {
            promotedKey.current = key;
            setProvider(file.provider);
            if (file.provider === 'kokoro') setKokoroVoice(file.voice);
            else setTtsVoice(file.voice);
            cacheService.set('listen-tts-provider', file.provider);
            cacheService.set(file.provider === 'kokoro' ? 'listen-kokoro-voice' : 'listen-tts-voice', file.voice);
            setAudioNotice('Using ' + AUDIO_LABELS[file.provider] + ' (' + file.voice + '). Playback settings updated.');
        } else setAudioNotice('');
        setAudioError(''); setIsGenerating(false);
        return key;
    };

    useEffect(() => {
        if (!alive.current || !book || !currentChapter || !settingsReady || !userId || !progressReady) return;
        if (provider === 'kokoro') {
            try {
                const live = player.currentStatus as typeof status & { localChapterId?: string };
                if (live.localChapterId && live.localChapterId !== currentChapter.id && book.chapters.some(chapter => chapter.id === live.localChapterId)) {
                    void nativeReconcile.current(); return;
                }
            } catch (error) { failAudioLoad(error); return; }
        }
        if (chapterWindow.loading || chapterWindow.error || currentChapter.content === undefined) {
            activeKey.current = null; awaitingAudio.current = null; setReadyAudioUri(null); setActiveAudio(null); setIsGenerating(false);
            try { player.pause(); } catch (error) { failAudioLoad(error); }
            return;
        }
        let active = true;
        const control = new AbortController();
        const start = updateWindow(currentChapterIndex);
        const identities = book.chapters.slice(start, start + 5).filter(chapter => chapter.content !== undefined).map(chapter => identityFor(chapter));
        const current = identityFor(currentChapter);
        const currentKey = audioIdentityKey(current);
        listenAudioService.setOfflineDemand?.(currentKey, playIntent.current, stream.current?.index ?? -1);
        const allowed = new Set(identities.map(audioIdentityKey));
        const promoted = promotedKey.current === currentKey && !!tasks.current.get(currentKey)?.file;
        promotedKey.current = null;
        for (const [key, task] of Array.from(tasks.current.entries())) {
            // A manual retry or chapter jump takes priority over CPU work for
            // an upcoming chapter on the single local synthesis worker.
            if (!allowed.has(key) || (provider === 'kokoro' && key !== currentKey && !task.file)) {
                task.controller.abort(); tasks.current.delete(key);
            }
        }
        if (!promoted) {
            stream.current = null; pendingSeek.current = null;
            activeKey.current = null; awaitingAudio.current = null; setReadyAudioUri(null);
            setIsGenerating(true); setAudioError(''); switching.current = true;
            try { player.pause(); }
            catch (error) { failAudioLoad(error); return; }
        }
        const stopWaiting = (message: string) => {
            if (!active || !alive.current) return;
            active = false; control.abort(); clearTimeout(deadline);
            try { player.pause(); } catch { /* Already stopping. */ }
            tasks.current.get(currentKey)?.controller.abort(); tasks.current.delete(currentKey);
            refill.current = () => {}; playIntent.current = false; cancelGeneration.current = null;
            failAudioLoad(new Error(message));
        };
        // Long offline chapters may take minutes. Stop a stalled worker, while
        // allowing generation that continues to report completed passages.
        let deadline = setTimeout(() => stopWaiting('Audio loading timed out. Retry this chapter or select another voice.'), provider === 'kokoro' ? 180_000 : 120_000);
        const stopProgress = provider === 'kokoro' ? listenAudioService.subscribeProgress((chapterId, event) => {
            if (!active || chapterId !== current.chapterId) return;
            clearTimeout(deadline);
            if (event.phase === 'waiting' || event.phase === 'cooling') return;
            deadline = setTimeout(() => stopWaiting('Offline narration stopped responding. Tap Re-cache audio to retry.'), 180_000);
        }) : () => {};
        const cancel = () => stopWaiting('Audio loading cancelled. Tap Retry audio to try again.');
        cancelGeneration.current = cancel;
        cacheService.set('listen-progress-' + book.id, JSON.stringify({ chapterIndex: currentChapterIndex }));
        void saveProgressToDb(book.id, currentChapterIndex);
        const retained = listenAudioService.retain(identities, currentChapter.id, book.chapters[currentChapterIndex + 1]?.id);
        const activation = provider === 'kokoro' ? Promise.resolve() : listenAudioService.activate(currentChapter.id, book.chapters[start].id, control.signal).catch(() => {});
        const load = (identity: NativeAudioIdentity, prefetch = false) => {
            const key = audioIdentityKey(identity);
            const existing = tasks.current.get(key);
            if (existing && !(identity.provider === 'kokoro' && !prefetch && !existing.file && !existing.streaming)) return existing.promise;
            if (existing) { existing.controller.abort(); tasks.current.delete(key); }
            const controller = new AbortController();
            const bypass = bypassKeys.current.delete(key);
            const promise = retained.then(async () => {
                let continuation;
                if (!prefetch) {
                    const synced = await localSyncService.get(identity);
                    if (synced) {
                        listenResumeService.replaceFile(identity, synced);
                        const checkpoint = (await localSyncService.refresh?.())?.playback;
                        if (checkpoint?.userId === identity.userId && checkpoint.bookId === identity.bookId && checkpoint.chapterId === identity.chapterId && checkpoint.uri === synced.uri) {
                            const index = Math.max(0, synced.sync?.segments.findIndex(segment => checkpoint.seconds < segment.end) ?? 0);
                            listenResumeService.savePosition(identity, checkpoint.seconds, index, true);
                        }
                        return synced;
                    }
                    const bookmark = await listenResumeService.restore(identity);
                    if (!active || !alive.current || controller.signal.aborted) throw new Error('Obsolete audio request');
                    if (bookmark?.file) return { ...bookmark.file, key, requestKey: key, provider: identity.provider, voice: identity.voice, source: 'device' as const };
                    const pc = localSyncService.settings();
                    if (identity.provider === 'kokoro' && (!pc.enabled || pc.phoneFallback) && bookmark?.pieces.length && bookmark.sync && bookmark.texts.length) {
                        const restored = new ProgressiveAudio(key);
                        restored.pieces = bookmark.pieces; restored.texts = bookmark.texts; restored.sync = { ...bookmark.sync, segments: bookmark.sync.segments.slice(0, bookmark.pieces.length) };
                        const byTime = bookmark.pieces.findIndex(piece => bookmark.position < piece.end);
                        restored.index = byTime >= 0 ? byTime : Math.min(bookmark.index, bookmark.pieces.length - 1); restored.waiting = false;
                        restored.complete = bookmark.pieces.length === bookmark.texts.length;
                        stream.current = restored;
                        pendingSeek.current = { uri: restored.current!.uri, seconds: Math.max(0, Math.min(bookmark.position - restored.offset, restored.current!.end - restored.offset - 0.01)) };
                        streamPlay.current(); setAudioNotice('Resumed your saved passage.');
                        listenAudioService.setOfflineDemand?.(key, playIntent.current, restored.index);
                        const prefixUri = await listenAudioService.joinOfflinePrefix(bookmark.pieces.map(piece => piece.uri));
                        if (!active || controller.signal.aborted) { await FileSystem.deleteAsync(prefixUri, { idempotent: true }); throw new Error('Obsolete audio request'); }
                        if (restored.complete) {
                            const info = await FileSystem.getInfoAsync(prefixUri);
                            const file: NativeAudioFile = { key, requestKey: key, uri: prefixUri, bytes: info.exists ? info.size || 0 : 0, created: Date.now(), used: Date.now(),
                                provider: 'kokoro', voice: identity.voice, fallback: '', chapterId: identity.chapterId, contentType: 'audio/wav', source: 'device', sync: restored.sync, mixedVoice: true };
                            listenResumeService.saveFile(identity, file); return file;
                        }
                        continuation = { voice: bookmark.voice, index: bookmark.pieces.length, uri: prefixUri, seconds: bookmark.pieces.at(-1)!.end,
                            sync: { ...bookmark.sync, segments: bookmark.texts.map((text, index) => bookmark.sync!.segments[index] || { text, start: 0, end: 0 }) }, disposeUris: [prefixUri] };
                    }
                }
                return listenAudioService.load(identity,
                () => book.chapters[windowRef.current?.start || 0].id, controller.signal, prefetch, bypass, !prefetch && identity.provider === 'kokoro' ? (piece, sync) => {
                    if (!active || !alive.current || controller.signal.aborted || indexRef.current !== currentChapterIndex) return;
                    const currentStream = stream.current || (stream.current = new ProgressiveAudio(key));
                    if (currentStream.key !== key || !currentStream.append(piece, sync)) return;
                    listenResumeService.savePiece(identity, piece, sync, currentStream.texts || kokoroNarration(identity.content, identity.title, identity.chunkTarget).chunks);
                    if (currentStream.waiting && currentStream.advance()) streamPlay.current();
                    else {
                        setActiveAudio(previous => previous?.key === key ? { ...previous, file: { ...previous.file, sync } } : previous);
                        updateStream(value => value + 1);
                    }
                } : undefined, continuation);
            }).then(file => {
                if (controller.signal.aborted || tasks.current.get(key) !== task) throw new Error('Obsolete audio request');
                task.file = file; if (!prefetch) listenResumeService.saveFile(identity, file); return file;
            });
            const task = { controller, identity, promise, streaming: !prefetch && identity.provider === 'kokoro' } as NonNullable<ReturnType<typeof tasks.current.get>>;
            tasks.current.set(key, task);
            void promise.catch(() => { if (tasks.current.get(key) === task) tasks.current.delete(key); });
            return promise;
        };
        let filling = false;
        const fill = async () => {
            if (provider === 'kokoro' || !alive.current || !active || filling || !tasks.current.get(currentKey)?.file) return;
            filling = true;
            try {
                await activation;
                for (const chapter of book.chapters.slice(currentChapterIndex + 1, start + 5).filter(chapter => chapter.content !== undefined)) {
                    if (!alive.current || !active) return;
                    try { await load(identityFor(chapter), true); } catch { if (!active) return; }
                }
            } finally { filling = false; }
        };
        refill.current = () => { void fill(); };
        void (async () => {
            try {
                if (!promoted) {
                    await load(current);
                    if (!alive.current || !active) return;
                    if (provider === 'kokoro') {
                        const live = player.currentStatus as typeof status & { localChapterId?: string };
                        if (live.localChapterId && live.localChapterId !== current.chapterId) { void nativeReconcile.current(); return; }
                    }
                    const task = tasks.current.get(currentKey);
                    if (!task?.file) return;
                    const changed = task.file.provider !== provider || task.file.voice !== currentVoice;
                    if (stream.current?.key === currentKey) {
                        stream.current.complete = true;
                        // Keep the playing immutable piece. The merged WAV is now cached
                        // for future playback; replacing it here would restart narration.
                        updateStream(value => value + 1);
                        if (stream.current.waiting) { switching.current = false; handleAudioEnded(); }
                    } else applyFile(task, current, currentChapterIndex);
                    if (changed) return;
                }
                void fill();
            } catch (error: unknown) { if (active) failAudioLoad(error); }
            finally {
                clearTimeout(deadline);
                stopProgress();
                if (cancelGeneration.current === cancel) cancelGeneration.current = null;
                if (active) setIsGenerating(false);
            }
        })();
        return registerCleanup(() => {
            active = false; control.abort(); clearTimeout(deadline);
            const selectedTask = tasks.current.get(currentKey);
            if (selectedTask?.streaming) {
                // A completed task still owns temporary pieces until we leave.
                // A promoted next chapter may already be playing at this point.
                if (alive.current && activeKey.current === currentKey) {
                    try {
                        const live = player.currentStatus as typeof status & { localChapterId?: string };
                        if (!live.localChapterId || live.localChapterId === current.chapterId) player.pause();
                    } catch { /* Route is leaving. */ }
                }
                selectedTask.controller.abort(); tasks.current.delete(currentKey);
            }
            if (stream.current?.key === currentKey) { stream.current = null; pendingSeek.current = null; }
            stopProgress();
            if (cancelGeneration.current === cancel) cancelGeneration.current = null;
        });
    }, [book, currentChapterIndex, provider, currentVoice, grammarModel, sessionChunkTarget, settingsReady, userId, retryCount, progressReady, chapterWindow.loading, chapterWindow.error]);

    useEffect(() => {
        setGenerationLabel('');
        return listenAudioService.subscribeProgress((chapterId, event) => {
            if (!alive.current || provider !== 'kokoro' || chapterId !== currentChapter?.id) return;
            setGenerationLabel(event.phase === 'waiting' || event.phase === 'cooling' ? event.message || 'Generator resting to save battery.'
                : event.phase === 'loading' ? 'Loading offline voice…' : 'Generating offline audio: ' + Math.round(event.progress * 100) + '%');
        });
    }, [currentChapter?.id, provider, retryCount]);

    useEffect(() => {
        if (!book || !currentChapter || provider !== 'kokoro' || currentChapter.content === undefined) return;
        let active = true, checking = false;
        const identity = identityFor(currentChapter), key = audioIdentityKey(identity);
        const reload = (ready: boolean) => {
            if (!active || !alive.current) return;
            if (resumeCursor.current) { const saved = resumeCursor.current; listenResumeService.savePosition(saved.identity, saved.seconds, saved.index, true); }
            if (ready) { playIntent.current = playIntent.current || waitingForPcIntent.current; waitingForPcIntent.current = false; }
            else if (localSyncService.settings().enabled && !localSyncService.settings().phoneFallback) waitingForPcIntent.current = playIntent.current;
            tasks.current.get(key)?.controller.abort(); tasks.current.delete(key);
            activeKey.current = null; awaitingAudio.current = null; promotedKey.current = null;
            setRetryCount(value => value + 1);
        };
        const checkReady = async () => {
            if (!active || !alive.current || checking) return;
            checking = true;
            try {
                const file = await localSyncService.get(identity);
                if (file && active && alive.current && tasks.current.get(key)?.file?.uri !== file.uri) reload(true);
            } catch { /* A later event or poll can retry reading the local library. */ }
            finally { checking = false; }
        };
        const stop = localSyncService.subscribe(event => {
            if (!active || !alive.current) return;
            if (event.phase === 'settings-changed' && event.setting === 'automatic' && localSyncService.settings().automatic) {
                try { const live = player.currentStatus; if (live.playbackState === 'ended') backgroundAudioStatus.current({ ...live, didJustFinish: true }); } catch { }
            }
            if (event.phase === 'chapter-ready' && (event.key === key || event.chapterId === currentChapter.id)) { void checkReady(); return; }
            if (event.phase === 'settings-changed' && (event.setting === 'enabled' || event.setting === 'phoneFallback')) {
                const settings = localSyncService.settings();
                if (!(settings.enabled && !settings.phoneFallback && tasks.current.get(key)?.file)) reload(false);
            }
        });
        // Native download events can be missed while React is backgrounded or mounting.
        // A paused batch must never prevent a previously verified chapter from playing.
        const timer = setInterval(() => { if (!tasks.current.get(key)?.file) void checkReady(); }, 3000);
        void checkReady();
        return () => { active = false; clearInterval(timer); stop(); };
    }, [book, currentChapter?.id, provider, currentVoice, sessionChunkTarget, userId]);

    useEffect(() => {
        if (!alive.current || provider !== 'kokoro' || !book || !currentChapter) return;
        listenAudioService.setOfflineDemand?.(audioIdentityKey(identityFor(currentChapter)), playIntent.current, stream.current?.index ?? -1);
    }, [provider, currentVoice, currentChapter?.id, status.playing, playIntent.current, stream.current?.index]);

    const handleAudioEnded = () => {
        if (!alive.current) return;
        const key = activeKey.current;
        if (!key || switching.current || lastEndedKey.current === key) return;
        const currentStream = stream.current;
        if (currentStream?.key === key) {
            if (currentStream.advance()) { streamPlay.current(); return; }
            if (!currentStream.complete) {
                switching.current = true;
                setAudioNotice('Buffering the next passage…');
                audioDiagnostics.record('buffering');
                return;
            }
        }
        lastEndedKey.current = key;
        if (sleepTimer === 'EOC') { playIntent.current = false; setSleepTimer(null); runPlayerAction(() => player.pause()); return; }
        const next = indexRef.current + 1;
        if (!playIntent.current || !book || next >= book.chapters.length) { playIntent.current = false; return; }
        switching.current = true; // Preserve play intent while the next chapter loads.
        commitVoice(); updateWindow(next);
        const identity = identityFor(book.chapters[next]);
        const task = tasks.current.get(audioIdentityKey(identity));
        if (task?.file) {
            try { const actualKey = applyFile(task, identity, next); promotedKey.current = actualKey; }
            catch (error) { failAudioLoad(error); return; }
        }
        indexRef.current = next; setCurrentChapterIndex(next);
    };
    const handleBackgroundAudioStatus = (snapshot: ReturnType<typeof useForegroundAudioStatus>) => {
        if (!alive.current) return;
        const nativeQueue = (snapshot as typeof snapshot & { localChapterId?: string }).localChapterId;
        if (nativeQueue && book && userId) {
            const announcedIndex = (snapshot as typeof snapshot & { localChapterIndex?: number }).localChapterIndex;
            const previous = backgroundNativeSyncScope.current;
            const prefetch = localSyncService.settings().automatic && sleepTimer !== 'EOC';
            const candidate = (announcedIndex ?? -1) + (prefetch && (snapshot.didJustFinish || snapshot.playbackState === 'ended') ? 1 : 0);
            if (announcedIndex !== undefined && (previous.bookId !== book.id || candidate > previous.index)) {
                try {
                    const live = player.currentStatus as typeof snapshot & { localChapterId?: string; localChapterIndex?: number; localChapterUri?: string };
                    const index = live.localChapterIndex;
                    if (index !== undefined && book.chapters[index]?.id === live.localChapterId) {
                        const afterEnd = prefetch && live.playbackState === 'ended';
                        backgroundNativeSyncScope.current = { bookId: book.id, index: index + (afterEnd ? 1 : 0) };
                        void saveProgressToDb(book.id, index, true);
                        void localSyncService.prepareAhead?.(book, userId, index, handoffVoice || currentVoice, sessionChunkTarget,
                            () => alive.current && nativeScope.current.bookId === book.id && nativeScope.current.userId === userId, live.localChapterUri, afterEnd).catch(() => {});
                    }
                } catch { /* Background progress never interrupts the native audio queue. */ }
            }
        }
        if (nativeQueue && !awaitingAudio.current) return;
        if (awaitingAudio.current && snapshot.isLoaded) {
            let loaded = snapshot as typeof snapshot & { localChapterUri?: string };
            if (nativeQueue) {
                try { loaded = player.currentStatus as typeof loaded; } catch { return; }
                if (!loaded.isLoaded || loaded.localChapterUri !== awaitingAudio.current) return;
            }
            const uri = awaitingAudio.current; awaitingAudio.current = null;
            const seek = pendingSeek.current;
            if (seek?.uri === uri) {
                pendingSeek.current = null;
                void player.seekTo(seek.seconds).then(() => {
                    if (!alive.current || sourceUri.current !== uri) return;
                    setReadyAudioUri(uri);
                    if (playIntent.current) runPlayerAction(() => player.play());
                }).catch(error => { if (alive.current) failAudioLoad(error); });
            } else setReadyAudioUri(uri);
        }
        if (nativeQueue) return; // Android owns PC-queue transitions, not the hidden React screen.
        if (snapshot.playing) { switching.current = false; playIntent.current = true; }
        else if (!snapshot.didJustFinish && snapshot.isLoaded && !switching.current && snapshot.currentTime < snapshot.duration - 0.2) playIntent.current = false;
        if (provider === 'kokoro' && currentChapter && book) listenAudioService.setOfflineDemand?.(audioIdentityKey(identityFor(currentChapter)), playIntent.current, stream.current?.index ?? -1);
        if (snapshot.didJustFinish && !snapshot.playing) handleAudioEnded();
    };

    backgroundAudioStatus.current = handleBackgroundAudioStatus;

    const reconcileNativeChapter = async (): Promise<boolean> => {
        if (!alive.current || !book || !userId) return false;
        const scope = { bookId: book.id, userId };
        const readLive = () => player.currentStatus as typeof status & { localChapterId?: string; localChapterIndex?: number; localChapterUri?: string };
        try {
            const live = readLive();
            if (!live.localChapterId || !live.localChapterUri || live.localChapterIndex === undefined || book.chapters[live.localChapterIndex]?.id !== live.localChapterId) return false;
            if (indexRef.current === live.localChapterIndex && sourceUri.current === live.localChapterUri && tasks.current.get(activeKey.current || '')?.file?.uri === live.localChapterUri) {
                if (bookProgress.getChapter(book.id, live.localChapterIndex) !== live.localChapterIndex) {
                    bookProgress.saveChapter(book.id, live.localChapterIndex); void saveProgressToDb(book.id, live.localChapterIndex, true);
                }
                return true;
            }
        } catch { return false; }
        if (nativeReconcilePending.current) return nativeReconcilePending.current;
        const operation = (async () => {
            const snapshot = await localSyncService.refresh();
            if (!alive.current || nativeScope.current.bookId !== scope.bookId || nativeScope.current.userId !== scope.userId) return false;
            // Read AFTER the asynchronous file lookup: hook events can be queued from older chapters.
            const live = readLive(), index = live.localChapterIndex;
            if (index === undefined || !live.localChapterUri || book.chapters[index]?.id !== live.localChapterId) return false;
            const artifact = snapshot.artifacts.find(file => file.uri === live.localChapterUri && file.userId === userId && file.bookId === book.id && file.chapterId === live.localChapterId);
            if (!artifact) return true; // Keep native ownership during a transient library lookup failure.
            const chapter = { ...book.chapters[index], content: artifact.sync.paragraphs };
            const target = normalizeChunkTarget(artifact.chunkTarget);
            const identity = { ...identityFor(chapter, 'kokoro', artifact.voice), chunkTarget: target }, key = audioIdentityKey(identity);
            const file: NativeAudioFile = { key, requestKey: key, chapterId: chapter.id, uri: artifact.uri, bytes: artifact.bytes,
                provider: 'kokoro', voice: artifact.voice, fallback: '', contentType: 'audio/wav', source: 'device', sync: artifact.sync, created: Date.now(), used: Date.now() };
            tasks.current.set(key, { identity, file, controller: new AbortController(), promise: Promise.resolve(file) });
            chunkScope.current = { chapterId: chapter.id, target, restored: true };
            indexRef.current = index; activeKey.current = key; promotedKey.current = key;
            stream.current = null; pendingSeek.current = null; awaitingAudio.current = null; sourceUri.current = file.uri;
            playIntent.current = live.playing; switching.current = false; lastEndedKey.current = null;
            const seconds = Math.max(0, live.currentTime || 0);
            const segment = Math.max(0, artifact.sync.segments.findIndex(item => seconds < item.end));
            listenResumeService.saveFile(identity, file); listenResumeService.savePosition(identity, seconds, segment, true);
            resumeCursor.current = { identity, seconds, index: segment };
            bookProgress.saveChapter(book.id, index); void saveProgressToDb(book.id, index, true);
            cacheService.set('pc-playback-restored-' + book.id, snapshot.playback?.updated || 0);
            setActiveAudio({ key, file }); setReadyAudioUri(file.uri); setAudioError(''); setIsGenerating(false);
            setBook(previous => previous?.id === book.id ? { ...previous, chapters: previous.chapters.map((item, position) => position === index ? chapter : item) } : previous);
            setKokoroVoice(artifact.voice); setHandoffVoice(null); setCurrentChapterIndex(index);
            return true;
        })().catch(() => true);
        nativeReconcilePending.current = operation;
        try { return await operation; }
        finally { if (nativeReconcilePending.current === operation) nativeReconcilePending.current = null; }
    };
    nativeReconcile.current = reconcileNativeChapter;
    useEffect(() => {
        // Adopt the source currently owned by Android, never a queued hook event.
        void nativeReconcile.current();
    }, [(status as typeof status & { localChapterId?: string }).localChapterId, book?.id, currentChapter?.id, userId]);

    useEffect(() => {
        if (!alive.current) return;
        // The hook may still contain a queued update for the preceding file.
        // The native getter reads the current source after synchronous replace(),
        // including when the first background update arrives several seconds in.
        if (awaitingAudio.current) {
            try {
                const live = player.currentStatus as typeof status & { localChapterUri?: string };
                if (live.localChapterUri && live.localChapterUri !== awaitingAudio.current) { void nativeReconcile.current(); return; }
                if (live.isLoaded) {
                    const loadedUri = awaitingAudio.current;
                    awaitingAudio.current = null;
                    const seek = pendingSeek.current;
                    if (seek?.uri === loadedUri) {
                        pendingSeek.current = null;
                        void player.seekTo(seek.seconds).then(() => {
                            if (alive.current && sourceUri.current === loadedUri) {
                                setReadyAudioUri(loadedUri);
                                if (playIntent.current) runPlayerAction(() => player.play());
                            }
                        }).catch(error => { if (alive.current) failAudioLoad(error); });
                    } else setReadyAudioUri(loadedUri);
                }
            } catch (error) { failAudioLoad(error); }
        }
    }, [status]);
    useEffect(() => {
        if (!alive.current) return;
        if (provider === 'kokoro') {
            try {
                const live = player.currentStatus as typeof status & { localChapterId?: string };
                const nativeChapter = live.localChapterId;
                const observedChapter = (status as typeof status & { localChapterId?: string }).localChapterId;
                if (nativeChapter && (nativeChapter !== currentChapter?.id || observedChapter !== nativeChapter)) { void nativeReconcile.current(); return; }
                if (nativeChapter && live.playbackState === 'ended') { backgroundAudioStatus.current({ ...live, didJustFinish: true }); return; }
            } catch { return; }
        }
        if (status.playing) { switching.current = false; playIntent.current = true; }
        else if (!status.didJustFinish && status.isLoaded && !switching.current && status.currentTime < status.duration - 0.2) playIntent.current = false;
        if (provider === 'kokoro' && currentChapter && book) listenAudioService.setOfflineDemand?.(audioIdentityKey(identityFor(currentChapter)), playIntent.current, stream.current?.index ?? -1);
        if (status.didJustFinish && !status.playing) handleAudioEnded();
    }, [status.didJustFinish, status.playing, status.isLoaded]);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async state => {
            if (alive.current && state !== 'active') backgroundNativeSyncScope.current = { bookId: nativeScope.current.bookId, index: indexRef.current - 1 };
            if (alive.current && state !== 'active' && resumeCursor.current) { const saved = resumeCursor.current; listenResumeService.savePosition(saved.identity, saved.seconds, saved.index, true); }
            if (!alive.current || state !== 'active') return;
            const expired = syncSleepTimer();
            if (await nativeReconcile.current() || expired) return;
            if (!alive.current) return;
            refill.current();
            if (playIntent.current) {
                if (audioError || chapterWindow.error) retryAudio();
                else if (activeKey.current && !stream.current?.waiting) runPlayerAction(() => player.play());
            }
        });
        return registerCleanup(() => subscription.remove());
    }, [audioError, chapterWindow.error]);
    useEffect(() => registerCleanup(listenAudioService.subscribeEvictions(uri => {
        if (!alive.current) return;
        for (const [key, task] of Array.from(tasks.current.entries())) {
            if (task.file?.uri === uri) tasks.current.delete(key);
        }
    })), []);
    useEffect(() => registerCleanup(listenAudioService.subscribeSync(file => {
        if (!alive.current) return;
        for (const [key, task] of Array.from(tasks.current.entries())) {
            if (task.file?.uri !== file.uri || task.file.audioId !== file.audioId || task.controller.signal.aborted) continue;
            task.file = file;
            if (activeKey.current === key) setActiveAudio(previous =>
                previous?.key === key && previous.file.uri === file.uri ? { key, file } : previous);
        }
    })), []);

    const transcriptFile = activeAudio && currentChapter && activeAudio.file.chapterId === currentChapter.id ? activeAudio.file : undefined;
    const transcriptScope = `${currentChapter?.id || ''}:${stream.current?.key || transcriptFile?.uri || ''}`;
    const cues = useMemo(() => {
        const measured = buildNarrationCues(currentChapter?.content, currentChapter?.title, transcriptFile?.sync);
        if (!stream.current || !transcriptFile?.sync || !currentChapter) return measured;
        // Keep the full chapter readable while future passages are being generated.
        // Unbuffered text has no timestamp and must never be highlighted early.
        const pending = (stream.current.texts || kokoroNarration(currentChapter.content, currentChapter.title).chunks).slice(stream.current.pieces.length);
        return [...measured, ...pending.flatMap(text => buildNarrationCues(text).map(cue => ({ ...cue, start: Infinity, end: Infinity })))];
    }, [currentChapter?.id, currentChapter?.content, currentChapter?.title, transcriptFile?.sync]);
    if (cueLayoutScope.current !== transcriptScope) {
        cueLayoutScope.current = transcriptScope;
        refreshCueLayoutText(cueLayouts.current, cues);
    }
    const transcriptStatus = status;
    const observedTranscriptUri = (status as typeof status & { localChapterUri?: string }).localChapterUri;
    const activeCue = (!observedTranscriptUri || observedTranscriptUri === transcriptFile?.uri) && !isGenerating && activeKey.current === activeAudio?.key && transcriptFile?.uri === readyAudioUri && transcriptStatus.isLoaded
        ? activeNarrationCue(cues, (stream.current?.offset || 0) + transcriptStatus.currentTime, stream.current?.duration || transcriptStatus.duration) : -1;
    const cueFocus = useRef({ index: activeCue, text: cues[activeCue]?.text });
    cueFocus.current = { index: activeCue, text: cues[activeCue]?.text };
    const focusSpokenCue = useCallback((animated = true) => {
        const target = cueLayouts.current.get(cueFocus.current.index);
        if (!alive.current || !followAudioRef.current || !target || target.text !== cueFocus.current.text || !transcriptHeight.current) return;
        transcriptRef.current?.scrollTo({ y: Math.max(0, target.y - (transcriptHeight.current - target.height) / 2), animated });
    }, []);
    useEffect(() => {
        transcriptRef.current?.scrollTo({ y: 0, animated: false });
    }, [currentChapter?.id]);
    useEffect(() => { focusSpokenCue(); }, [activeCue, cues, followAudio, focusSpokenCue]);

    useEffect(() => {
        if (!alive.current || !book || !currentChapter || !activeAudio || !readyAudioUri || sourceUri.current !== readyAudioUri || !status.isLoaded || awaitingAudio.current) return;
        if (activeAudio.file.uri.includes('/local-pc-audio/')) {
            const observedUri = (status as typeof status & { localChapterUri?: string }).localChapterUri;
            if (observedUri !== activeAudio.file.uri) return;
            try { const live = player.currentStatus as typeof status & { localChapterUri?: string };
                if (live.localChapterUri && live.localChapterUri !== activeAudio.file.uri) return;
            } catch { return; }
        }
        const seconds = (stream.current?.offset || 0) + (status.currentTime || 0);
        const measured = activeAudio.file.sync?.segments;
        const measuredIndex = measured?.findIndex(segment => seconds < segment.end) ?? -1;
        const index = stream.current?.index ?? (measuredIndex >= 0 ? measuredIndex : Math.max(0, (measured?.length || 1) - 1));
        const saved = { identity: identityFor(currentChapter), seconds, index };
        resumeCursor.current = saved;
        listenResumeService.savePosition(saved.identity, seconds, index, !status.playing);
    }, [status.currentTime, status.playing, status.isLoaded, readyAudioUri, currentChapter?.id]);

    // Playback Store Subs
    const { 
        playTarget, pauseTarget, nextTarget, prevTarget, 
        setPlayerState, clearPlayerState 
    } = usePlaybackStore();

    // Listen to store actions from Notifee
    useEffect(() => {
        if (alive.current && playTarget > 0) {
            playIntent.current = true; updateStream(value => value + 1);
            if (!isPlaying && activeKey.current && !stream.current?.waiting) runPlayerAction(() => player.play());
        }
    }, [playTarget]);

    useEffect(() => {
        if (alive.current && pauseTarget > 0) {
            playIntent.current = false; updateStream(value => value + 1);
            if (isPlaying) runPlayerAction(() => player.pause());
        }
    }, [pauseTarget]);

    useEffect(() => {
        if (alive.current && nextTarget > 0) {
            // Note: Notifee "next" can either mean next chapter or skip forward. 
            // Usually media next means next chapter.
            handleNextChapter();
        }
    }, [nextTarget]);

    useEffect(() => {
        if (alive.current && prevTarget > 0) {
            handlePrevChapter();
        }
    }, [prevTarget]);

    // Update Notification Service
    useEffect(() => {
        if (!alive.current) return;
        if (status.isLoaded) {
            setPlayerState('audio', isPlaying);
            const title = book?.title || 'Audiobook';
            const chapter = currentChapter?.title || `Chapter ${currentChapterIndex + 1}`;
            playbackNotificationService.showNotification(title, chapter, isPlaying, 'audio').catch(console.error);
        } else if (!isGenerating) {
            clearPlayerState();
            playbackNotificationService.stopNotification().catch(console.error);
        }
    }, [isPlaying, status.isLoaded, currentChapterIndex, book, isGenerating]);

    const syncSleepTimer = () => {
        const deadline = nativeSleepDeadline.current;
        if (!alive.current || !deadline) return false;
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        if (remaining > 0) {
            setTimeRemaining(remaining);
            return false;
        }
        nativeSleepDeadline.current = 0;
        playIntent.current = false;
        waitingForPcIntent.current = false;
        setTimeRemaining(null);
        setSleepTimer(null);
        updateStream(value => value + 1);
        runPlayerAction(() => player.pause());
        return true;
    };

    const timedSleepActive = typeof sleepTimer === 'number';
    useEffect(() => {
        if (!timedSleepActive) return;
        const interval = setInterval(syncSleepTimer, 1000);
        return registerCleanup(() => clearInterval(interval));
    }, [timedSleepActive]);

    const formatTime = (millis: number) => {
        if (!millis || millis < 0) return "00:00";
        const seconds = Math.floor(millis / 1000);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const togglePlayPause = () => {
        if (!alive.current) return;
        if (isPlaying || (stream.current?.waiting && playIntent.current) || waitingForPcIntent.current) {
            playIntent.current = false;
            waitingForPcIntent.current = false;
            updateStream(value => value + 1);
            runPlayerAction(() => player.pause());
        } else {
            playIntent.current = true;
            updateStream(value => value + 1);
            if (audioError) retryAudio();
            else if (activeKey.current && !stream.current?.waiting) runPlayerAction(() => player.play());
        }
    };

    const seekToSeconds = (seconds: number) => {
        if (!alive.current) return;
        if (stream.current) {
            audioDiagnostics.record('seek', { seconds });
            const selected = stream.current.seek(seconds);
            if (selected) { pendingSeek.current = { uri: selected.piece.uri, seconds: selected.seconds }; streamPlay.current(); }
            return;
        }
        runPlayerAction(() => { void player.seekTo(seconds).catch(error => {
            if (alive.current) failAudioLoad(error);
        }); });
    };
    const skipForward = () => {
        seekToSeconds((stream.current?.offset || 0) + (status.currentTime || 0) + 15);
    };

    const skipBackward = () => {
        seekToSeconds(Math.max(0, (stream.current?.offset || 0) + (status.currentTime || 0) - 15));
    };

    const handleNextChapter = () => {
        if (!alive.current) return;
        if (book && currentChapterIndex < book.chapters.length - 1) {
            player.setLocalChapterQueue?.('');
            commitVoice(); updateWindow(currentChapterIndex + 1); indexRef.current = currentChapterIndex + 1;
            setCurrentChapterIndex(currentChapterIndex + 1);
        }
    };

    const handlePrevChapter = () => {
        if (!alive.current) return;
        if (currentChapterIndex > 0) {
            player.setLocalChapterQueue?.('');
            commitVoice(); updateWindow(currentChapterIndex - 1); indexRef.current = currentChapterIndex - 1;
            setCurrentChapterIndex(currentChapterIndex - 1);
        }
    };

    const openSidebar = useCallback(() => {
        setIsSidebarOpen(true);
        Animated.parallel([
            Animated.spring(sidebarAnim, { toValue: SCREEN_W - SIDEBAR_W, useNativeDriver: true, speed: 20, bounciness: 4 }),
        ]).start();
    }, [sidebarAnim]);

    const closeSidebar = useCallback(() => {
        Animated.parallel([
            Animated.timing(sidebarAnim, { toValue: SCREEN_W, duration: 250, useNativeDriver: true }),
        ]).start(() => setIsSidebarOpen(false));
    }, [sidebarAnim]);

    const changeSpeed = (newSpeed: number) => {
        if (!alive.current) return;
        setPlaybackSpeed(newSpeed);
        cacheService.set('listen-playback-speed', newSpeed.toString());
        runPlayerAction(() => player.setPlaybackRate(newSpeed));
    };

    const setTimer = (m: number | 'EOC' | null) => {
        nativeSleepDeadline.current = typeof m === 'number' ? Date.now() + m * 60_000 : 0;
        runPlayerAction(() => player.setSleepDeadline?.(nativeSleepDeadline.current));
        if (activeAudio?.file.uri.includes('/local-pc-audio/') && book) player.setLocalChapterQueue?.(JSON.stringify({ userId, bookId: book.id, bookTitle: book.title, voice: currentVoice, endOfChapter: m === 'EOC', chapters: book.chapters.map(chapter => ({ id: chapter.id, title: chapter.title })) }));
        if (m === null) {
            setSleepTimer(null);
            setTimeRemaining(null);
        } else if (m === 'EOC') {
            setSleepTimer('EOC');
            setTimeRemaining(null);
        } else {
            setSleepTimer(m);
            setTimeRemaining(m * 60);
        }
    };

    if (loading) {
        return (
            <View className={`flex-1 items-center justify-center ${th.bg}`}>
                <ActivityIndicator color="#8b5cf6" />
                <Text className={`${th.text} mt-2`}>Loading Audiobook...</Text>
            </View>
        );
    }

    if (!book) return <View className={`flex-1 items-center justify-center p-6 ${th.bg}`}>
        <Text className={`${th.text} text-center mb-4`}>{audioError || 'Audiobook unavailable.'}</Text>
        <Pressable onPress={() => { setLoading(true); void fetchBook(String(bookId)); }}><Text className="text-accent font-bold">Retry</Text></Pressable>
    </View>;

    return (
        <View collapsable={false} className={`flex-1 ${th.playerBg}`} style={{ paddingTop: Platform.OS === 'ios' ? 44 : 24 }}>
            {/* Header */}
            <View className={`px-4 py-3 flex-row justify-between items-center ${th.surface} border-b ${th.border}`}>
                <Pressable onPress={() => router.back()} className="p-1">
                    <ChevronLeft size={24} color={th.icon} />
                </Pressable>

                <View className="items-center flex-1 mx-2">
                    <Text className={`${th.text} font-bold font-serif text-sm`} numberOfLines={1}>
                        {book.title}
                    </Text>
                </View>

                <View className="flex-row items-center gap-3">
                    <Pressable onPress={() => setIsSettingsOpen(true)} className="p-1">
                        <Settings size={20} color={th.icon} />
                    </Pressable>
                    <Pressable onPress={openSidebar} className="p-1">
                        <List size={20} color={th.icon} />
                    </Pressable>
                </View>
            </View>

            {/* Main Player Area */}
            <ScrollView removeClippedSubviews={false} className="flex-1" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 20 }}>
                
                {/* Artwork */}
                <View className="w-full flex-row items-center mb-4 gap-4">
                <View className={`w-20 h-28 rounded-xl border ${th.border} overflow-hidden ${th.surface} items-center justify-center`}>
                    {book.cover ? (
                        <Image source={{ uri: book.cover }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <BookOpen size={36} color={th.icon} />
                    )}
                </View>

                {/* Chapter Info */}
                <View className="flex-1">
                <Text className={`text-xl font-bold ${th.text} mb-2`}>
                    {currentChapter?.title || 'Unknown Chapter'}
                </Text>
                <Text className={`${th.textMuted} font-medium`}>
                    Chapter {currentChapterIndex + 1} of {book.chapters.length}
                </Text>
                </View>
                </View>
                {provider === 'kokoro' && <KokoroSetup textClass={th.text} onReady={retryAudio} />}
                {provider === 'kokoro' && <LocalSyncPanel book={book} chapterIndex={currentChapterIndex} userId={userId} voice={handoffVoice || currentVoice} chunkTarget={sessionChunkTarget} />}
                <Pressable accessibilityRole="button" accessibilityLabel="Re-cache current chapter audio" onPress={() => { void reCacheAudio(); }} disabled={isRecaching || chapterWindow.loading} className="self-center py-2 mb-2">
                    <Text className="text-accent font-bold">{isRecaching ? 'Clearing saved audio…' : 'Re-cache audio'}</Text>
                </Pressable>
                {/* Status / Timer */}
                {!!audioNotice && <Text accessibilityLiveRegion="polite" className={`${th.textMuted} text-xs text-center mb-3`}>{audioNotice}</Text>}
                {!!(audioError || chapterWindow.error) && <View className="items-center mb-4"><Text accessibilityRole="alert" className="text-red-400 text-center mb-2">{chapterWindow.error || audioError}</Text>
                    <Pressable accessibilityLabel="Retry chapter audio" onPress={retryAudio}><Text className="text-accent font-bold">Retry audio</Text></Pressable></View>}
                {(isGenerating || (stream.current && !stream.current.complete) || chapterWindow.loading || timeRemaining !== null || sleepTimer === 'EOC') && (
                    <View className="mb-4 flex-row items-center justify-center">
                        {(isGenerating || (stream.current && !stream.current.complete) || chapterWindow.loading) && (
                            <View className="flex-row items-center bg-accent/20 px-4 py-2 rounded-full">
                                {!(/resting|paused|cooling/i.test(generationLabel)) && <ActivityIndicator size="small" color="#8b5cf6" />}
                                <Text className="ml-2 text-accent font-bold text-xs">{chapterWindow.loading ? 'Loading chapter...' : generationLabel || (provider === 'kokoro' ? 'Generating offline audio…' : 'Generating Audio...')}</Text>
                                {(isGenerating || (stream.current && !stream.current.complete)) && <Pressable accessibilityLabel="Cancel audio loading" onPress={() => cancelGeneration.current?.()} className="ml-3"><Text className="text-accent font-bold text-xs">Cancel</Text></Pressable>}
                            </View>
                        )}
                        {!isGenerating && timeRemaining !== null && (
                            <View className="flex-row items-center border border-accent/50 px-4 py-2 rounded-full">
                                <Clock size={14} color="#8b5cf6" />
                                <Text className="ml-2 text-accent font-bold text-xs">{formatTime(timeRemaining * 1000)}</Text>
                            </View>
                        )}
                        {!isGenerating && sleepTimer === 'EOC' && (
                            <View className={`flex-row items-center border ${th.border} px-4 py-2 rounded-full`}>
                                <Text className={`${th.textMuted} font-bold text-xs`}>Sleep at End of Chapter</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Progress Bar */}
                <View className="w-full max-w-sm flex-row items-center gap-2 mb-3">
                    <Text className={`${th.textMuted} text-xs font-mono w-11 text-right`}>{formatTime(positionMillis)}</Text>
                    <Slider
                        style={{ flex: 1, height: 40 }}
                        minimumValue={0}
                        maximumValue={durationMillis > 0 ? durationMillis : 100}
                        value={positionMillis}
                        onSlidingComplete={(val) => {
                            seekToSeconds(val / 1000);
                        }}
                        minimumTrackTintColor="#8b5cf6"
                        maximumTrackTintColor={isLightMode ? "#e5e5e0" : "#4a5568"}
                        thumbTintColor="#8b5cf6"
                    />
                    <Text className={`${th.textMuted} text-xs font-mono w-11`}>{formatTime(durationMillis)}</Text>
                </View>

                {/* Controls */}
                <View className="flex-row items-center justify-center gap-8">
                    <TouchableOpacity onPress={skipBackward} className="p-3">
                        <SkipBack size={32} color={th.icon} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={togglePlayPause}
                        disabled={chapterWindow.loading}
                        className={`w-16 h-16 rounded-full bg-accent items-center justify-center shadow-lg ${chapterWindow.loading ? 'opacity-50' : ''}`}
                        style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 }}
                    >
                        {(isPlaying || (stream.current?.waiting && playIntent.current) || waitingForPcIntent.current) ? <PauseIcon size={36} color="#fff" /> : <Play size={36} color="#fff" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={skipForward} className="p-3">
                        <SkipForward size={32} color={th.icon} />
                    </TouchableOpacity>
                </View>

                {/* Chapter Navigation */}
                <View className="flex-row items-center justify-between w-full max-w-sm mt-5 mb-5 px-6">
                    <TouchableOpacity 
                        onPress={handlePrevChapter} 
                        disabled={currentChapterIndex === 0}
                        className={`flex-row items-center ${currentChapterIndex === 0 ? 'opacity-30' : ''}`}
                    >
                        <ChevronLeft size={20} color={th.icon} />
                        <Text className={`${th.textSec} font-bold ml-1`}>Prev</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        onPress={handleNextChapter} 
                        disabled={currentChapterIndex === book.chapters.length - 1}
                        className={`flex-row items-center ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-30' : ''}`}
                    >
                        <Text className={`${th.textSec} font-bold mr-1`}>Next</Text>
                        <ChevronLeft size={20} color={th.icon} style={{ transform: [{ rotate: '180deg'}] }} />
                    </TouchableOpacity>
                </View>
                <ListenTranscript cues={cues} activeCue={activeCue} light={isLightMode}
                    height={Math.min(340, Dimensions.get('window').height * 0.38)} follow={followAudio} scrollRef={transcriptRef}
                    onFollow={() => { const follow = !followAudioRef.current; followAudioRef.current = follow; setFollowAudio(follow); if (follow) focusSpokenCue(); }}
                    onDrag={() => { followAudioRef.current = false; setFollowAudio(false); }}
                    onViewport={height => { transcriptHeight.current = height; focusSpokenCue(false); }}
                    onContentLayout={() => focusSpokenCue(false)}
                    onCueLayout={(index, text, y, height) => {
                        if (cueLayoutScope.current !== transcriptScope) return;
                        cueLayouts.current.set(index, { text, y, height });
                        if (cueFocus.current.index === index) focusSpokenCue(false);
                    }} />
            </ScrollView>

            {/* Sidebar */}
            {isSidebarOpen && (
                <Pressable onPress={closeSidebar} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 998 }} />
            )}
            <Animated.View
                style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width: SIDEBAR_W,
                    transform: [{ translateX: sidebarAnim }],
                    zIndex: 999,
                }}
            >
                <View className={`flex-1 border-l ${th.border} ${th.surface}`} style={{ paddingTop: Platform.OS === 'ios' ? 50 : 40 }}>
                    <View className={`px-4 pb-4 border-b ${th.border} flex-row items-center justify-between`}>
                        <Text className={`${th.text} text-base font-bold font-serif`}>Listening Index</Text>
                        <TouchableOpacity onPress={closeSidebar} className="p-1">
                            <X size={20} color={th.icon} />
                        </TouchableOpacity>
                    </View>
                    <ChapterIndexList
                        data={book.chapters}
                        open={isSidebarOpen}
                        selectedIndex={currentChapterIndex}
                        keyExtractor={item => item.id}
                        renderItem={({ item, index }) => {
                            const isActive = index === currentChapterIndex;
                            return (
                                <TouchableOpacity
                                    onPress={() => { player.setLocalChapterQueue?.(''); commitVoice(); updateWindow(index); indexRef.current = index; setCurrentChapterIndex(index); closeSidebar(); }}
                                    style={{ flex: 1, justifyContent: 'center' }}
                                    className={`px-4 border-b border-border/20 ${isActive ? 'bg-accent/20 border-l-2 border-l-accent pl-3' : ''}`}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ flex: 1 }} className={`text-sm font-serif ${isActive ? 'text-accent font-bold' : th.textSec}`} numberOfLines={2}>
                                        {index + 1}. {item.title}
                                    </Text>
                                    {offlineChapterIds.has(item.id) && <Text accessibilityLabel="Audio saved on this device"
                                        style={{ color: isLightMode ? '#047857' : '#6ee7b7', fontSize: 11, fontWeight: '600' }}>● Offline</Text>}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </Animated.View>

            {/* Settings Modal */}
            <Modal visible={isSettingsOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/60">
                    <ScrollView className={`${th.surface} rounded-t-3xl p-6 max-h-[90%] border-t ${th.border}`} contentContainerStyle={{ paddingBottom: 40 }}>
                        <Text className={`text-2xl font-bold ${th.text} font-serif mb-6`}>Audio Settings</Text>
                        <Pressable accessibilityRole="button" onPress={() => { setIsSettingsOpen(false); router.push('/diagnostics' as any); }} className="py-3 mb-4"><Text className="text-accent font-bold">Diagnostics · crash reports and debug logs</Text></Pressable>
                        
                        {/* Speed */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Playback Speed</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                                <TouchableOpacity 
                                    key={r}
                                    onPress={() => changeSpeed(r)}
                                    className={`px-4 py-2 rounded-lg border ${playbackSpeed === r ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${playbackSpeed === r ? 'text-white' : th.textSec}`}>{r}x</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <Text className={`${th.textSec} font-bold mb-3`}>Audio provider</Text>
                        <View className="flex-row flex-wrap gap-2 mb-3">{(['kokoro', 'google'] as AudioProvider[]).map(value => (
                            <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Use ${AUDIO_LABELS[value]}`}
                                onPress={() => { setProvider(value); if (value === 'kokoro') { setGrammarModel('OFF'); cacheService.set('listen-grammar-model', 'OFF'); } cacheService.set('listen-tts-provider', value); }}
                                className={`px-3 py-2 rounded-lg border ${provider === value ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}>
                                <Text className={provider === value ? 'text-white font-bold' : th.textSec}>{AUDIO_LABELS[value]}</Text>
                            </TouchableOpacity>
                        ))}</View>
                        <Text className={`${th.textMuted} text-xs mb-5`}>Kokoro generates privately on this phone, buffering only two passages ahead. Generation rests when paused or hot. Google requires an internet connection.</Text>
                        {provider === 'kokoro' && <View className="mb-6">
                            <Text className={`${th.textSec} font-bold mb-3`}>Target characters per chunk</Text>
                            <View className="flex-row flex-wrap gap-2 mb-3">
                                {[400, 600, 1000, 1500, 2000].map(size => <Pressable key={size} accessibilityRole="button" accessibilityLabel={size + ' characters per chunk'}
                                    onPress={() => { cacheService.set('listen-chunk-target', size); setPreferredChunkTarget(size); setChunkTargetInput(String(size)); setChunkTargetError(''); }}
                                    className={`px-3 py-2 rounded-lg border ${preferredChunkTarget === size ? 'bg-accent border-accent' : th.border}`}>
                                    <Text className={preferredChunkTarget === size ? 'text-white font-bold' : th.textSec}>{size}</Text>
                                </Pressable>)}
                            </View>
                            <TextInput accessibilityLabel="Custom target characters per chunk" keyboardType="number-pad" maxLength={4}
                                value={chunkTargetInput} onChangeText={setChunkTargetInput} placeholder="200–2000" placeholderTextColor={th.icon}
                                style={{ color: th.icon, borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 8, padding: 10 }} />
                            <Pressable accessibilityRole="button" onPress={() => {
                                const size = Number(chunkTargetInput);
                                if (!Number.isInteger(size) || size < 200 || size > 2000) { setChunkTargetError('Enter a whole number from 200 to 2000.'); return; }
                                cacheService.set('listen-chunk-target', size); setPreferredChunkTarget(size); setChunkTargetError('');
                            }} className="py-3"><Text className="text-accent font-bold">Save chunk size</Text></Pressable>
                            {!!chunkTargetError && <Text accessibilityRole="alert" className="text-red-400 mb-2">{chunkTargetError}</Text>}
                            <Text className={`${th.textMuted} text-xs`}>Smaller chunks start sooner. Larger chunks have fewer transitions. Paragraphs stay whole up to 4,000 characters; longer paragraphs continue in later chunks without losing text.</Text>
                            <Text className={`${th.textMuted} text-xs mt-2`}>Saved target: {preferredChunkTarget}. This chapter: {sessionChunkTarget}. Changes apply to new chapters; use Re-cache audio to apply now and restart this chapter.</Text>
                        </View>}
                        {/* Voice */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Target Voice (Accent)</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {AUDIO_VOICES[provider].map(voice => ({ id: voice, label: provider === 'kokoro' ? KOKORO_VOICES[voice as keyof typeof KOKORO_VOICES] : voice === 'en' ? 'Default' : voice })).map(v => (
                                <TouchableOpacity 
                                    key={v.id}
                                    onPress={() => {
                                        if (provider === 'kokoro') { void changeKokoroVoice(v.id); return; }
                                        else setTtsVoice(v.id);
                                        cacheService.set('listen-tts-voice', v.id);
                                    }}
                                    className={`px-4 py-2 rounded-lg border ${(provider === 'kokoro' ? handoffVoice || currentVoice : currentVoice) === v.id ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${currentVoice === v.id ? 'text-white' : th.textSec}`}>{v.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* AI Model */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Grammar Model</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {(provider === 'kokoro' ? ['OFF'] : ['OFF', 'gpt-4o-mini', 'pollinations', 'ollama']).map(m => (
                                <TouchableOpacity 
                                    key={m}
                                    onPress={() => {
                                        setGrammarModel(m);
                                        cacheService.set('listen-grammar-model', m);
                                    }}
                                    className={`px-3 py-2 rounded-lg border ${grammarModel === m ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${grammarModel === m ? 'text-white' : th.textSec}`}>{m === 'OFF' ? 'Disabled' : m.replace('gpt-4o-mini', 'GPT-4o')}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Sleep Timer */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Sleep Timer</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {[15, 30, 45, 60].map(m => (
                                <TouchableOpacity 
                                    key={m}
                                    onPress={() => setTimer(m)}
                                    className={`px-3 py-2 rounded-lg border ${sleepTimer === m ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${sleepTimer === m ? 'text-white' : th.textSec}`}>{m}m</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity onPress={() => setTimer('EOC')} className={`px-3 py-2 rounded-lg border ${sleepTimer === 'EOC' ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}>
                                <Text className={`font-bold ${sleepTimer === 'EOC' ? 'text-white' : th.textSec}`}>Chapter End</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setTimer(null)} className={`px-3 py-2 rounded-lg border ${sleepTimer === null ? 'bg-red-500 border-red-500' : `${th.bg} ${th.border}`}`}>
                                <Text className={`font-bold ${sleepTimer === null ? 'text-white' : th.textSec}`}>Off</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                            onPress={() => setIsSettingsOpen(false)} 
                            className="w-full bg-accent p-4 rounded-xl items-center shadow-lg mt-4"
                            style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }}
                        >
                            <Text className="text-white font-bold text-lg">Close Settings</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}
