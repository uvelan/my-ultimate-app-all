import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, Pressable, ActivityIndicator,
    Modal, Animated, Dimensions, Platform, TouchableOpacity, FlatList, Image, ScrollView, AppState
} from 'react-native';
import {
    ChevronLeft, List, SkipBack, SkipForward, Play, Pause as PauseIcon, X, Settings, Clock, BookOpen
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import Slider from '@react-native-community/slider';
import { api } from '@/src/lib/api-client';
import { cacheService } from '@/src/lib/storage';
import { usePlaybackStore } from '@/src/store/playbackStore';
import { playbackNotificationService } from '@/src/services/playback-notification.service';
import { AUDIO_LABELS, AUDIO_VOICES, AudioProvider, NativeAudioIdentity, audioIdentityKey, nextAudioWindowStart, prepareNativeChapterPlayback } from '@/src/lib/listen-audio';
import { listenAudioService, NativeAudioFile } from '@/src/services/listen-audio.service';
import { buildNarrationCues, activeNarrationCue } from '@/src/lib/narration-sync';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.75);

interface Chapter {
    id: string;
    title: string;
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
            alive.current = false;
            playIntent.current = false; activeKey.current = null; promotedKey.current = null; awaitingAudio.current = null;
            refill.current = () => {};
            for (const cancel of Array.from(lifetimeCleanups.current)) cancel();
            for (const task of Array.from(tasks.current.values())) task.controller.abort();
            tasks.current.clear();
            playbackNotificationService.stopNotification().catch(() => {});
        };
    }, []);
    
    // Audio Player hook integration
    const player = useAudioPlayer(null);
    const status = useAudioPlayerStatus(player);
    const isPlaying = status.playing;
    const positionMillis = (status.currentTime || 0) * 1000;
    const durationMillis = (status.duration || 0) * 1000;
    
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Settings
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [grammarModel, setGrammarModel] = useState("OFF");
    const [ttsVoice, setTtsVoice] = useState("en");
    const [provider, setProvider] = useState<AudioProvider>('google');
    const [mimoVoice, setMimoVoice] = useState('Mia');
    const [geminiVoice, setGeminiVoice] = useState('Kore');
    const [settingsReady, setSettingsReady] = useState(false);
    const [userId, setUserId] = useState('');
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
    const playIntent = useRef(false);
    const indexRef = useRef(currentChapterIndex); indexRef.current = currentChapterIndex;
    const windowRef = useRef<{ bookId: string; start: number; current: number } | null>(null);
    const tasks = useRef(new Map<string, { controller: AbortController; identity: NativeAudioIdentity; promise: Promise<NativeAudioFile>; file?: NativeAudioFile }>());
    const activeKey = useRef<string | null>(null);
    const promotedKey = useRef<string | null>(null);
    const lastEndedKey = useRef<string | null>(null);
    const refill = useRef<() => void>(() => {});
    const bypassKeys = useRef(new Set<string>());
    const currentVoice = provider === 'gemini' ? geminiVoice : provider === 'xiaomi' ? mimoVoice : ttsVoice;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Timer State
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
        
        const storedSpeed = cacheService.get('listen-playback-speed');
        if (storedSpeed) setPlaybackSpeed(Number(storedSpeed));
        
        const storedGrammar = cacheService.get('listen-grammar-model');
        if (storedGrammar) setGrammarModel(storedGrammar);
        
        const storedVoice = cacheService.get('listen-tts-voice');
        const storedProvider = cacheService.get('listen-tts-provider');
        if (storedVoice?.startsWith('gemini-') && (!storedProvider || storedProvider === 'google')) {
            setProvider('gemini'); cacheService.set('listen-tts-provider', 'gemini'); cacheService.set('listen-tts-voice', 'en');
        } else {
            if (AUDIO_VOICES.google.includes(storedVoice || '')) setTtsVoice(storedVoice!);
            if (storedProvider === 'gemini' || storedProvider === 'xiaomi' || storedProvider === 'google') setProvider(storedProvider);
        }
        const storedMimo = cacheService.get('listen-mimo-voice');
        const storedGemini = cacheService.get('listen-gemini-voice');
        if (AUDIO_VOICES.xiaomi.includes(storedMimo || '')) setMimoVoice(storedMimo!);
        if (AUDIO_VOICES.gemini.includes(storedGemini || '')) setGeminiVoice(storedGemini!);
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
        try {
            const [res, profile] = await Promise.all([api.get(`/books/${id}`, { signal }), api.get('/auth/profile', { signal })]);
            if (!alive.current || signal?.aborted) return;
            const data = res.data;
            setUserId(profile.data.id || profile.data.email);
            setBook({ ...data, chapters: data.chapters || [] });
            
            let finalIdx = data.chapterId || 0;
            const savedProgress = cacheService.get(`listen-progress-${id}`);
            if (savedProgress) {
                try {
                    const parsed = JSON.parse(savedProgress);
                    if (typeof parsed.chapterIndex === 'number' && parsed.chapterIndex > finalIdx) {
                        finalIdx = parsed.chapterIndex;
                        saveProgressToDb(id, finalIdx);
                    }
                } catch (e) {}
            }
            setCurrentChapterIndex(Math.max(0, Math.min(finalIdx, (data.chapters?.length || 1) - 1)));
        } catch (error) {
            if (!alive.current || signal?.aborted) return;
            console.error('Error loading book', error);
            setAudioError('Unable to load this audiobook. Please retry or sign in again.');
        } finally {
            if (alive.current && !signal?.aborted) setLoading(false);
        }
    };

    const saveProgressToDb = async (id: string, index: number) => {
        try {
            await api.patch(`/books/${id}`, { chapterId: index, sentenceId: 0 });
        } catch (error) {}
    };

    const currentChapter = book?.chapters[currentChapterIndex];
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
        provider: selectedProvider, voice, grammarModel,
    });
    const applyFile = (task: NonNullable<ReturnType<typeof tasks.current.get>>, identity: NativeAudioIdentity, index: number) => {
        if (!alive.current || task.controller.signal.aborted) return null;
        const file = task.file!;
        const actual = { ...identity, provider: file.provider, voice: file.voice };
        const key = audioIdentityKey(actual);
        const changed = provider !== file.provider || currentVoice !== file.voice;
        tasks.current.delete(audioIdentityKey(identity)); tasks.current.set(key, task); task.identity = actual;
        activeKey.current = key; lastEndedKey.current = null; switching.current = true;
        awaitingAudio.current = file.uri; setReadyAudioUri(null); setActiveAudio({ key, file });
        prepareNativeChapterPlayback(player, file.uri, playbackSpeed, {
            title: book!.chapters[index].title, artist: book!.title, albumTitle: book!.title, artworkUrl: book!.cover,
        }, playIntent.current);
        if (changed) {
            promotedKey.current = key;
            setProvider(file.provider);
            if (file.provider === 'gemini') setGeminiVoice(file.voice);
            else if (file.provider === 'xiaomi') setMimoVoice(file.voice);
            else setTtsVoice(file.voice);
            cacheService.set('listen-tts-provider', file.provider);
            cacheService.set(file.provider === 'gemini' ? 'listen-gemini-voice' : file.provider === 'xiaomi' ? 'listen-mimo-voice' : 'listen-tts-voice', file.voice);
            setAudioNotice('Using ' + AUDIO_LABELS[file.provider] + ' (' + file.voice + '). Playback settings updated.');
        } else setAudioNotice('');
        setAudioError(''); setIsGenerating(false);
        return key;
    };

    useEffect(() => {
        if (!alive.current || !book || !currentChapter || !settingsReady || !userId) return;
        let active = true;
        const control = new AbortController();
        const start = updateWindow(currentChapterIndex);
        const identities = book.chapters.slice(start, start + 5).map(chapter => identityFor(chapter));
        const current = identityFor(currentChapter);
        const currentKey = audioIdentityKey(current);
        const allowed = new Set(identities.map(audioIdentityKey));
        const promoted = promotedKey.current === currentKey && !!tasks.current.get(currentKey)?.file;
        promotedKey.current = null;
        for (const [key, task] of Array.from(tasks.current.entries())) {
            if (!allowed.has(key)) { task.controller.abort(); tasks.current.delete(key); }
        }
        if (!promoted) { switching.current = true; player.pause(); activeKey.current = null; setIsGenerating(true); setAudioError(''); }
        cacheService.set('listen-progress-' + book.id, JSON.stringify({ chapterIndex: currentChapterIndex }));
        void saveProgressToDb(book.id, currentChapterIndex);
        const retained = listenAudioService.retain(identities, currentChapter.id, book.chapters[currentChapterIndex + 1]?.id);
        const activation = listenAudioService.activate(currentChapter.id, book.chapters[start].id, control.signal).catch(() => {});
        const load = (identity: NativeAudioIdentity, prefetch = false) => {
            const key = audioIdentityKey(identity);
            const existing = tasks.current.get(key);
            if (existing) return existing.promise;
            const controller = new AbortController();
            const bypass = bypassKeys.current.delete(key);
            const promise = retained.then(() => listenAudioService.load(identity,
                () => book.chapters[windowRef.current?.start || 0].id, controller.signal, prefetch, bypass)).then(file => {
                if (controller.signal.aborted || tasks.current.get(key) !== task) throw new Error('Obsolete audio request');
                task.file = file; return file;
            });
            const task = { controller, identity, promise } as NonNullable<ReturnType<typeof tasks.current.get>>;
            tasks.current.set(key, task);
            void promise.catch(() => { if (tasks.current.get(key) === task) tasks.current.delete(key); });
            return promise;
        };
        let filling = false;
        const fill = async () => {
            if (!alive.current || !active || filling || !tasks.current.get(currentKey)?.file) return;
            filling = true;
            try {
                await activation;
                for (const chapter of book.chapters.slice(currentChapterIndex + 1, start + 5)) {
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
                    const task = tasks.current.get(currentKey);
                    if (!task?.file) return;
                    const changed = task.file.provider !== provider || task.file.voice !== currentVoice;
                    applyFile(task, current, currentChapterIndex);
                    if (changed) return;
                }
                void fill();
            } catch (error: any) { if (active) setAudioError(error?.message || 'Unable to download narration. Retry this chapter.'); }
            finally { if (active) setIsGenerating(false); }
        })();
        return registerCleanup(() => { active = false; control.abort(); });
    }, [book, currentChapterIndex, provider, currentVoice, grammarModel, settingsReady, userId, retryCount]);

    const handleAudioEnded = () => {
        if (!alive.current) return;
        const key = activeKey.current;
        if (!key || switching.current || lastEndedKey.current === key) return;
        lastEndedKey.current = key;
        if (sleepTimer === 'EOC') { playIntent.current = false; setSleepTimer(null); player.pause(); return; }
        const next = indexRef.current + 1;
        if (!playIntent.current || !book || next >= book.chapters.length) { playIntent.current = false; return; }
        updateWindow(next);
        const identity = identityFor(book.chapters[next]);
        const task = tasks.current.get(audioIdentityKey(identity));
        if (task?.file) { const actualKey = applyFile(task, identity, next); promotedKey.current = actualKey; }
        indexRef.current = next; setCurrentChapterIndex(next);
    };
    useEffect(() => {
        if (!alive.current) return;
        // The hook may still contain a queued update for the preceding file.
        // The native getter reads the current source after synchronous replace(),
        // including when the first background update arrives several seconds in.
        if (awaitingAudio.current && player.currentStatus.isLoaded) {
            setReadyAudioUri(awaitingAudio.current); awaitingAudio.current = null;
        }
    }, [status]);
    useEffect(() => {
        if (!alive.current) return;
        if (status.playing) { switching.current = false; playIntent.current = true; }
        else if (!status.didJustFinish && status.isLoaded && !switching.current && status.currentTime < status.duration - 0.2) playIntent.current = false;
        if (status.didJustFinish && !status.playing) handleAudioEnded();
    }, [status.didJustFinish, status.playing, status.isLoaded]);
    useEffect(() => {
        const subscription = AppState.addEventListener('change', state => {
            if (!alive.current || state !== 'active') return;
            refill.current();
            if (playIntent.current) {
                if (audioError) setRetryCount(value => value + 1);
                else if (activeKey.current) player.play();
            }
        });
        return registerCleanup(() => subscription.remove());
    }, [audioError]);
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
    const transcriptScope = `${currentChapter?.id || ''}:${transcriptFile?.uri || ''}`;
    if (cueLayoutScope.current !== transcriptScope) {
        cueLayoutScope.current = transcriptScope; cueLayouts.current.clear();
    }
    const cues = useMemo(() => buildNarrationCues(currentChapter?.content, currentChapter?.title, transcriptFile?.sync),
        [currentChapter?.id, currentChapter?.content, currentChapter?.title, transcriptFile?.sync]);
    const transcriptStatus = alive.current ? player.currentStatus : status;
    const activeCue = !isGenerating && activeKey.current === activeAudio?.key && transcriptFile?.uri === readyAudioUri && transcriptStatus.isLoaded
        ? activeNarrationCue(cues, transcriptStatus.currentTime, transcriptStatus.duration) : -1;
    const cueFocus = useRef({ index: activeCue, text: cues[activeCue]?.text });
    cueFocus.current = { index: activeCue, text: cues[activeCue]?.text };
    const focusSpokenCue = useCallback((animated = true) => {
        const target = cueLayouts.current.get(cueFocus.current.index);
        if (!alive.current || !followAudioRef.current || !target || target.text !== cueFocus.current.text || !transcriptHeight.current) return;
        transcriptRef.current?.scrollTo({ y: Math.max(0, target.y - (transcriptHeight.current - target.height) / 2), animated });
    }, []);
    useEffect(() => {
        followAudioRef.current = true; setFollowAudio(true);
        transcriptRef.current?.scrollTo({ y: 0, animated: false });
    }, [currentChapter?.id, transcriptFile?.uri]);
    useEffect(() => { focusSpokenCue(); }, [activeCue, cues, followAudio, focusSpokenCue]);

    // Playback Store Subs
    const { 
        playTarget, pauseTarget, nextTarget, prevTarget, 
        setPlayerState, clearPlayerState 
    } = usePlaybackStore();

    // Listen to store actions from Notifee
    useEffect(() => {
        if (alive.current && playTarget > 0) {
            playIntent.current = true;
            if (!isPlaying) player.play();
        }
    }, [playTarget]);

    useEffect(() => {
        if (alive.current && pauseTarget > 0) {
            playIntent.current = false;
            if (isPlaying) player.pause();
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
            playbackNotificationService.showNotification(title, chapter, isPlaying).catch(console.error);
        } else if (!isGenerating) {
            clearPlayerState();
            playbackNotificationService.stopNotification().catch(console.error);
        }
    }, [isPlaying, status.isLoaded, currentChapterIndex, book, isGenerating]);

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            if (!alive.current) return;
            setTimeRemaining(prev => {
                if (!alive.current) return prev;
                if (prev === null) return null;
                if (prev > 0) return prev - 1;

                playIntent.current = false;
                player.pause();
                setSleepTimer(null);
                return null;
            });
        }, 1000);
        return registerCleanup(() => clearInterval(interval));
    }, [timeRemaining]);

    const formatTime = (millis: number) => {
        if (!millis || millis < 0) return "00:00";
        const seconds = Math.floor(millis / 1000);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const togglePlayPause = () => {
        if (!alive.current) return;
        if (isPlaying) {
            playIntent.current = false;
            player.pause();
        } else {
            playIntent.current = true;
            if (activeKey.current) player.play();
            else if (audioError) setRetryCount(value => value + 1);
        }
    };

    const seekToSeconds = (seconds: number) => {
        if (!alive.current) return;
        void player.seekTo(seconds).catch(error => {
            if (alive.current) setAudioError(error?.message || 'Unable to seek narration.');
        });
    };
    const skipForward = () => {
        seekToSeconds((status.currentTime || 0) + 15);
    };

    const skipBackward = () => {
        seekToSeconds(Math.max(0, (status.currentTime || 0) - 15));
    };

    const handleNextChapter = () => {
        if (!alive.current) return;
        if (book && currentChapterIndex < book.chapters.length - 1) {
            updateWindow(currentChapterIndex + 1); indexRef.current = currentChapterIndex + 1;
            setCurrentChapterIndex(currentChapterIndex + 1);
        }
    };

    const handlePrevChapter = () => {
        if (!alive.current) return;
        if (currentChapterIndex > 0) {
            updateWindow(currentChapterIndex - 1); indexRef.current = currentChapterIndex - 1;
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
        player.setPlaybackRate(newSpeed);
    };

    const setTimer = (m: number | 'EOC' | null) => {
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
        <View className={`flex-1 ${th.playerBg}`} style={{ paddingTop: Platform.OS === 'ios' ? 44 : 24 }}>
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
            <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 20 }}>
                
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

                {/* Status / Timer */}
                {!!audioNotice && <Text accessibilityLiveRegion="polite" className={`${th.textMuted} text-xs text-center mb-3`}>{audioNotice}</Text>}
                {!!audioError && <View className="items-center mb-4"><Text accessibilityRole="alert" className="text-red-400 text-center mb-2">{audioError}</Text>
                    <Pressable accessibilityLabel="Retry chapter audio" onPress={() => {
                        const key = activeKey.current;
                        if (key) { tasks.current.get(key)?.controller.abort(); tasks.current.delete(key); bypassKeys.current.add(key); }
                        setRetryCount(value => value + 1);
                    }}><Text className="text-accent font-bold">Retry audio</Text></Pressable></View>}
                {(isGenerating || timeRemaining !== null || sleepTimer === 'EOC') && (
                    <View className="mb-4 flex-row items-center justify-center">
                        {isGenerating && (
                            <View className="flex-row items-center bg-accent/20 px-4 py-2 rounded-full">
                                <ActivityIndicator size="small" color="#8b5cf6" />
                                <Text className="ml-2 text-accent font-bold text-xs">Generating Audio...</Text>
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
                        disabled={isGenerating}
                        className={`w-16 h-16 rounded-full bg-accent items-center justify-center shadow-lg ${isGenerating ? 'opacity-50' : ''}`}
                        style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 }}
                    >
                        {isPlaying ? <PauseIcon size={36} color="#fff" /> : <Play size={36} color="#fff" style={{ marginLeft: 6 }} />}
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
                <View className={`w-full rounded-xl border ${th.border} ${th.surface} overflow-hidden`}>
                    <View className={`flex-row items-center justify-between px-4 py-3 border-b ${th.border}`}>
                        <Text className={`${th.text} font-bold`}>Chapter text</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel="Follow spoken text"
                            onPress={() => { followAudioRef.current = true; setFollowAudio(true); focusSpokenCue(); }}
                            hitSlop={8}>
                            <Text className={followAudio ? th.textMuted : 'text-accent font-bold'}>{followAudio ? 'Following audio' : 'Follow audio'}</Text>
                        </Pressable>
                    </View>
                    <ScrollView key={transcriptScope} ref={transcriptRef} nestedScrollEnabled style={{ height: Math.min(340, Dimensions.get('window').height * 0.38) }}
                        contentContainerStyle={{ padding: 12 }}
                        onLayout={event => { transcriptHeight.current = event.nativeEvent.layout.height; focusSpokenCue(false); }}
                        onScrollBeginDrag={() => { followAudioRef.current = false; setFollowAudio(false); }}>
                        {cues.length ? cues.map((cue, index) => (
                            <View key={`${currentChapter?.id}-${index}-${cue.text}`}
                                onLayout={event => {
                                    const { y, height } = event.nativeEvent.layout;
                                    cueLayouts.current.set(index, { text: cue.text, y, height });
                                    if (cueFocus.current.index === index) focusSpokenCue(false);
                                }}
                                className={`rounded-lg px-3 py-2 mb-1 ${index === activeCue ? 'bg-accent/20' : ''}`}>
                                <Text accessibilityState={{ selected: index === activeCue }}
                                    className={`text-base leading-7 ${index === activeCue ? 'text-accent font-semibold' : th.textSec}`}>
                                    {cue.text}
                                </Text>
                            </View>
                        )) : <Text className={`${th.textMuted} p-3`}>Chapter text is unavailable.</Text>}
                    </ScrollView>
                </View>
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
                    <FlatList
                        data={book.chapters}
                        keyExtractor={item => item.id}
                        initialScrollIndex={Math.max(0, currentChapterIndex - 2)}
                        getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
                        renderItem={({ item, index }) => {
                            const isActive = index === currentChapterIndex;
                            return (
                                <TouchableOpacity
                                    onPress={() => { updateWindow(index); indexRef.current = index; setCurrentChapterIndex(index); closeSidebar(); }}
                                    className={`px-4 py-3 border-b border-border/20 ${isActive ? 'bg-accent/20 border-l-2 border-l-accent pl-3' : ''}`}
                                >
                                    <Text className={`text-sm font-serif ${isActive ? 'text-accent font-bold' : th.textSec}`} numberOfLines={2}>
                                        {index + 1}. {item.title}
                                    </Text>
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
                        <View className="flex-row flex-wrap gap-2 mb-3">{(['gemini', 'xiaomi', 'google'] as AudioProvider[]).map(value => (
                            <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`Use ${AUDIO_LABELS[value]}`}
                                onPress={() => { setProvider(value); cacheService.set('listen-tts-provider', value); }}
                                className={`px-3 py-2 rounded-lg border ${provider === value ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}>
                                <Text className={provider === value ? 'text-white font-bold' : th.textSec}>{AUDIO_LABELS[value]}</Text>
                            </TouchableOpacity>
                        ))}</View>
                        <Text className={`${th.textMuted} text-xs mb-5`}>Automatic fallback: Gemini → Xiaomi MiMo → Google (free).</Text>
                        {/* Voice */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Target Voice (Accent)</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {AUDIO_VOICES[provider].map(voice => ({ id: voice, label: voice === 'mimo_default' || voice === 'en' ? 'Default' : voice })).map(v => (
                                <TouchableOpacity 
                                    key={v.id}
                                    onPress={() => {
                                        if (provider === 'gemini') setGeminiVoice(v.id);
                                        else if (provider === 'xiaomi') setMimoVoice(v.id);
                                        else setTtsVoice(v.id);
                                        cacheService.set(provider === 'gemini' ? 'listen-gemini-voice' : provider === 'xiaomi' ? 'listen-mimo-voice' : 'listen-tts-voice', v.id);
                                    }}
                                    className={`px-4 py-2 rounded-lg border ${currentVoice === v.id ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${currentVoice === v.id ? 'text-white' : th.textSec}`}>{v.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* AI Model */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Grammar Model</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {['OFF', 'gemini-2.5-flash', 'gpt-4o-mini', 'pollinations', 'ollama'].map(m => (
                                <TouchableOpacity 
                                    key={m}
                                    onPress={() => {
                                        setGrammarModel(m);
                                        cacheService.set('listen-grammar-model', m);
                                    }}
                                    className={`px-3 py-2 rounded-lg border ${grammarModel === m ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${grammarModel === m ? 'text-white' : th.textSec}`}>{m === 'OFF' ? 'Disabled' : m.replace('gemini-2.5-flash', 'Gemini Flash').replace('gpt-4o-mini', 'GPT-4o')}</Text>
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
