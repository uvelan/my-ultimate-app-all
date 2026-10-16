'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { cacheChapterAudio, getCachedChapterAudio, retainChapterAudioWindow, type AudioCacheIdentity } from '@/lib/listen-audio-cache';

interface Chapter {
    id: string;
    title: string;
    content?: any;
}

interface Book {
    id: string;
    title: string;
    cover?: string;
    chapters: Chapter[];
}

const mimoVoices = ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean'] as const;
type MimoVoice = typeof mimoVoices[number];
type AudioSource = 'device' | 'database' | 'generated';
interface LoadedAudio { audio: Blob; source: AudioSource }
interface AudioTask { controller: AbortController; promise: Promise<LoadedAudio> }

function audioIdentityKey(identity: AudioCacheIdentity): string {
    return JSON.stringify([identity.userId, identity.chapterId, identity.content,
        identity.provider, identity.voice, identity.grammarModel]);
}

export default function ListenPage() {
    const params = useParams();
    const router = useRouter();

    const [book, setBook] = useState<Book | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Sidebar Search & Scroll State
    const [searchQuery, setSearchQuery] = useState("");
    const chapterRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [grammarModel, setGrammarModel] = useState("OFF");
    const [ttsVoice, setTtsVoice] = useState("en");
    const [ttsProvider, setTtsProvider] = useState<'google' | 'xiaomi'>('google');
    const [mimoVoice, setMimoVoice] = useState<MimoVoice>('Mia');
    const [preferencesReady, setPreferencesReady] = useState(false);
    const [cacheUserId, setCacheUserId] = useState('');
    const [audioSource, setAudioSource] = useState<AudioSource | null>(null);

    // Player State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Timer State
    const [sleepTimer, setSleepTimer] = useState<number | 'EOC' | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null); // seconds

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const chapterTextRef = useRef<HTMLDivElement | null>(null);
    const audioTasksRef = useRef(new Map<string, AudioTask>());
    const playIntentRef = useRef(false);
    const switchingAudioRef = useRef(false);

    const currentChapter = book?.chapters[currentChapterIndex];
    const bookId = book?.id;
    const chapterId = currentChapter?.id;
    const selectedVoice = ttsProvider === 'xiaomi' ? mimoVoice : ttsVoice;
    const chapterContent = currentChapter?.content;
    const nextChapter = book?.chapters[currentChapterIndex + 1];
    const nextChapterId = nextChapter?.id;
    const nextChapterContent = nextChapter?.content;

    useEffect(() => {
        if (chapterTextRef.current) chapterTextRef.current.scrollTop = 0;
    }, [chapterId]);

    useEffect(() => {
        const controller = new AbortController();
        if (params.id) {
            void fetchBook(params.id as string, controller.signal);
        }
        return () => controller.abort();
    }, [params.id]);

    const fetchBook = async (id: string, signal: AbortSignal) => {
        try {
            const res = await fetch(`/api/books/${id}`, { signal });
            if (signal.aborted) return;
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (signal.aborted) return;
                setBook({
                    ...data,
                    // Map chapters if needed depending on exactly how API returns them
                    chapters: data.chapters || []
                });

                let finalChapterIndex = 0;
                let needsDbUpdate = false;

                if (typeof data.chapterId === 'number') {
                    finalChapterIndex = data.chapterId;
                }

                // Check stored progress
                const savedProgress = localStorage.getItem(`listen-progress-${id}`);
                if (savedProgress) {
                    try {
                        const parsed = JSON.parse(savedProgress);
                        if (typeof parsed.chapterIndex === 'number') {
                            if (parsed.chapterIndex > finalChapterIndex) {
                                finalChapterIndex = parsed.chapterIndex;
                                needsDbUpdate = true;
                            }
                        }
                    } catch (e) {
                        console.error("Parse error for listen progress", e);
                    }
                }

                setCurrentChapterIndex(finalChapterIndex);

                if (needsDbUpdate) {
                    fetch(`/api/books/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chapterId: finalChapterIndex, sentenceId: 0 })
                    }).catch(console.error);
                }
            } else {
                toast.error('Failed to load book');
            }
        } catch (error) {
            if (!signal.aborted) toast.error('Error loading book');
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    };

    const saveProgressToDb = async (index: number) => {
        if (!book?.id) return;
        try {
            const res = await fetch(`/api/books/${book.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapterId: index, sentenceId: 0 })
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
        } catch (error) {
            console.error('Error saving progress', error);
        }
    };

    // Request ownership survives next-chapter promotion, including unfinished prefetches.
    useEffect(() => () => {
        for (const task of Array.from(audioTasksRef.current.values())) task.controller.abort();
        audioTasksRef.current.clear();
    }, []);

    // Keep only the current chapter and its immediate successor, on disk and in memory.
    useEffect(() => {
        if (!bookId || !chapterId || !preferencesReady) return;

        let objectUrl: string | null = null;
        let active = true;
        const identityFor = (id: string, content: unknown): AudioCacheIdentity => ({
            userId: cacheUserId, chapterId: id, content,
            provider: ttsProvider, voice: selectedVoice, grammarModel,
        });
        const currentIdentity = identityFor(chapterId, chapterContent);
        const nextIdentity = nextChapterId ? identityFor(nextChapterId, nextChapterContent) : null;
        const identities = nextIdentity ? [currentIdentity, nextIdentity] : [currentIdentity];
        const allowedKeys = new Set(identities.map(audioIdentityKey));
        for (const [key, task] of Array.from(audioTasksRef.current.entries())) {
            if (!allowedKeys.has(key)) {
                task.controller.abort();
                audioTasksRef.current.delete(key);
            }
        }

        switchingAudioRef.current = true;
        audioRef.current?.pause();
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setAudioUrl(null);
        setAudioSource(null);
        setIsGenerating(true);

        // Save progress to localStorage
        localStorage.setItem(`listen-progress-${bookId}`, JSON.stringify({
            chapterIndex: currentChapterIndex
        }));

        saveProgressToDb(currentChapterIndex);

        const loadAudio = (identity: AudioCacheIdentity, prefetch = false): Promise<LoadedAudio> => {
            const key = audioIdentityKey(identity);
            const existing = audioTasksRef.current.get(key);
            if (existing) return existing.promise;
            const controller = new AbortController();
            const promise = (async (): Promise<LoadedAudio> => {
                const cachedAudio = await getCachedChapterAudio(identity);
                controller.signal.throwIfAborted();
                if (cachedAudio) return { audio: cachedAudio, source: 'device' };
                const query = new URLSearchParams({
                    chapterId: identity.chapterId,
                    grammarModel: identity.grammarModel,
                    provider: identity.provider,
                    voice: identity.voice,
                });
                if (prefetch) query.set('prefetch', '1');
                const response = await fetch(`/api/tts?${query}`, { signal: controller.signal });
                controller.signal.throwIfAborted();
                if (response.status === 401 || response.status === 403) {
                    router.push('/login');
                    throw new Error('Please sign in to continue listening.');
                }
                if (!response.ok) {
                    const details = await response.json().catch(() => null);
                    throw new Error(typeof details?.error === 'string'
                        ? details.error : 'Failed to generate audio for this chapter.');
                }
                const audio = await response.blob();
                controller.signal.throwIfAborted();
                void cacheChapterAudio(identity, audio);
                return { audio, source: response.headers.get('X-TTS-Cache') === 'database' ? 'database' : 'generated' };
            })();
            const task = { controller, promise };
            audioTasksRef.current.set(key, task);
            // Failed prefetches may be retried when that chapter becomes current.
            void promise.catch(() => {
                if (audioTasksRef.current.get(key) === task) audioTasksRef.current.delete(key);
            });
            return promise;
        };

        const prepareAudio = async () => {
            try {
                await retainChapterAudioWindow(identities);
                if (!active) return;
                const loaded = await loadAudio(currentIdentity);
                if (!active) return;
                objectUrl = URL.createObjectURL(loaded.audio);
                setAudioUrl(objectUrl);
                setAudioSource(loaded.source);
                // Start only after current audio is ready. Its task is reused on advance.
                if (nextIdentity) void loadAudio(nextIdentity, true).catch(() => {});
            } catch (error) {
                if (!active) return;
                console.error(error);
                toast.error(error instanceof Error ? error.message : 'Failed to generate audio for this chapter.');
            } finally {
                if (active) setIsGenerating(false);
            }
        };

        void prepareAudio();

        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [currentChapterIndex, chapterId, bookId, grammarModel, ttsProvider, selectedVoice, preferencesReady, cacheUserId, chapterContent, nextChapterId, nextChapterContent]);

    const attemptPlayback = () => {
        const audio = audioRef.current;
        if (!audio || !playIntentRef.current || !audio.getAttribute('src')) return;
        const requestedSource = audio.src;
        void audio.play().catch((error: unknown) => {
            if (!playIntentRef.current || audio.src !== requestedSource) return;
            if (error instanceof Error && error.name === 'NotAllowedError') {
                playIntentRef.current = false;
                toast('Press Play to continue listening.', { id: 'listen-autoplay-blocked' });
            } else if (!(error instanceof Error) || error.name !== 'AbortError') {
                console.error('Audio playback failed', error);
            }
        });
    };

    // --- Audio Event Handlers ---
    const handleAudioEnded = () => {
        setIsPlaying(false);
        if (sleepTimer === 'EOC') {
            playIntentRef.current = false;
            setSleepTimer(null);
            toast('End of chapter reached. Timer stopped.');
        } else if (playIntentRef.current && book && currentChapterIndex < book.chapters.length - 1) {
            setCurrentChapterIndex(index => index + 1);
        } else {
            playIntentRef.current = false;
        }
    };

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev === null) return null;
                if (prev > 0) return prev - 1;

                // Timer reached 0
                playIntentRef.current = false;
                if (audioRef.current) {
                    audioRef.current.pause();
                    setIsPlaying(false);
                }
                setSleepTimer(null);
                toast('Sleep timer ended.');
                return null;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [timeRemaining]);

    const handleTimerSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'OFF') {
            setSleepTimer(null);
            setTimeRemaining(null);
        } else if (val === 'EOC') {
            setSleepTimer('EOC');
            setTimeRemaining(null);
            toast.success('Timer set for End of Chapter');
        } else {
            const mins = parseInt(val);
            setSleepTimer(mins);
            setTimeRemaining(mins * 60);
            toast.success(`Timer set for ${mins} minutes`);
        }
    };

    const formatTime = (seconds: number) => {
        if (isNaN(seconds) || seconds < 0) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSpeed = parseFloat(e.target.value);
        setPlaybackSpeed(newSpeed);
        if (audioRef.current) {
            audioRef.current.playbackRate = newSpeed;
        }
        localStorage.setItem('listen-playback-speed', newSpeed.toString());
    };

    // Restore preference settings before generating or looking up audio.
    useEffect(() => {
        try {
            const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
            const userId = storedUser?.id || storedUser?.email;
            if (typeof userId === 'string') setCacheUserId(userId);
        } catch {
            // Missing identity disables persistent caching, without blocking playback.
        }
        const storedSpeed = localStorage.getItem('listen-playback-speed');
        if (storedSpeed) {
            setPlaybackSpeed(parseFloat(storedSpeed));
        }

        const storedGrammar = localStorage.getItem('listen-grammar-model');
        if (storedGrammar) {
            setGrammarModel(storedGrammar);
        }

        const storedVoice = localStorage.getItem('listen-tts-voice');
        if (storedVoice) {
            setTtsVoice(storedVoice);
        }

        const storedProvider = localStorage.getItem('listen-tts-provider');
        if (storedProvider === 'google' || storedProvider === 'xiaomi') {
            setTtsProvider(storedProvider);
        }

        const storedMimoVoice = localStorage.getItem('listen-mimo-voice');
        if (mimoVoices.includes(storedMimoVoice as MimoVoice)) {
            setMimoVoice(storedMimoVoice as MimoVoice);
        }
        setPreferencesReady(true);
    }, []);

    // Also update audio ref immediately when it mounts or speed state changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeed;
        }
    }, [audioUrl, playbackSpeed]);

    // Media Session API Support (lock screen controls)
    useEffect(() => {
        if ('mediaSession' in navigator && book && currentChapter) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentChapter.title || 'Audiobook Chapter',
                artist: book.title || 'Unknown Author',
                album: 'Audiobook Library',
                artwork: book.cover ? [{ src: book.cover, sizes: '512x512', type: 'image/jpeg' }] : []
            });

            navigator.mediaSession.setActionHandler('previoustrack', () => {
                handlePrevChapter();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                handleNextChapter();
            });

            navigator.mediaSession.setActionHandler('play', () => {
                playIntentRef.current = true;
                attemptPlayback();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                playIntentRef.current = false;
                audioRef.current?.pause();
                setIsPlaying(false);
            });
        }
    }, [book, currentChapter]);


    // --- Navigation Handlers ---
    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
        if (!sidebarOpen) {
            // Give the DOM a tiny fraction of a second to render the sidebar, then scroll to active chapter
            setTimeout(() => {
                if (chapterRefs.current[currentChapterIndex]) {
                    chapterRefs.current[currentChapterIndex]?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                }
            }, 100);
        }
    };

    const handleNextChapter = () => {
        if (book && currentChapterIndex < book.chapters.length - 1) {
            setCurrentChapterIndex(prev => prev + 1);
        } else {
            toast('You have reached the end of the book.', { icon: '🏁' });
        }
    };

    const handlePrevChapter = () => {
        if (currentChapterIndex > 0) {
            setCurrentChapterIndex(prev => prev - 1);
        }
    };

    const handleJumpToChapter = (index: number) => {
        setCurrentChapterIndex(index);
        setSidebarOpen(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#2d3748] flex items-center justify-center text-white">
                <div className="animate-pulse text-xl font-serif">Loading Audiobook...</div>
            </div>
        );
    }

    if (!book) return null;

    const topBtnStyle = "px-3 py-2 bg-[#4a5568] hover:bg-[#2d3748] text-[#e2e8f0] font-semibold rounded shadow-sm border border-[#718096] flex items-center gap-2 transition-colors text-sm";
    const iconBtnStyle = "p-2 bg-[#4a5568] hover:bg-[#2d3748] text-[#e2e8f0] rounded-full shadow-sm border border-[#718096] transition-colors flex items-center justify-center";

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-dvh min-h-0 bg-[#1a202c] text-white font-sans overflow-hidden [--color-bg:#1a202c] [--color-border:#718096] [--color-muted:#a0aec0]" style={{ colorScheme: 'dark' }}>

                {/* Header Navbar */}
                <header className="bg-[#2d3748] border-b border-[#4a5568] px-4 sm:px-6 py-3 shadow-md shrink-0 z-20 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex w-full min-w-0 items-center gap-2 md:gap-3 xl:w-auto">
                        <Link href="/books" className={iconBtnStyle} title="Back to Library">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </Link>
                        <button onClick={toggleSidebar} className={topBtnStyle} title="Table of Contents" aria-label="Open chapters" aria-expanded={sidebarOpen}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            <span className="hidden sm:inline">Chapters</span>
                        </button>
                        <div className="h-6 w-px bg-[#4a5568] mx-2 hidden sm:block"></div>
                        <span className="text-sm font-bold text-[#e2e8f0] min-w-0 truncate max-w-[45vw] xl:max-w-[240px]">
                            {book.title}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(open => !open)}
                            className="ml-auto shrink-0 rounded-lg border border-[#718096] bg-[#4a5568] p-2 text-[#e2e8f0] transition-colors hover:bg-[#2d3748] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4fd1c5] lg:hidden"
                            aria-label={settingsOpen ? 'Hide playback settings' : 'Show playback settings'}
                            aria-expanded={settingsOpen}
                            aria-controls="listen-playback-settings"
                            title="Playback settings"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="#4a5568" /><circle cx="15" cy="17" r="3" fill="#4a5568" /></svg>
                        </button>
                    </div>

                    <div id="listen-playback-settings" className={`${settingsOpen ? 'grid' : 'hidden'} min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid xl:flex xl:flex-wrap xl:justify-end [&>select]:min-w-0 [&>select]:w-full [&>select]:h-10 [&>select]:text-xs [&>select]:px-3 xl:[&>select]:w-auto`}>
                        <select
                            value={ttsProvider}
                            onChange={(e) => {
                                const provider = e.target.value as 'google' | 'xiaomi';
                                setTtsProvider(provider);
                                localStorage.setItem('listen-tts-provider', provider);
                            }}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 py-1 sm:py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer min-w-[70px]"
                            title="TTS Provider"
                            aria-label="TTS provider"
                        >
                            <option value="google">Google</option>
                            <option value="xiaomi">Xiaomi MiMo</option>
                        </select>
                        <select
                            value={selectedVoice}
                            onChange={(e) => {
                                if (ttsProvider === 'xiaomi') {
                                    setMimoVoice(e.target.value as MimoVoice);
                                    localStorage.setItem('listen-mimo-voice', e.target.value);
                                } else {
                                    setTtsVoice(e.target.value);
                                    localStorage.setItem('listen-tts-voice', e.target.value);
                                }
                            }}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 py-1 sm:py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer min-w-[70px]"
                            title="TTS Voice Accent"
                            aria-label={ttsProvider === 'xiaomi' ? 'Xiaomi MiMo voice' : 'Google voice'}
                        >
                            {ttsProvider === 'xiaomi' ? mimoVoices.map((voice) => (
                                <option key={voice} value={voice}>Voice: {voice === 'mimo_default' ? 'Default' : voice}</option>
                            )) : <>
                            <option value="en">Voice: Default</option>
                            <option value="gemini-3.1-kore">Voice: Gemini 3.1 (Kore)</option>
                            <option value="gemini-2.5-kore">Voice: Gemini 2.5 (Kore)</option>
                            <option value="en-US">Voice: US English</option>
                            <option value="en-GB">Voice: British</option>
                            <option value="en-AU">Voice: Australian</option>
                            <option value="en-IN">Voice: Indian</option>
                            <option value="en-NG">Voice: Nigerian</option>
                            </>}
                        </select>
                        <select
                            value={grammarModel}
                            onChange={(e) => {
                                setGrammarModel(e.target.value);
                                localStorage.setItem('listen-grammar-model', e.target.value);
                            }}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-[10px] sm:text-xs md:text-sm px-1 sm:px-2 py-1 sm:py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer min-w-[80px]"
                            title="Grammar Model"
                        >
                            <option value="OFF">Grammar: OFF</option>
                            <option value="gemini-2.5-flash">Gemini Flash</option>
                            <option value="gpt-4o-mini">GPT 4o Mini</option>
                            <option value="pollinations">Pollinations (Free)</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                        <select
                            value={sleepTimer === null ? 'OFF' : sleepTimer}
                            onChange={handleTimerSelect}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-xs sm:text-sm px-1 sm:px-2 py-1 sm:py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer"
                            title="Sleep Timer"
                        >
                            <option value="OFF">Timer: Off</option>
                            <option value="EOC">Timer: End of Chapter</option>
                            <option value="15">Timer: 15 min</option>
                            <option value="30">Timer: 30 min</option>
                            <option value="45">Timer: 45 min</option>
                            <option value="60">Timer: 60 min</option>
                        </select>
                        <select
                            value={playbackSpeed}
                            onChange={handleSpeedChange}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-xs sm:text-sm px-1 sm:px-2 py-1 sm:py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer"
                            title="Playback Speed"
                        >
                            <option value={0.75}>0.75x</option>
                            <option value={1.0}>1x (Normal)</option>
                            <option value={1.25}>1.25x</option>
                            <option value={1.5}>1.5x</option>
                            <option value={2.0}>2x</option>
                        </select>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 overflow-hidden relative">
                    {/* Collapsible Sidebar */}
                    <div
                        className={`absolute inset-y-0 left-0 z-20 w-3/4 sm:w-80 bg-[#2d3748] border-r border-[#4a5568] transform transition-transform duration-300 ease-in-out shadow-xl flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="p-3 border-b border-[#4a5568] bg-[#1a202c] flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-[#e2e8f0]">Listening Index</h3>
                                <button onClick={toggleSidebar} aria-label="Close chapters" className="p-1 hover:bg-[#4a5568] rounded">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search chapters..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#2d3748] border border-[#4a5568] text-sm text-[#e2e8f0] px-3 py-2 rounded focus:outline-none focus:border-[#4fd1c5] transition-colors"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a0aec0] hover:text-white"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="min-h-0 overflow-y-auto flex-1 p-2">
                            {book.chapters.map((chapter, index) => {
                                // Filter logic
                                if (searchQuery && !chapter.title.toLowerCase().includes(searchQuery.toLowerCase())) {
                                    return null;
                                }

                                return (
                                    <button
                                        key={chapter.id}
                                        ref={(el) => {
                                            chapterRefs.current[index] = el;
                                        }}
                                        onClick={() => handleJumpToChapter(index)}
                                        className={`w-full text-left p-3 rounded mb-1 text-sm truncate transition shrink-0 ${currentChapterIndex === index
                                            ? 'bg-[#4fd1c5] text-[#1a202c] font-bold border-l-4 border-[#319795] shadow-sm'
                                            : 'hover:bg-[#4a5568] text-[#a0aec0] border-l-4 border-transparent'
                                            }`}
                                    >
                                        {chapter.title}
                                    </button>
                                );
                            })}

                            {/* Empty state for search */}
                            {searchQuery && !book.chapters.some(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())) && (
                                <div className="text-center text-[#a0aec0] text-sm py-8 italic">
                                    No chapters found matching &quot;{searchQuery}&quot;
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Backdrop */}
                    {sidebarOpen && (
                        <div
                            className="absolute inset-0 bg-black/50 z-10 backdrop-blur-[2px] transition-opacity"
                            onClick={() => setSidebarOpen(false)}
                        ></div>
                    )}

                    {/* Main UI Area */}
                    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto lg:overflow-hidden overscroll-contain bg-gradient-to-b from-[#1a202c] to-[#000000] p-4 sm:p-6 lg:p-8">
                        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-6 lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
                        <section aria-label="Audiobook player" className="flex min-w-0 flex-col items-center gap-5 lg:h-full lg:min-h-0 lg:justify-start lg:overflow-y-auto lg:py-2">

                        <div className="flex w-full max-w-lg shrink-0 items-center gap-4 sm:gap-5">
                        {/* Cover and chapter details share a compact row. */}
                        <div className={`w-20 h-28 sm:w-24 sm:h-36 rounded-lg shadow-xl border border-[#2d3748] overflow-hidden bg-[#2d3748] flex items-center justify-center transition-opacity shrink-0 ${isGenerating ? 'opacity-80' : 'opacity-100'}`}>
                            {book.cover ? (
                                <img src={book.cover} alt={`${book.title} cover`} className="w-full h-full object-contain" />
                            ) : (
                                <svg className="w-24 h-24 text-[#4a5568]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                            )}
                        </div>

                        {/* Title and Info */}
                        <div className="min-w-0 flex-1 text-left">
                            <h2 className="text-lg sm:text-xl font-bold leading-snug text-white mb-2 break-words">
                                {currentChapter?.title || 'Unknown Chapter'}
                            </h2>
                            <p className="text-[#a0aec0] text-sm font-medium">Chapter {currentChapterIndex + 1} of {book.chapters.length}</p>

                        </div>
                        </div>

                            {/* Audio Player */}
                            <div className="shrink-0 bg-[#2d3748] rounded-xl p-3 sm:p-4 md:p-4 shadow-xl border border-[#4a5568] w-full max-w-lg mx-auto">

                                <audio
                                    ref={audioRef}
                                    src={audioUrl || undefined}
                                    className="hidden"
                                    onEnded={handleAudioEnded}
                                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                                    onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                                    onCanPlay={() => {
                                        const audio = audioRef.current;
                                        if (!audio?.getAttribute('src') || audio.currentSrc !== audio.src) return;
                                        switchingAudioRef.current = false;
                                        attemptPlayback();
                                    }}
                                    onPlay={() => {
                                        if (audioRef.current?.paused) return;
                                        playIntentRef.current = true;
                                        setIsPlaying(true);
                                    }}
                                    onPause={() => {
                                        if (!switchingAudioRef.current && !audioRef.current?.ended) {
                                            playIntentRef.current = false;
                                        }
                                        setIsPlaying(false);
                                    }}
                                />

                                {!isGenerating && audioUrl && audioSource && (
                                    <p role="status" className="mb-3 text-center text-xs text-[#a0aec0]">
                                        {audioSource === 'device' ? 'Playing from device cache' : audioSource === 'database' ? 'Playing from server cache' : 'Newly generated audio'}
                                    </p>
                                )}
                                {isGenerating ? (
                                    <div className="flex flex-col items-center justify-center py-4">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4fd1c5] mb-3"></div>
                                        <p className="text-sm text-[#a0aec0]">Generating High-Quality Audio...</p>
                                    </div>
                                ) : audioUrl ? (
                                    <div className="flex flex-col items-center gap-2 w-full">

                                        {/* Timer pulse display */}
                                        {timeRemaining !== null && (
                                            <div className="text-[#4fd1c5] text-xs font-mono animate-pulse bg-[#1a202c] px-3 py-1 rounded-full border border-[#4fd1c5]/30">
                                                Timer: {formatTime(timeRemaining)}
                                            </div>
                                        )}
                                        {sleepTimer === 'EOC' && (
                                            <div className="text-[#a0aec0] text-xs font-mono bg-[#1a202c] px-3 py-1 rounded-full border border-[#718096]">
                                                Sleep at End of Chapter
                                            </div>
                                        )}

                                        {/* Complete Progress Timeline */}
                                        <div className="w-full flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-[#a0aec0] font-mono mb-1">
                                            <span>{formatTime(currentTime)}</span>
                                            <input
                                                type="range"
                                                aria-label="Audio progress"
                                                min={0}
                                                max={duration || 100}
                                                value={currentTime || 0}
                                                onChange={(e) => {
                                                    if (audioRef.current) {
                                                        const val = Number(e.target.value);
                                                        audioRef.current.currentTime = val;
                                                        setCurrentTime(val);
                                                    }
                                                }}
                                                className="flex-1 w-full h-2 sm:h-1.5 bg-[#4a5568] rounded-lg appearance-none cursor-pointer accent-[#4fd1c5]"
                                                style={{ WebkitAppearance: 'none' }}
                                            />
                                            <span>{formatTime(duration)}</span>
                                        </div>

                                        {/* Custom Transport Controls */}
                                        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-1 sm:mt-2">
                                            {/* Rewind */}
                                            <button
                                                onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 15; }}
                                                className="text-[#a0aec0] hover:text-[#e2e8f0] transition-colors flex flex-col items-center p-2"
                                                title="Rewind 15s"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
                                                <span className="text-[9px] mt-0.5 font-bold tracking-wider">-15s</span>
                                            </button>

                                            {/* Play/Pause */}
                                            <button
                                                aria-label={isPlaying ? 'Pause audiobook' : 'Play audiobook'}
                                                onClick={() => {
                                                    if (!audioRef.current) return;
                                                    if (isPlaying) {
                                                        playIntentRef.current = false;
                                                        audioRef.current.pause();
                                                    } else {
                                                        playIntentRef.current = true;
                                                        attemptPlayback();
                                                    }
                                                }}
                                                className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-[#4fd1c5] hover:bg-[#38b2ac] text-[#1a202c] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(79,209,197,0.4)] transition transform hover:scale-105"
                                            >
                                                {isPlaying ? (
                                                    <svg width="24" height="24" className="sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                                ) : (
                                                    <svg width="24" height="24" className="sm:w-6 sm:h-6 ml-1" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                )}
                                            </button>

                                            {/* Skip */}
                                            <button
                                                onClick={() => { if (audioRef.current) audioRef.current.currentTime += 15; }}
                                                className="text-[#a0aec0] hover:text-[#e2e8f0] transition-colors flex flex-col items-center p-2"
                                                title="Skip 15s"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
                                                <span className="text-[9px] mt-0.5 font-bold tracking-wider">+15s</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[#a0aec0] text-sm py-4">Could not load audio.</div>
                                )}

                                {/* Prev / Next Fast Controls Below */}
                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#4a5568]">
                                    <button onClick={handlePrevChapter} disabled={currentChapterIndex === 0} className={`p-1 rounded hover:bg-[#4a5568] text-[#a0aec0] transition text-xs flex items-center gap-1 ${currentChapterIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>
                                        <span className="hidden sm:inline">Prev Chapter</span>
                                        <span className="sm:hidden">Prev</span>
                                    </button>

                                    <button onClick={handleNextChapter} disabled={currentChapterIndex === book.chapters.length - 1} className={`p-1 rounded hover:bg-[#4a5568] text-[#a0aec0] transition text-xs flex items-center gap-1 ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`}>
                                        <span className="hidden sm:inline">Next Chapter</span>
                                        <span className="sm:hidden">Next</span>
                                        <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Chapter text scrolls independently without shrinking the player. */}
                        <section aria-label="Chapter text" className="hidden min-w-0 flex-col overflow-hidden lg:flex lg:h-full lg:min-h-0 rounded-xl bg-[#2d3748] shadow-xl border border-[#4a5568]">
                            <h3 className="shrink-0 px-5 py-4 text-base font-bold text-[#e2e8f0] border-b border-[#4a5568]">Chapter text</h3>
                            <div ref={chapterTextRef} className="max-h-[55dvh] min-h-[16rem] lg:min-h-0 lg:max-h-none lg:flex-1 overflow-y-auto overscroll-contain space-y-5 px-5 py-5 sm:px-6 text-left text-base leading-8 break-words [scrollbar-gutter:stable]">
                                {currentChapter?.content && (() => {
                                    let paragraphs: string[] = [];
                                    try {
                                        paragraphs = typeof currentChapter.content === 'string' 
                                            ? JSON.parse(currentChapter.content) 
                                            : currentChapter.content;
                                        if (!Array.isArray(paragraphs)) paragraphs = [String(currentChapter.content)];
                                    } catch(e) {
                                        paragraphs = [String(currentChapter.content)];
                                    }
                                    return paragraphs.map((para, i) => {
                                        const progress = duration > 0 ? (currentTime / duration) : 0;
                                        const startThresh = i / paragraphs.length;
                                        const endThresh = (i + 1) / paragraphs.length;
                                        const isActive = progress >= startThresh && progress < endThresh;
                                        const isPast = progress >= endThresh;
                                        
                                        return (
                                            <p 
                                                key={i} 
                                                className={`transition-colors duration-300 ${isActive ? 'text-[#4fd1c5] font-medium' : isPast ? 'text-[#e2e8f0]' : 'text-[#a0aec0]'}`}
                                            >
                                                {para}
                                            </p>
                                        );
                                    });
                                })()}
                                {!currentChapter?.content && (
                                    <p className="text-[#a0aec0] italic text-center">Text not available for this chapter.</p>
                                )}
                            </div>
                        </section>
                        </div>
                    </main>
                </div>
            </div>

            <style jsx global>{`
                /* Some basic styling overrides to make the native HTML5 audio player look a bit sleeker on supported browsers */
                audio::-webkit-media-controls-panel {
                    background-color: #1a202c;
                }
                audio::-webkit-media-controls-play-button,
                audio::-webkit-media-controls-mute-button,
                audio::-webkit-media-controls-timeline,
                audio::-webkit-media-controls-current-time-display,
                audio::-webkit-media-controls-time-remaining-display,
                audio::-webkit-media-controls-volume-slider {
                    filter: invert(1) hue-rotate(180deg);
                }
            `}</style>
        </ProtectedRoute>
    );
}
