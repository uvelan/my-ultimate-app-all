'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface Chapter {
    id: string;
    title: string;
}

interface Book {
    id: string;
    title: string;
    cover?: string;
    chapters: Chapter[];
}

export default function ListenPage() {
    const params = useParams();
    const router = useRouter();

    const [book, setBook] = useState<Book | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    // Player State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Timer State
    const [sleepTimer, setSleepTimer] = useState<number | 'EOC' | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null); // seconds

    const audioRef = useRef<HTMLAudioElement | null>(null);

    const currentChapter = book?.chapters[currentChapterIndex];

    useEffect(() => {
        if (params.id) {
            fetchBook(params.id as string);
        }
    }, [params.id]);

    const fetchBook = async (id: string) => {
        try {
            const res = await fetch(`/api/books/${id}`);
            if (res.ok) {
                const data = await res.json();
                setBook({
                    ...data,
                    // Map chapters if needed depending on exactly how API returns them
                    chapters: data.chapters || []
                });

                // Check stored progress
                const savedProgress = localStorage.getItem(`listen-progress-${id}`);
                if (savedProgress) {
                    try {
                        const parsed = JSON.parse(savedProgress);
                        if (typeof parsed.chapterIndex === 'number') {
                            setCurrentChapterIndex(parsed.chapterIndex);
                        }
                    } catch (e) {
                        console.error("Parse error for listen progress", e);
                    }
                }
            } else {
                toast.error('Failed to load book');
            }
        } catch (error) {
            toast.error('Error loading book');
        } finally {
            setLoading(false);
        }
    };

    const saveProgressToDb = async (index: number) => {
        if (!book?.id) return;
        try {
            await fetch(`/api/books/${book.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapterId: index, sentenceId: 0 })
            });
        } catch (error) {
            console.error('Error saving progress', error);
        }
    };

    // Whenever chapter index changes, fetch the new audio URL
    useEffect(() => {
        if (!book || !currentChapter) return;

        // Save progress to localStorage
        localStorage.setItem(`listen-progress-${book.id}`, JSON.stringify({
            chapterIndex: currentChapterIndex
        }));

        saveProgressToDb(currentChapterIndex);

        fetchAudioForChapter(currentChapter.id);
    }, [currentChapterIndex, book]);

    const fetchAudioForChapter = async (chapterId: string) => {
        setIsGenerating(true);
        setAudioUrl(null); // Clear previous audio

        try {
            // Using our new API route. Because building this audio file might take a second, 
            // returning the direct URL to the <audio> src is sometimes better, but here we preload to show spinning until ready.
            const url = `/api/tts?chapterId=${chapterId}`;

            // To test if it exists and handles generation, we can fetch it once
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Audio generation failed");
            }

            // It succeeded, set the URL to let the <audio> element stream it
            setAudioUrl(url);

            // Auto-play if not on first boot (browsers block initial autoplay)
            setTimeout(() => {
                if (audioRef.current && currentChapterIndex > 0) {
                    audioRef.current.play().catch(e => console.log('Autoplay blocked', e));
                }
            }, 500);

        } catch (error) {
            console.error(error);
            toast.error("Failed to generate audio for this chapter.");
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Audio Event Handlers ---
    const handleAudioEnded = () => {
        setIsPlaying(false);
        if (sleepTimer === 'EOC') {
            setSleepTimer(null);
            toast('End of chapter reached. Timer stopped.');
        } else {
            // Auto-advance
            handleNextChapter();
        }
    };

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev === null) return null;
                if (prev > 0) return prev - 1;

                // Timer reached 0
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

    // Restore speed preference
    useEffect(() => {
        const storedSpeed = localStorage.getItem('listen-playback-speed');
        if (storedSpeed) {
            setPlaybackSpeed(parseFloat(storedSpeed));
        }
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

            // Play and pause are handled natively by the HTML5 audio element's integration
        }
    }, [book, currentChapter]);


    // --- Navigation Handlers ---
    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

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
            <div className="flex flex-col h-screen bg-[#1a202c] text-white font-sans overflow-hidden">

                {/* Header Navbar */}
                <header className="bg-[#2d3748] border-b border-[#4a5568] px-2 md:px-4 py-2 md:py-3 shadow-md shrink-0 z-20 flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                        <Link href="/books" className={iconBtnStyle} title="Back to Library">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </Link>
                        <button onClick={toggleSidebar} className={topBtnStyle} title="Table of Contents">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            <span className="hidden sm:inline">Chapters</span>
                        </button>
                        <div className="h-6 w-px bg-[#4a5568] mx-2 hidden sm:block"></div>
                        <span className="text-sm font-bold text-[#e2e8f0] hidden md:block truncate max-w-[200px] lg:max-w-[300px]">
                            {book.title}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <select
                            value={sleepTimer === null ? 'OFF' : sleepTimer}
                            onChange={handleTimerSelect}
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer"
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
                            className="bg-[#4a5568] border border-[#718096] text-[#e2e8f0] text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-[#a0aec0] cursor-pointer"
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

                <div className="flex flex-1 overflow-hidden relative">
                    {/* Collapsible Sidebar */}
                    <div
                        className={`absolute inset-y-0 left-0 z-20 w-3/4 sm:w-80 bg-[#2d3748] border-r border-[#4a5568] transform transition-transform duration-300 ease-in-out shadow-xl flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="p-3 border-b border-[#4a5568] bg-[#1a202c] flex justify-between items-center">
                            <h3 className="font-bold text-[#e2e8f0]">Listening Index</h3>
                            <button onClick={toggleSidebar} className="p-1 hover:bg-[#4a5568] rounded">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2">
                            {book.chapters.map((chapter, index) => (
                                <button
                                    key={chapter.id}
                                    onClick={() => handleJumpToChapter(index)}
                                    className={`w-full text-left p-3 rounded mb-1 text-sm truncate transition ${currentChapterIndex === index
                                        ? 'bg-[#4fd1c5] text-[#1a202c] font-bold'
                                        : 'hover:bg-[#4a5568] text-[#a0aec0]'
                                        }`}
                                >
                                    {chapter.title}
                                </button>
                            ))}
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
                    <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative bg-gradient-to-b from-[#1a202c] to-[#000000]">

                        {/* Artwork / CD Style UI */}
                        <div className={`w-48 h-48 md:w-64 md:h-64 rounded-xl shadow-2xl mb-8 border border-[#2d3748] overflow-hidden bg-[#2d3748] flex items-center justify-center transition-all ${!isGenerating && audioUrl ? 'scale-105' : 'scale-100 opacity-80'}`}>
                            {book.cover ? (
                                <img src={book.cover} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                                <svg className="w-24 h-24 text-[#4a5568]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                            )}
                        </div>

                        {/* Title and Info */}
                        <div className="text-center max-w-2xl px-4 w-full">
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-3 truncate">
                                {currentChapter?.title || 'Unknown Chapter'}
                            </h2>
                            <p className="text-[#a0aec0] mb-8 font-medium">Chapter {currentChapterIndex + 1} of {book.chapters.length}</p>

                            {/* Audio Player */}
                            <div className="bg-[#2d3748] rounded-xl p-4 md:p-6 shadow-xl border border-[#4a5568] w-full max-w-lg mx-auto">

                                {isGenerating ? (
                                    <div className="flex flex-col items-center justify-center py-4">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4fd1c5] mb-3"></div>
                                        <p className="text-sm text-[#a0aec0]">Generating High-Quality Audio...</p>
                                    </div>
                                ) : audioUrl ? (
                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <audio
                                            ref={audioRef}
                                            src={audioUrl}
                                            className="hidden"
                                            onEnded={handleAudioEnded}
                                            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                                            onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                                            onPlay={() => setIsPlaying(true)}
                                            onPause={() => setIsPlaying(false)}
                                            autoPlay={currentChapterIndex > 0}
                                        />

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
                                        <div className="w-full flex items-center gap-3 text-xs text-[#a0aec0] font-mono mb-2">
                                            <span>{formatTime(currentTime)}</span>
                                            <input
                                                type="range"
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
                                                className="flex-1 w-full h-1.5 bg-[#4a5568] rounded-lg appearance-none cursor-pointer accent-[#4fd1c5]"
                                                style={{ WebkitAppearance: 'none' }}
                                            />
                                            <span>{formatTime(duration)}</span>
                                        </div>

                                        {/* Custom Transport Controls */}
                                        <div className="flex items-center justify-center gap-6 mt-2">
                                            {/* Rewind */}
                                            <button
                                                onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 15; }}
                                                className="text-[#a0aec0] hover:text-[#e2e8f0] transition-colors flex flex-col items-center"
                                                title="Rewind 15s"
                                            >
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
                                                <span className="text-[10px] mt-1 font-bold tracking-wider">-15s</span>
                                            </button>

                                            {/* Play/Pause */}
                                            <button
                                                onClick={() => {
                                                    if (!audioRef.current) return;
                                                    if (isPlaying) audioRef.current.pause();
                                                    else audioRef.current.play();
                                                }}
                                                className="w-16 h-16 bg-[#4fd1c5] hover:bg-[#38b2ac] text-[#1a202c] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(79,209,197,0.4)] transition transform hover:scale-105"
                                            >
                                                {isPlaying ? (
                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                                ) : (
                                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                )}
                                            </button>

                                            {/* Skip */}
                                            <button
                                                onClick={() => { if (audioRef.current) audioRef.current.currentTime += 15; }}
                                                className="text-[#a0aec0] hover:text-[#e2e8f0] transition-colors flex flex-col items-center"
                                                title="Skip 15s"
                                            >
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
                                                <span className="text-[10px] mt-1 font-bold tracking-wider">+15s</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[#a0aec0] text-sm py-6">Could not load audio.</div>
                                )}

                                {/* Prev / Next Fast Controls Below */}
                                <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#4a5568]">
                                    <button onClick={handlePrevChapter} disabled={currentChapterIndex === 0} className={`p-2 rounded hover:bg-[#4a5568] text-[#a0aec0] transition text-sm flex items-center gap-1 ${currentChapterIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>
                                        <span>Prev Chapter</span>
                                    </button>

                                    <button onClick={handleNextChapter} disabled={currentChapterIndex === book.chapters.length - 1} className={`p-2 rounded hover:bg-[#4a5568] text-[#a0aec0] transition text-sm flex items-center gap-1 ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`}>
                                        <span>Next Chapter</span>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path></svg>
                                    </button>
                                </div>
                            </div>
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
