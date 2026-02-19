'use client';

import { useState, useEffect, useRef } from 'react';
import { Crimson_Text } from 'next/font/google';

const crimsonText = Crimson_Text({
    weight: ['400', '600', '700'],
    subsets: ['latin'],
    display: 'swap',
});


import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface Chapter {
    id: string;
    title: string;
    content: string[];
}

interface Book {
    id: string;
    title: string;
    cover?: string;
    chapters: Chapter[];
}

export default function ReadBookPage() {
    const params = useParams();
    const router = useRouter();
    const [book, setBook] = useState<Book | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed for cleaner view
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [selectedVoice, setSelectedVoice] = useState('Microsoft Neerja Online (Natural) - English (India)');
    const [fontSize, setFontSize] = useState(20); // Default font size in px
    const [replacementRules, setReplacementRules] = useState<any[]>([]);
    const [showReplacementModal, setShowReplacementModal] = useState(false);

    const [processedContent, setProcessedContent] = useState<string[]>([]);

    const currentChapter = book?.chapters[currentChapterIndex];

    // New Rule State
    const [newRuleSearch, setNewRuleSearch] = useState('');
    const [newRuleReplace, setNewRuleReplace] = useState('');
    const [newRuleIsRegex, setNewRuleIsRegex] = useState(false);
    const [newRuleGlobal, setNewRuleGlobal] = useState(false); // If true, apply to all books (bookId = null)

    const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
    const shouldPlayRef = useRef(false);

    const isSwitchingRef = useRef(false);

    const contentRef = useRef<HTMLDivElement>(null);

    // Load Voices
    useEffect(() => {
        const loadVoices = () => {
            const available = window.speechSynthesis.getVoices();
            setVoices(available);
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;

        // Cleanup speech on unmount
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    useEffect(() => {
        if (params.id) {
            fetchBook(params.id as string);
            fetchRules(params.id as string);
        }
    }, [params.id]);

    // Apply specific book rules and global rules
    const fetchRules = async (bookId: string) => {
        try {
            const res = await fetch(`/api/replacements?bookId=${bookId}`);
            if (res.ok) {
                const data = await res.json();
                setReplacementRules(data);
            }
        } catch (error) {
            console.error('Error fetching rules:', error);
        }
    };

    // Apply replacements whenever content or rules change
    useEffect(() => {
        if (!book || !book.chapters[currentChapterIndex]) return;

        const originalContent = book.chapters[currentChapterIndex].content;

        let newContent = [...originalContent];

        replacementRules.forEach(rule => {
            try {
                const searchValue = rule.isRegex ? new RegExp(rule.search, 'g') : rule.search;
                const replaceValue = rule.replace;

                newContent = newContent.map(paragraph => {
                    if (rule.isRegex) {
                        return paragraph.replace(searchValue, replaceValue);
                    } else {
                        // Global string replace
                        return paragraph.split(searchValue).join(replaceValue);
                    }
                });
            } catch (e) {
                console.error(`Invalid replacement rule: ${rule.search}`, e);
            }
        });

        setProcessedContent(newContent);
        // Reset paragraph index on chapter change unless auto-playing
        if (!shouldPlayRef.current) {
            setCurrentParagraphIndex(0);
        }
    }, [book, currentChapterIndex, replacementRules]);

    // Scroll to top when chapter changes
    useEffect(() => {
        if (contentRef.current && !shouldPlayRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [currentChapterIndex]);

    // Verify auto-play on content load
    useEffect(() => {
        if (shouldPlayRef.current && processedContent.length > 0) {
            setCurrentParagraphIndex(0);
            speakParagraph(0);
            shouldPlayRef.current = false; // logic handled, reset
        }
    }, [processedContent]);

    // Highlight active paragraph
    useEffect(() => {
        if (isPlaying && contentRef.current) {
            const activeEl = document.getElementById(`paragraph-${currentParagraphIndex}`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentParagraphIndex, isPlaying]);

    // Handle dynamic voice/speed switching
    useEffect(() => {
        if (isPlaying) {
            window.speechSynthesis.cancel();
            // Small timeout to allow state to settle
            const timer = setTimeout(() => {
                speakParagraph(currentParagraphIndex);
                isSwitchingRef.current = false;
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [selectedVoice, playbackSpeed]);

    const speakParagraph = (index: number) => {
        // Cancel removed to allow smooth transition in Firefox


        if (index >= processedContent.length) {
            handleNextChapter(true); // Auto-advance to next chapter and play
            return;
        }

        const text = processedContent[index];
        if (!text || !text.trim()) {
            // Skip empty paragraphs
            speakParagraph(index + 1);
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = playbackSpeed;

        // Find selected voice object
        const voice = voices.find(v => v.name === selectedVoice) || voices[0];
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
            setCurrentParagraphIndex(index);
        };

        utterance.onend = () => {
            // Check if we are switching voice/speed, if so, abort continuation
            if (isSwitchingRef.current) return;

            // Automatically queue next paragraph
            if (shouldPlayRef.current) return; // Prevent race conditions if chapter changing
            speakParagraph(index + 1);
        };

        speechRef.current = utterance;
        setIsPlaying(true);
        window.speechSynthesis.speak(utterance);
    };

    const handlePlay = () => {
        if (isPlaying) {
            shouldPlayRef.current = false;
            window.speechSynthesis.pause();
            setIsPlaying(false);
        } else {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
                setIsPlaying(true);
            } else {
                window.speechSynthesis.cancel();
                speakParagraph(currentParagraphIndex);
            }
        }
    };

    const handleStop = () => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setCurrentParagraphIndex(0);
    };

    const handleNextLine = () => {
        const next = currentParagraphIndex + 1;
        if (next < processedContent.length) {
            setCurrentParagraphIndex(next);
            if (isPlaying) {
                window.speechSynthesis.cancel();
                speakParagraph(next);
            }
        } else {
            handleNextChapter(true);
        }
    };

    const handlePrevLine = () => {
        const prev = Math.max(0, currentParagraphIndex - 1);
        setCurrentParagraphIndex(prev);
        if (isPlaying) {
            window.speechSynthesis.cancel();
            speakParagraph(prev);
        }
    };

    // --- Keyboard & Media Controls ---

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input (e.g., search/replace)
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault(); // Prevent scrolling
                    handlePlay();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) handleNextChapter(true);
                    else handleNextLine();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) handlePrevChapter();
                    else handlePrevLine();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, currentParagraphIndex, currentChapterIndex, processedContent.length]); // Dependencies crucial for closure

    // Media Session API
    useEffect(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentChapter?.title || book?.title || 'Audiobook',
                artist: book?.title || 'Unknown Author',
                album: 'Audiobook Reader',
                artwork: book?.cover ? [{ src: book.cover, sizes: '512x512', type: 'image/jpeg' }] : []
            });

            navigator.mediaSession.setActionHandler('play', () => {
                handlePlay();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                handlePlay(); // Toggles
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                handlePrevLine();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                handleNextLine();
            });
            navigator.mediaSession.setActionHandler('seekbackward', () => {
                handlePrevLine();
            });
            navigator.mediaSession.setActionHandler('seekforward', () => {
                handleNextLine();
            });
            /* Support for slide navigation if available in future */
            /* navigator.mediaSession.setActionHandler('previousslide', () => handlePrevChapter()); */
            /* navigator.mediaSession.setActionHandler('nextslide', () => handleNextChapter(true)); */
        }
    }, [book, currentChapter, isPlaying, currentParagraphIndex]);

    // --- Optimization: Split Progress Saving ---

    const saveToDb = async (cIndex: number, pIndex: number) => {
        if (!book?.id) return;
        try {
            await fetch(`/api/books/${book.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chapterId: cIndex,
                    sentenceId: pIndex
                })
            });
        } catch (err) {
            console.error('Failed to save progress to DB', err);
        }
    };

    // 1. LocalStorage Update (Fast, every paragraph)
    useEffect(() => {
        if (!book?.id) return;
        const progress = {
            chapterId: currentChapterIndex,
            sentenceId: currentParagraphIndex
        };
        localStorage.setItem(`book-progress-${book.id}`, JSON.stringify(progress));
    }, [book?.id, currentChapterIndex, currentParagraphIndex]);

    // 2. Database Update (Slow, only on chapter change or play/pause)
    useEffect(() => {
        // Trigger save when keeping chapter index changes OR when pausing
        // We don't want to save on every paragraph.
        // But we DO want to save when the user stops listening or changes chapters.

        // If playing is FALSE (user paused), save. 
        // If chapter changed (currentChapterIndex changed), save (likely handled by the fact that component updates).

        // Note: checking !isPlaying might save when page loads (initially false), so ensure book is loaded.
        if (!book?.id) return;

        const timer = setTimeout(() => {
            saveToDb(currentChapterIndex, currentParagraphIndex);
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [book?.id, currentChapterIndex, isPlaying]);
    // ^ Note: This saves on Pause (isPlaying goes false).
    // It also saves on Play (isPlaying goes true), which is redundant but harmless.
    // It saves on Chapter Change.

    const fetchBook = async (id: string) => {
        try {
            const res = await fetch(`/api/books/${id}`);
            if (res.ok) {
                const data = await res.json();
                setBook(data);
                // Reset TTS state when a new book is loaded
                window.speechSynthesis.cancel();
                setIsPlaying(false);

                // Initialize Progress from DB
                if (typeof data.chapterId === 'number') {
                    setCurrentChapterIndex(data.chapterId);
                }
                if (typeof data.sentenceId === 'number') {
                    setCurrentParagraphIndex(data.sentenceId);
                } else {
                    setCurrentParagraphIndex(0);
                }
            } else {
                toast.error('Failed to load book');
                router.push('/books');
            }
        } catch (error) {
            toast.error('Error loading book');
        } finally {
            setLoading(false);
        }
    };

    const handleAddRule = async () => {
        if (!newRuleSearch) {
            toast.error('Search term is required');
            return;
        }

        try {
            const res = await fetch('/api/replacements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    search: newRuleSearch,
                    replace: newRuleReplace,
                    isRegex: newRuleIsRegex,
                    bookId: newRuleGlobal ? null : book?.id
                })
            });

            if (res.ok) {
                toast.success('Rule added');
                setNewRuleSearch('');
                setNewRuleReplace('');
                setNewRuleIsRegex(false);
                setNewRuleGlobal(false);
                if (book?.id) fetchRules(book.id);
            } else {
                toast.error('Failed to add rule');
            }
        } catch (error) {
            toast.error('Error adding rule');
        }
    };

    const handleDeleteRule = async (id: string) => {
        try {
            const res = await fetch(`/api/replacements?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Rule deleted');
                if (book?.id) fetchRules(book.id);
            } else {
                toast.error('Failed to delete rule');
            }
        } catch (error) {
            toast.error('Error deleting rule');
        }
    };

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

    const handleNextChapter = (autoPlay: boolean = false) => {
        if (book && currentChapterIndex < book.chapters.length - 1) {
            if (autoPlay) shouldPlayRef.current = true;
            window.speechSynthesis.cancel(); // Stop current speech
            setCurrentChapterIndex(prev => prev + 1);
            // Paragraph index reset handled in useEffect
        } else {
            setIsPlaying(false);
            window.speechSynthesis.cancel();
            toast('You have reached the end of the book.', { icon: '🏁' });
        }
    };

    const handlePrevChapter = () => {
        if (currentChapterIndex > 0) {
            window.speechSynthesis.cancel();
            setIsPlaying(false);
            setCurrentChapterIndex(prev => prev - 1);
        }
    };

    const handleJumpToChapter = (index: number) => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setCurrentChapterIndex(index);
        setSidebarOpen(false); // Close sidebar on selection
    };

    // Load settings from localStorage
    useEffect(() => {
        const storedFontSize = localStorage.getItem('book-font-size');
        const storedSpeed = localStorage.getItem('book-playback-speed');
        const storedVoice = localStorage.getItem('book-selected-voice');

        if (storedFontSize) setFontSize(parseInt(storedFontSize));
        if (storedSpeed) setPlaybackSpeed(parseFloat(storedSpeed));
        if (storedVoice) setSelectedVoice(storedVoice);
    }, []);

    const handleSpeedChange = (newSpeed: number) => {
        isSwitchingRef.current = true;
        setPlaybackSpeed(newSpeed);
        localStorage.setItem('book-playback-speed', newSpeed.toString());
    };

    const handleVoiceChange = (newVoice: string) => {
        isSwitchingRef.current = true;
        setSelectedVoice(newVoice);
        localStorage.setItem('book-selected-voice', newVoice);
    };

    const increaseFontSize = () => {
        setFontSize(prev => {
            const newSize = Math.min(prev + 4, 40);
            localStorage.setItem('book-font-size', newSize.toString());
            return newSize;
        });
    };

    const decreaseFontSize = () => {
        setFontSize(prev => {
            const newSize = Math.max(prev - 4, 14);
            localStorage.setItem('book-font-size', newSize.toString());
            return newSize;
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f3eacb] flex items-center justify-center text-[#5c4033]">
                <div className="animate-pulse text-xl font-serif">Loading Chapter...</div>
            </div>
        );
    }

    if (!book) return null;

    if (!book) return null;

    // Button Styles
    const topBtnStyle = "px-3 py-2 bg-[#b09e80] hover:bg-[#a08d6f] text-[#3e2b22] font-semibold rounded shadow-sm border border-[#8c7b60] flex items-center gap-2 transition-colors text-sm";
    const iconBtnStyle = "p-2 bg-[#b09e80] hover:bg-[#a08d6f] text-[#3e2b22] rounded-full shadow-sm border border-[#8c7b60] transition-colors flex items-center justify-center";

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-[#f3eacb] text-[#3e2b22] font-serif overflow-hidden">

                {/* Top Control Bar - Redesigned */}
                <header className="bg-[#dccbb3] border-b border-[#bfae95] px-4 py-3 shadow-sm shrink-0 z-20 flex items-center justify-between">

                    {/* Left: Navigation & Context */}
                    <div className="flex items-center gap-3">
                        <Link href="/books" className={iconBtnStyle} title="Back to Library">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </Link>
                        <button onClick={toggleSidebar} className={topBtnStyle} title="Table of Contents">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            <span className="hidden sm:inline">Chapters</span>
                        </button>
                        <div className="h-6 w-px bg-[#bfae95] mx-2 hidden sm:block"></div>
                        <span className="text-sm font-bold text-[#5c4033] hidden md:block truncate max-w-[300px]">
                            {book.title}
                        </span>
                    </div>

                    {/* Center: Playback Controls */}
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrevChapter} disabled={currentChapterIndex === 0} className={`${iconBtnStyle} ${currentChapterIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Previous Chapter">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </button>

                        <button onClick={handlePrevLine} className={iconBtnStyle} title="Previous Line">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
                        </button>

                        <button
                            onClick={handlePlay}
                            className="p-3 bg-[#8b7a60] hover:bg-[#6f5f4b] text-[#f3eacb] rounded-full shadow-md border border-[#5c4033] transition-transform hover:scale-105"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            )}
                        </button>

                        <button onClick={handleNextLine} className={iconBtnStyle} title="Next Line">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
                        </button>

                        <button onClick={() => handleNextChapter(false)} disabled={currentChapterIndex === book.chapters.length - 1} className={`${iconBtnStyle} ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Next Chapter">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    {/* Right: Settings */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#5c4033] hidden lg:block border-r border-[#bfae95] pr-3 mr-1 max-w-[300px] truncate" title={currentChapter?.title}>
                            {currentChapter?.title}
                        </span>
                        <button onClick={() => setShowReplacementModal(true)} className={topBtnStyle}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Settings
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden relative">
                    {/* Collapsible Sidebar */}
                    <div className={`absolute inset-y-0 left-0 z-10 w-80 bg-[#e8dbc3] border-r border-[#c2b091] transform transition-transform duration-300 ease-in-out shadow-lg flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <div className="p-3 border-b border-[#c2b091] bg-[#dccbb3] flex justify-between items-center">
                            <h3 className="font-bold text-[#3e2b22]">Table of Contents</h3>
                            <button onClick={toggleSidebar} className="p-1 hover:bg-[#c2b091] rounded">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2">
                            {book.chapters.map((chapter, index) => (
                                <button
                                    key={chapter.id}
                                    onClick={() => handleJumpToChapter(index)}
                                    className={`w-full text-left p-2 rounded mb-1 text-sm truncate ${currentChapterIndex === index
                                        ? 'bg-[#b09e80] text-[#2e1d15] font-bold'
                                        : 'hover:bg-[#dccbb3] text-[#5c4033]'
                                        }`}
                                >
                                    {chapter.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <main
                        ref={contentRef}
                        className="flex-1 overflow-y-auto p-6 md:p-12 relative bg-[#f3eacb] min-h-0"
                        onClick={() => sidebarOpen && setSidebarOpen(false)} // Close sidebar if clicking content
                    >
                        <div className="w-full max-w-[95%] mx-auto">
                            {/* Chapter Title */}
                            <h2 className="text-3xl md:text-4xl font-bold text-[#3e2b22] mb-10 pb-4 border-b border-[#d4c5b0]">
                                {currentChapter?.title}
                            </h2>

                            {/* Chapter Content */}
                            <div
                                className={`prose prose-p:text-[#2e1d15] prose-p:leading-loose font-serif max-w-none text-justify ${crimsonText.className}`}
                                style={{ fontSize: `${fontSize}px` }}
                            >
                                {processedContent.map((paragraph, idx) => (
                                    <p
                                        key={idx}
                                        id={`paragraph-${idx}`}
                                        className={`mb-8 p-2 rounded transition-colors duration-300 ${isPlaying && currentParagraphIndex === idx
                                            ? 'bg-[#e6d5b8] shadow-sm ring-1 ring-[#c2b091]'
                                            : ''
                                            }`}
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                            </div>

                            {/* Bottom Navigation */}
                            <div className="flex justify-between mt-20 pt-10 border-t border-[#d4c5b0]">
                                <button
                                    onClick={handlePrevChapter}
                                    disabled={currentChapterIndex === 0}
                                    className={`px-8 py-3 rounded bg-[#b09e80] text-[#2e1d15] font-bold text-lg hover:bg-[#a08d6f] transition-colors shadow-sm ${currentChapterIndex === 0 ? 'opacity-0' : ''}`}
                                >
                                    ← Previous
                                </button>
                                <button
                                    onClick={() => handleNextChapter(false)}
                                    disabled={currentChapterIndex === book.chapters.length - 1}
                                    className={`px-8 py-3 rounded bg-[#b09e80] text-[#2e1d15] font-bold text-lg hover:bg-[#a08d6f] transition-colors shadow-sm ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-0' : ''}`}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    </main>
                </div>

                {/* Book Settings Modal */}
                {showReplacementModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-[#f3eacb] rounded-lg shadow-xl w-full max-w-2xl border border-[#bfae95] p-6 max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-[#3e2b22] font-serif">Book Settings</h3>
                                <button onClick={() => setShowReplacementModal(false)} className="text-[#5c4033] hover:text-[#2e1d15]">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="space-y-6">

                                {/* Section: Display */}
                                <div>
                                    <h4 className="font-bold text-[#3e2b22] mb-3 border-b border-[#c2b091] pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                                        Display
                                    </h4>
                                    <div className="p-4 bg-[#e8dbc3] rounded border border-[#c2b091] flex items-center justify-between">
                                        <span className="font-semibold text-[#5c4033]">Font Size</span>
                                        <div className="flex items-center gap-2 bg-[#fffdf5] border border-[#bfb29f] rounded px-2 py-1">
                                            <button onClick={decreaseFontSize} className="px-3 py-1 font-bold text-[#5c4033] hover:text-[#3e2b22] border-r border-[#bfb29f]" title="Decrease Font Size">A-</button>
                                            <span className="text-sm text-[#5c4033] w-12 text-center font-medium">{fontSize}px</span>
                                            <button onClick={increaseFontSize} className="px-3 py-1 font-bold text-[#5c4033] hover:text-[#3e2b22] border-l border-[#bfb29f]" title="Increase Font Size">A+</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Audio */}
                                <div>
                                    <h4 className="font-bold text-[#3e2b22] mb-3 border-b border-[#c2b091] pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                        Audio
                                    </h4>
                                    <div className="p-4 bg-[#e8dbc3] rounded border border-[#c2b091] space-y-4">
                                        {/* Voice Selection */}
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                            <label className="font-semibold text-[#5c4033]">Voice</label>
                                            <select
                                                value={selectedVoice}
                                                onChange={(e) => handleVoiceChange(e.target.value)}
                                                className="bg-[#fffdf5] border border-[#bfb29f] text-[#3e2b22] px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#8b7a60] w-full md:w-64"
                                            >
                                                {voices.length > 0 ? (
                                                    voices.map((voice) => (
                                                        <option key={voice.name} value={voice.name}>
                                                            {voice.name} ({voice.lang})
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option>Loading voices...</option>
                                                )}
                                            </select>
                                        </div>
                                        {/* Speed Control */}
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-[#5c4033]">Speed ({playbackSpeed}x)</span>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="2.0"
                                                step="0.1"
                                                value={playbackSpeed}
                                                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                                className="w-32 md:w-48 h-2 bg-[#8b7a60] rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Word Replacement */}
                                <div>
                                    <h4 className="font-bold text-[#3e2b22] mb-3 border-b border-[#c2b091] pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        Word Replacements
                                    </h4>

                                    {/* Add Rule Form */}
                                    <div className="bg-[#e8dbc3] p-4 rounded mb-4 border border-[#c2b091]">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <input
                                                type="text"
                                                placeholder="Search for..."
                                                value={newRuleSearch}
                                                onChange={(e) => setNewRuleSearch(e.target.value)}
                                                className="p-2 rounded border border-[#bfb29f] bg-[#fffdf5] text-[#3e2b22] focus:outline-none focus:ring-1 focus:ring-[#8b7a60]"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Replace with..."
                                                value={newRuleReplace}
                                                onChange={(e) => setNewRuleReplace(e.target.value)}
                                                className="p-2 rounded border border-[#bfb29f] bg-[#fffdf5] text-[#3e2b22] focus:outline-none focus:ring-1 focus:ring-[#8b7a60]"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <label className="flex items-center gap-2 text-[#5c4033] font-medium cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleIsRegex}
                                                        onChange={(e) => setNewRuleIsRegex(e.target.checked)}
                                                        className="w-4 h-4 rounded border-[#bfb29f] text-[#8b7a60] focus:ring-[#8b7a60]"
                                                    />
                                                    Use Regex
                                                </label>
                                                <label className="flex items-center gap-2 text-[#5c4033] font-medium cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleGlobal}
                                                        onChange={(e) => setNewRuleGlobal(e.target.checked)}
                                                        className="w-4 h-4 rounded border-[#bfb29f] text-[#8b7a60] focus:ring-[#8b7a60]"
                                                    />
                                                    Apply to ALL books
                                                </label>
                                            </div>
                                            <button
                                                onClick={handleAddRule}
                                                className="px-4 py-2 bg-[#8b7a60] text-white rounded font-bold hover:bg-[#6f5f4b] transition-colors flex items-center gap-2"
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                Add Rule
                                            </button>
                                        </div>
                                    </div>

                                    {/* Rules List */}
                                    <div className="space-y-2">
                                        {replacementRules.map((rule) => (
                                            <div key={rule.id} className="flex items-center justify-between p-3 bg-[#e8dbc3] rounded border border-[#c2b091] group">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-[#3e2b22]">{rule.search}</span>
                                                        <span className="text-[#8c7b60]">→</span>
                                                        <span className="font-bold text-[#3e2b22]">{rule.replace}</span>
                                                    </div>
                                                    <div className="flex gap-2 text-xs text-[#5c4033] mt-1">
                                                        {rule.isRegex && <span className="px-1.5 py-0.5 bg-[#d7c9b0] rounded border border-[#bfae95]">Regex</span>}
                                                        {rule.bookId === null
                                                            ? <span className="px-1.5 py-0.5 bg-[#4a6b4a] text-white rounded">Global</span>
                                                            : <span className="px-1.5 py-0.5 bg-[#8b7a60] text-white rounded">This Book</span>
                                                        }
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className="p-2 text-red-600 hover:bg-[#d7c9b0] rounded transition-colors"
                                                    title="Delete Rule"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        ))}
                                        {replacementRules.length === 0 && (
                                            <div className="text-center py-8 text-[#8c7b60] italic">
                                                No replacement rules active.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Section: Advanced */}
                                <div>
                                    <h4 className="font-bold text-[#3e2b22] mb-3 border-b border-[#c2b091] pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                        Danger Zone
                                    </h4>
                                    <div className="p-4 bg-[#e8dbc3]/50 rounded border border-[#c2b091] flex justify-between items-center">
                                        <span className="text-sm text-[#5c4033]">Clear cached chapters for this book</span>
                                        <button className="px-3 py-1 bg-red-800 hover:bg-red-700 text-[#f3eacb] text-sm font-bold rounded shadow-sm transition-colors">
                                            Delete Cache
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
