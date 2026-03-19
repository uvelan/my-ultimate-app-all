'use client';

import { useState, useEffect, useRef } from 'react';
import { diffWords } from 'diff';
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
import { saveBookToCache, getBookFromCache, deleteBookFromCache, Book as DBBook } from '@/lib/book-db';

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
    const [isLightMode, setIsLightMode] = useState(false);

    useEffect(() => {
        const storedTheme = localStorage.getItem('reader-theme');
        if (storedTheme === 'light') {
            setIsLightMode(true);
            document.documentElement.classList.add('theme-light');
        }
    }, []);

    const toggleTheme = () => {
        setIsLightMode(prev => {
            const next = !prev;
            if (next) {
                document.documentElement.classList.add('theme-light');
                localStorage.setItem('reader-theme', 'light');
            } else {
                document.documentElement.classList.remove('theme-light');
                localStorage.setItem('reader-theme', 'dark');
            }
            return next;
        });
    };

    const [isCorrectingGrammar, setIsCorrectingGrammar] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [correctedContent, setCorrectedContent] = useState<string[] | null>(null);
    const [aiModel, setAiModel] = useState('OFF'); // OFF by default so it doesn't auto-correct without user asking
    const correctedChaptersRef = useRef<Set<string>>(new Set());

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
    const resumePlayAfterGrammarRef = useRef(false);

    const isSwitchingRef = useRef(false);
    const hasBookLoadedRef = useRef(false); // tracks whether the book has been loaded at least once

    const contentRef = useRef<HTMLDivElement>(null);

    // Load Voices
    useEffect(() => {
        const loadVoices = () => {
            const available = window.speechSynthesis.getVoices();
            // Sort: Local service (offline) first, then alphabetical
            available.sort((a, b) => {
                if (a.localService === b.localService) {
                    return a.name.localeCompare(b.name);
                }
                return a.localService ? -1 : 1;
            });
            console.log("Voices loaded:", available.length);
            setVoices(available);
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;

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
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
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
                        return paragraph.split(searchValue).join(replaceValue);
                    }
                });
            } catch (e) {
                console.error(`Invalid replacement rule: ${rule.search}`, e);
            }
        });

        setProcessedContent(newContent);

        // Logic to handle chapter change auto-play removed from here to prevent
        // resetting currentParagraphIndex on every book state change.
        // It is now handled in handleNextChapter, handlePrevChapter, etc.
    }, [book, currentChapterIndex, replacementRules]);

    // Scroll to top when chapter changes
    useEffect(() => {
        if (contentRef.current && !shouldPlayRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [currentChapterIndex]);

    // Highlight active paragraph
    useEffect(() => {
        if (contentRef.current) {
            const activeEl = document.getElementById(`paragraph-${currentParagraphIndex}`);
            if (activeEl) {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentParagraphIndex]);

    // Scroll TOC to active chapter when sidebar opens
    useEffect(() => {
        if (sidebarOpen) {
            // Small timeout to allow transition/render
            setTimeout(() => {
                const activeChapterEl = document.getElementById(`toc-chapter-${currentChapterIndex}`);
                if (activeChapterEl) {
                    activeChapterEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [sidebarOpen, currentChapterIndex]);

    // Main TTS Drive Effect
    useEffect(() => {
        if (!isPlaying || processedContent.length === 0) {
            window.speechSynthesis.cancel();
            return;
        }

        // Handle End of Chapter
        if (currentParagraphIndex >= processedContent.length) {
            handleNextChapter(true);
            return;
        }

        // If we are currently correcting grammar (e.g. from autoPlay chapter transition), wait.
        if (isCorrectingGrammar) {
            return;
        }

        const text = processedContent[currentParagraphIndex];

        // Skip empty paragraphs
        if (!text || !text.trim()) {
            setCurrentParagraphIndex(prev => prev + 1);
            return;
        }

        // Cancel previous speech and invalidate ref to prevent onend from advancing
        speechRef.current = null;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = playbackSpeed;

        const voice = voices.find(v => v.name === selectedVoice) || voices[0];
        if (voice) utterance.voice = voice;

        // Guard against race conditions using closure
        utterance.onend = () => {
            // If this utterance is not the current one (e.g. cancelled), do nothing
            if (speechRef.current !== utterance) return;

            // Move to next paragraph
            setCurrentParagraphIndex(prev => prev + 1);
        };

        utterance.onerror = (e) => {
            console.error("TTS Error:", e);
            if (speechRef.current !== utterance) return;
            // Should we advance? Maybe logs error and stops.
            // For now, let's stop to avoid infinite error loops
            setIsPlaying(false);
        };

        speechRef.current = utterance;
        window.speechSynthesis.speak(utterance);

        // We don't need a cleanup to cancel here specifically, 
        // because the next run will cancel. 
        // But on unmount/isPlaying=false, we cancel.

    }, [currentParagraphIndex, isPlaying, processedContent, playbackSpeed, selectedVoice, voices]);


    const autoCorrectChapter = async (chap: Chapter, index: number) => {
        if (aiModel === 'OFF' || correctedChaptersRef.current.has(chap.id)) return true;

        setIsCorrectingGrammar(true);
        // Pause playback while we are generating the new chapter text so we don't start reading the uncorrected one.
        setIsPlaying(false);
        window.speechSynthesis.pause();

        const toastId = toast.loading(`Auto-correcting grammar (${aiModel})...`);
        try {
            const res = await fetch('/api/grammar-correct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapterId: chap.id, modelId: aiModel })
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return false;
            }
            if (!res.ok) throw new Error('Correction failed');

            const data = await res.json();
            const newContent = data.correctedContent;

            // Save to backend automatically
            const patchRes = await fetch(`/api/chapters/${chap.id}/content`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });

            if (patchRes.ok) {
                setBook(prev => {
                    if (!prev) return prev;
                    const updatedChapters = [...prev.chapters];
                    updatedChapters[index] = { ...updatedChapters[index], content: newContent };
                    const updatedBook = { ...prev, chapters: updatedChapters };
                    saveBookToCache(updatedBook).catch(console.error);
                    return updatedBook;
                });
                correctedChaptersRef.current.add(chap.id);
                toast.success('Grammar corrected!', { id: toastId });
                // Return true to indicate success
                return true;
            } else {
                throw new Error('Failed to save DB');
            }
        } catch (error) {
            console.error(error);
            toast.error('Auto grammar fix failed, continuing...', { id: toastId });
            return false;
        } finally {
            setIsCorrectingGrammar(false);
        }
    };

    const handlePlay = async () => {
        if (!isPlaying) {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
                setIsPlaying(true);
                return;
            }
            // Starting fresh
            if (aiModel !== 'OFF' && currentChapter && !correctedChaptersRef.current.has(currentChapter.id)) {
                await autoCorrectChapter(currentChapter, currentChapterIndex);
            }
            setIsPlaying(true);
        } else {
            setIsPlaying(false);
            window.speechSynthesis.pause();
        }
    };

    const handleStop = () => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setCurrentParagraphIndex(0);
    };

    const handleNextLine = () => {
        setCurrentParagraphIndex(prev => Math.min(prev + 1, processedContent.length)); // Allow going to length to trigger next chapter
    };

    const handlePrevLine = () => {
        setCurrentParagraphIndex(prev => Math.max(0, prev - 1));
    };

    // --- Keyboard & Media Controls ---

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
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
    }, [isPlaying, currentChapterIndex]); // currentChapterIndex needed so chapter-nav handlers see fresh state

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
            const res = await fetch(`/api/books/${book.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chapterId: cIndex,
                    sentenceId: pIndex
                })
            });
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
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
        // Don't save progress on the initial load — that would overwrite the user's saved position.
        if (!book?.id || !hasBookLoadedRef.current) return;

        const timer = setTimeout(() => {
            saveToDb(currentChapterIndex, currentParagraphIndex);
        }, 800); // slightly longer debounce to reduce writes

        return () => clearTimeout(timer);
    }, [book?.id, currentChapterIndex, isPlaying]);
    // ^ Note: This saves on Pause (isPlaying goes false).
    // It also saves on Play (isPlaying goes true), which is redundant but harmless.
    // It saves on Chapter Change.


    const handleGrammarCorrection = async () => {
        if (!book || !currentChapter) return;

        if (isPlaying) {
            resumePlayAfterGrammarRef.current = true;
            setIsPlaying(false);
            window.speechSynthesis.pause();
        } else {
            resumePlayAfterGrammarRef.current = false;
        }

        setIsCorrectingGrammar(true);
        const toastId = toast.loading('Correcting grammar with Gemini (this may take a minute)...');

        try {
            const res = await fetch('/api/grammar-correct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chapterId: currentChapter.id, modelId: aiModel })
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }

            if (!res.ok) {
                const data = await res.json();
                if (data.rawResponse) console.error("Raw AI Response:", data.rawResponse);
                if (data.details) console.error("Parse Details:", data.details);
                throw new Error(data.details ? `${data.error} Details: ${data.details}` : data.error || 'Failed to correct grammar');
            }

            const data = await res.json();
            setCorrectedContent(data.correctedContent);
            setShowDiffModal(true);
            toast.success('Grammar correction ready for review!', { id: toastId });
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error running grammar correction', { id: toastId });
            if (resumePlayAfterGrammarRef.current) {
                resumePlayAfterGrammarRef.current = false;
                window.speechSynthesis.resume();
                setIsPlaying(true);
            }
        } finally {
            setIsCorrectingGrammar(false);
        }
    };

    const confirmGrammarChanges = async () => {
        if (!book || !currentChapter || !correctedContent) return;

        const toastId = toast.loading('Saving changes...');
        try {
            const res = await fetch(`/api/chapters/${currentChapter.id}/content`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: correctedContent })
            });

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }

            if (!res.ok) throw new Error('Failed to save changes');

            // Update local state
            const updatedChapters = [...book.chapters];
            updatedChapters[currentChapterIndex] = { ...currentChapter, content: correctedContent };
            const updatedBook = { ...book, chapters: updatedChapters };

            setBook(updatedBook);
            saveBookToCache(updatedBook).catch(console.error);
            if (currentChapter?.id) {
                correctedChaptersRef.current.add(currentChapter.id);
            }

            setShowDiffModal(false);
            setCorrectedContent(null);
            toast.success('Chapter grammar updated!', { id: toastId });

            if (resumePlayAfterGrammarRef.current) {
                resumePlayAfterGrammarRef.current = false;
                // Add a small delay so the component has a chance to update with new content
                setTimeout(() => {
                    window.speechSynthesis.resume();
                    setIsPlaying(true);
                }, 500);
            }
        } catch (error: any) {
            console.error(error);
            toast.error('Failed to save grammar changes.', { id: toastId });
            if (resumePlayAfterGrammarRef.current) {
                resumePlayAfterGrammarRef.current = false;
                window.speechSynthesis.resume();
                setIsPlaying(true);
            }
        }
    };

    const fetchBook = async (id: string) => {
        try {
            // Try loading from cache first
            const cachedBook = await getBookFromCache(id);
            if (cachedBook) {
                console.log('Loaded book from cache');
                setBook(cachedBook as Book);
                setLoading(false);

                // Initialize Progress from DB/Local even if cached
                let finalChapterIndex = typeof cachedBook.chapterId === 'number' ? cachedBook.chapterId : 0;
                let finalSentenceIndex = typeof cachedBook.sentenceId === 'number' ? cachedBook.sentenceId : 0;
                let needsDbUpdate = false;

                const savedProgress = localStorage.getItem(`book-progress-${id}`);
                if (savedProgress) {
                    try {
                        const parsed = JSON.parse(savedProgress);
                        const localChapterId = typeof parsed.chapterId === 'number' ? parsed.chapterId : 0;
                        const localSentenceId = typeof parsed.sentenceId === 'number' ? parsed.sentenceId : 0;

                        if (localChapterId > finalChapterIndex || (localChapterId === finalChapterIndex && localSentenceId > finalSentenceIndex)) {
                            finalChapterIndex = localChapterId;
                            finalSentenceIndex = localSentenceId;
                            needsDbUpdate = true;
                        }
                    } catch (e) {
                        console.error("Parse error for cache read progress", e);
                    }
                }

                setCurrentChapterIndex(finalChapterIndex);
                setCurrentParagraphIndex(finalSentenceIndex);

                if (needsDbUpdate) {
                    fetch(`/api/books/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chapterId: finalChapterIndex, sentenceId: finalSentenceIndex })
                    }).catch(console.error);
                }

                // Optional: Trigger background update
                fetchBookNetwork(id);
                return;
            }

            await fetchBookNetwork(id);
        } catch (error) {
            console.error('Error in fetchBook:', error);
            toast.error('Error loading book');
            setLoading(false);
        }
    };

    const fetchBookNetwork = async (id: string) => {
        try {
            const res = await fetch(`/api/books/${id}`);
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setBook(data);

                // Save to cache
                saveBookToCache(data).catch(err => console.error("Failed to cache book:", err));

                // Reset TTS state when a new book is loaded
                window.speechSynthesis.cancel();
                setIsPlaying(false);

                // Initialize Progress from DB vs Local Storage
                let finalChapterIndex = typeof data.chapterId === 'number' ? data.chapterId : 0;
                let finalSentenceIndex = typeof data.sentenceId === 'number' ? data.sentenceId : 0;
                let needsDbUpdate = false;

                const savedProgress = localStorage.getItem(`book-progress-${id}`);
                if (savedProgress) {
                    try {
                        const parsed = JSON.parse(savedProgress);
                        const localChapterId = typeof parsed.chapterId === 'number' ? parsed.chapterId : 0;
                        const localSentenceId = typeof parsed.sentenceId === 'number' ? parsed.sentenceId : 0;

                        if (localChapterId > finalChapterIndex || (localChapterId === finalChapterIndex && localSentenceId > finalSentenceIndex)) {
                            finalChapterIndex = localChapterId;
                            finalSentenceIndex = localSentenceId;
                            needsDbUpdate = true;
                        }
                    } catch (e) {
                        console.error("Parse error for read progress", e);
                    }
                }

                setCurrentChapterIndex(finalChapterIndex);
                setCurrentParagraphIndex(finalSentenceIndex);

                if (needsDbUpdate) {
                    fetch(`/api/books/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chapterId: finalChapterIndex, sentenceId: finalSentenceIndex })
                    }).catch(console.error);
                }
                // Mark book as fully loaded so progress-save effect can now fire
                hasBookLoadedRef.current = true;
            } else {
                if (!book) { // Only show error if we don't have book (cached or otherwise)
                    toast.error('Failed to load book from network');
                    // router.push('/books'); // Don't redirect immediately, maybe offline?
                }
            }
        } catch (error) {
            if (!book) toast.error('Error loading book from network');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCache = async () => {
        if (!book?.id) return;
        try {
            await deleteBookFromCache(book.id);
            toast.success('Book cache deleted');
        } catch (error) {
            console.error('Failed to delete cache:', error);
            toast.error('Failed to delete cache');
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

            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }

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
            if (res.status === 401 || res.status === 403) {
                router.push('/login');
                return;
            }
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
            setCurrentParagraphIndex(0);
            setCurrentChapterIndex(prev => prev + 1);
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
            setCurrentParagraphIndex(0);
            setCurrentChapterIndex(prev => prev - 1);
        }
    };

    const handleJumpToChapter = (index: number) => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setCurrentParagraphIndex(0);
        setCurrentChapterIndex(index);
        setSidebarOpen(false); // Close sidebar on selection
    };

    // Auto-play hook when chapter advances
    useEffect(() => {
        const checkAutoPlay = async () => {
            if (shouldPlayRef.current) {
                const chap = book?.chapters[currentChapterIndex];

                // If auto-correction is enabled and hasn't been done yet
                if (chap && aiModel !== 'OFF' && !correctedChaptersRef.current.has(chap.id)) {
                    // This pauses TTS (inside autoCorrectChapter) and waits for it to finish and save state
                    const success = await autoCorrectChapter(chap, currentChapterIndex);

                    if (success) {
                        // Reset the ref since we handled it
                        shouldPlayRef.current = false;

                        // We must wait a tiny bit for the React state (setBook -> setProcessedContent) 
                        // to actually flush to the DOM before we tell TTS to read the new `processedContent`
                        setTimeout(() => {
                            window.speechSynthesis.resume();
                            setIsPlaying(true);
                        }, 500);
                    } else {
                        // It failed, just play the original
                        shouldPlayRef.current = false;
                        setIsPlaying(true);
                    }
                } else {
                    // No correction needed, just play
                    shouldPlayRef.current = false;
                    setIsPlaying(true);
                }
            }
        };
        checkAutoPlay();
    }, [currentChapterIndex, book, aiModel]);

    // Load settings from localStorage
    useEffect(() => {
        const storedFontSize = localStorage.getItem('book-font-size');
        const storedSpeed = localStorage.getItem('book-playback-speed');
        const storedVoice = localStorage.getItem('book-selected-voice');
        const storedAiModel = localStorage.getItem('book-ai-model');

        if (storedFontSize) setFontSize(parseInt(storedFontSize));
        if (storedSpeed) setPlaybackSpeed(parseFloat(storedSpeed));
        if (storedVoice) setSelectedVoice(storedVoice);
        if (storedAiModel) setAiModel(storedAiModel);
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

    const handleAiModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setAiModel(newModel);
        localStorage.setItem('book-ai-model', newModel);
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
            <div className="min-h-screen bg-background flex items-center justify-center text-text-secondary">
                <div className="animate-pulse text-xl font-serif text-accent">Loading Chapter...</div>
            </div>
        );
    }

    if (!book) return null;

    // Button Styles
    const topBtnStyle = "px-3 py-2 bg-background-surface hover:bg-border text-text-primary font-semibold rounded-lg shadow-sm border border-border flex items-center gap-2 transition-colors text-sm whitespace-nowrap shrink-0";
    const iconBtnStyle = "p-2 bg-background-surface hover:bg-border text-text-primary rounded-full shadow-sm border border-border transition-colors flex items-center justify-center shrink-0";

    return (
        <ProtectedRoute>
            <div className="flex flex-col h-screen bg-background text-text-primary font-serif overflow-hidden">

                {/* Top Control Bar */}
                <header className="bg-background-surface border-b border-border px-2 md:px-4 py-2 md:py-3 shadow-sm shrink-0 z-20 flex items-center justify-between gap-2 overflow-hidden">

                    {/* Left: Navigation & Context */}
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 shrink">
                        <Link href="/books" className={iconBtnStyle} title="Back to Library">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </Link>
                        <button onClick={toggleSidebar} className={topBtnStyle} title="Table of Contents">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                            <span className="hidden sm:inline">Chapters</span>
                        </button>
                        <div className="h-6 w-px bg-border mx-2 hidden sm:block shrink-0"></div>
                        <span className="text-sm font-bold text-text-secondary hidden md:block truncate min-w-0">
                            {book.title}
                        </span>
                    </div>

                    {/* Center: Playback Controls */}
                    <div className="flex items-center gap-1 md:gap-2">
                        <button onClick={handlePrevChapter} disabled={currentChapterIndex === 0} className={`${iconBtnStyle} ${currentChapterIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Previous Chapter">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </button>

                        <button onClick={handlePrevLine} className={iconBtnStyle} title="Previous Line">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
                        </button>

                        <button
                            onClick={handlePlay}
                            className="p-2 md:p-3 bg-accent hover:bg-accent/80 text-white rounded-full shadow-md shadow-accent/30 border border-accent/50 transition-transform hover:scale-105"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            )}
                        </button>

                        <button onClick={handleNextLine} className={iconBtnStyle} title="Next Line">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
                        </button>

                        <button onClick={() => handleNextChapter(false)} disabled={currentChapterIndex === book.chapters.length - 1} className={`${iconBtnStyle} ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`} title="Next Chapter">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    {/* Right: Settings */}
                    <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                        <span className="text-sm font-medium text-text-secondary hidden lg:block border-r border-border pr-3 mr-1 max-w-[160px] truncate" title={currentChapter?.title}>
                            {currentChapter?.title}
                        </span>

                        {/* Desktop AI model selector + fix button */}
                        <div className="hidden sm:flex items-center">
                            <select
                                value={aiModel}
                                onChange={handleAiModelChange}
                                className="bg-background border border-border text-text-primary text-sm px-2 py-1.5 rounded-l border-r-0 focus:outline-none focus:ring-1 focus:ring-accent h-[34px] md:h-[38px] cursor-pointer max-w-[130px] md:max-w-none"
                                title="Select AI Model"
                            >
                                <option value="OFF">Grammar: OFF</option>
                                <option value="gemini-2.5-flash">Gemini Flash</option>
                                <option value="gpt-4o-mini">ChatGPT Mini</option>
                                <option value="pollinations">Pollinations</option>
                                <option value="ollama">Ollama</option>
                            </select>
                            <button
                                onClick={handleGrammarCorrection}
                                disabled={isCorrectingGrammar || aiModel === 'OFF'}
                                className={`px-3 py-1.5 h-[34px] md:h-[38px] bg-background-surface hover:bg-border text-text-primary font-semibold rounded-r shadow-sm border border-border flex items-center gap-1.5 transition-colors text-sm whitespace-nowrap shrink-0 ${isCorrectingGrammar || aiModel === 'OFF' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title="Correct Grammar"
                            >
                                {isCorrectingGrammar ? (
                                    <svg className="animate-spin h-4 w-4 text-[#5c4033]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                                )}
                                <span className="hidden lg:inline">AI Fix</span>
                            </button>
                        </div>

                        {/* Mobile: icon-only AI Fix button */}
                        <button
                            onClick={handleGrammarCorrection}
                            disabled={isCorrectingGrammar || aiModel === 'OFF'}
                            className={`sm:hidden ${iconBtnStyle} ${isCorrectingGrammar || aiModel === 'OFF' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="AI Grammar Fix"
                        >
                            {isCorrectingGrammar ? (
                                <svg className="animate-spin h-4 w-4 text-[#5c4033]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            )}
                        </button>

                        {/* Theme Toggle Button */}
                        <button onClick={toggleTheme} className={iconBtnStyle} title="Toggle Theme">
                            {isLightMode ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                            )}
                        </button>

                        {/* Settings button */}
                        <button onClick={() => setShowReplacementModal(true)} className={topBtnStyle} title="Settings">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span className="hidden sm:inline">Settings</span>
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden relative">
                    {/* Collapsible Sidebar */}
                    <div
                        className={`absolute inset-y-0 left-0 z-20 w-3/4 sm:w-80 bg-background-surface border-r border-border transform transition-transform duration-300 ease-in-out shadow-2xl shadow-black/50 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="p-3 border-b border-border bg-background flex justify-between items-center">
                            <h3 className="font-bold text-text-primary">Table of Contents</h3>
                            <button onClick={toggleSidebar} className="p-1 hover:bg-border rounded text-text-secondary">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2">
                            {book.chapters.map((chapter, index) => (
                                <button
                                    key={chapter.id}
                                    id={`toc-chapter-${index}`}
                                    onClick={() => handleJumpToChapter(index)}
                                    className={`w-full text-left p-2 rounded-lg mb-1 text-sm truncate transition-colors ${currentChapterIndex === index
                                        ? 'bg-accent/20 text-accent font-bold border-l-2 border-accent pl-3'
                                        : 'hover:bg-border text-text-secondary'
                                        }`}
                                >
                                    {chapter.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visual Backdrop for Sidebar (Mobile/Tablet) */}
                    {sidebarOpen && (
                        <div
                            className="absolute inset-0 bg-black/30 z-10 backdrop-blur-[1px] transition-opacity"
                            onClick={() => setSidebarOpen(false)}
                        ></div>
                    )}

                    {/* Main Content Area */}
                    <main
                        ref={contentRef}
                        className="flex-1 overflow-y-auto p-4 md:p-12 relative bg-background min-h-0"
                    >
                        <div className="w-full max-w-[95%] lg:max-w-4xl mx-auto">
                            {/* Chapter Title */}
                            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-text-primary mb-6 md:mb-10 pb-4 border-b border-border">
                                {currentChapter?.title}
                            </h2>

                            {/* Chapter Content */}
                            <div
                                className={`prose prose-invert prose-p:text-text-primary prose-p:leading-loose font-serif max-w-none text-justify ${crimsonText.className}`}
                                style={{ fontSize: `${fontSize}px` }}
                            >
                                {processedContent.map((paragraph, idx) => (
                                    <p
                                        key={idx}
                                        id={`paragraph-${idx}`}
                                        className={`mb-6 md:mb-8 p-2 rounded-lg transition-colors duration-300 ${isPlaying && currentParagraphIndex === idx
                                            ? 'bg-accent/10 shadow-sm ring-1 ring-accent/50 text-text-primary'
                                            : 'text-text-primary'
                                            }`}
                                    >
                                        {paragraph}
                                    </p>
                                ))}
                            </div>

                            {/* Bottom Navigation */}
                            <div className="flex items-center justify-between mt-10 md:mt-20 pt-6 md:pt-10 border-t border-border gap-4">
                                <button
                                    onClick={handlePrevChapter}
                                    disabled={currentChapterIndex === 0}
                                    className={`flex-1 px-4 py-3 md:px-8 md:py-3 rounded-lg bg-background-surface hover:bg-border text-text-primary font-bold text-sm md:text-lg border border-border transition-colors shadow-sm whitespace-nowrap ${currentChapterIndex === 0 ? 'opacity-0 pointer-events-none' : ''}`}
                                >
                                    ← Previous
                                </button>
                                <button
                                    onClick={() => handleNextChapter(false)}
                                    disabled={currentChapterIndex === book.chapters.length - 1}
                                    className={`flex-1 px-4 py-3 md:px-8 md:py-3 rounded-lg bg-accent hover:bg-accent/80 text-white font-bold text-sm md:text-lg border border-accent/50 transition-colors shadow-sm shadow-accent/20 whitespace-nowrap ${currentChapterIndex === book.chapters.length - 1 ? 'opacity-0 pointer-events-none' : ''}`}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    </main>
                </div>

                {/* Book Settings Modal */}
                {showReplacementModal && (
                    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-background-surface rounded-xl shadow-2xl w-full max-w-2xl border border-border p-6 max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-text-primary font-serif">Book Settings</h3>
                                <button onClick={() => setShowReplacementModal(false)} className="text-text-secondary hover:text-text-primary">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="space-y-6">

                                {/* Section: Display */}
                                <div>
                                    <h4 className="font-bold text-text-primary mb-3 border-b border-border pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                                        Display
                                    </h4>
                                    <div className="p-4 bg-background rounded-lg border border-border flex items-center justify-between">
                                        <span className="font-semibold text-text-secondary">Font Size</span>
                                        <div className="flex items-center gap-2 bg-background-surface border border-border rounded-lg px-2 py-1">
                                            <button onClick={decreaseFontSize} className="px-3 py-1 font-bold text-text-secondary hover:text-text-primary border-r border-border" title="Decrease Font Size">A-</button>
                                            <span className="text-sm text-text-secondary w-12 text-center font-medium">{fontSize}px</span>
                                            <button onClick={increaseFontSize} className="px-3 py-1 font-bold text-text-secondary hover:text-text-primary border-l border-border" title="Increase Font Size">A+</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Audio */}
                                <div>
                                    <h4 className="font-bold text-text-primary mb-3 border-b border-border pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                        Audio
                                    </h4>
                                    <div className="p-4 bg-background rounded-lg border border-border space-y-4">
                                        {/* Voice Selection */}
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                            <label className="font-semibold text-text-secondary">Voice</label>
                                            <select
                                                value={selectedVoice}
                                                onChange={(e) => handleVoiceChange(e.target.value)}
                                                className="bg-background-surface border border-border text-text-primary px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent w-full md:w-64"
                                            >
                                                {voices.length > 0 ? (
                                                    voices.map((voice) => (
                                                        <option key={voice.name} value={voice.name}>
                                                            {voice.name} ({voice.lang}) {voice.localService ? '[Offline]' : '[Online]'}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option>Loading voices...</option>
                                                )}
                                            </select>
                                        </div>
                                        {/* Speed Control */}
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-text-secondary">Speed ({playbackSpeed}x)</span>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="2.0"
                                                step="0.1"
                                                value={playbackSpeed}
                                                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                                className="w-32 md:w-48 h-2 bg-accent rounded-lg appearance-none cursor-pointer accent-accent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Word Replacement */}
                                <div>
                                    <h4 className="font-bold text-text-primary mb-3 border-b border-border pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        Word Replacements
                                    </h4>

                                    {/* Add Rule Form */}
                                    <div className="bg-background p-4 rounded-lg mb-4 border border-border">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <input
                                                type="text"
                                                placeholder="Search for..."
                                                value={newRuleSearch}
                                                onChange={(e) => setNewRuleSearch(e.target.value)}
                                                className="p-2 rounded-lg border border-border bg-background-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Replace with..."
                                                value={newRuleReplace}
                                                onChange={(e) => setNewRuleReplace(e.target.value)}
                                                className="p-2 rounded-lg border border-border bg-background-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <label className="flex items-center gap-2 text-text-secondary font-medium cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleIsRegex}
                                                        onChange={(e) => setNewRuleIsRegex(e.target.checked)}
                                                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                                                    />
                                                    Use Regex
                                                </label>
                                                <label className="flex items-center gap-2 text-text-secondary font-medium cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newRuleGlobal}
                                                        onChange={(e) => setNewRuleGlobal(e.target.checked)}
                                                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                                                    />
                                                    Apply to ALL books
                                                </label>
                                            </div>
                                            <button
                                                onClick={handleAddRule}
                                                className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                Add Rule
                                            </button>
                                        </div>
                                    </div>

                                    {/* Rules List */}
                                    <div className="space-y-2">
                                        {replacementRules.map((rule) => (
                                            <div key={rule.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border group">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-text-primary">{rule.search}</span>
                                                        <span className="text-text-muted">→</span>
                                                        <span className="font-bold text-text-primary">{rule.replace}</span>
                                                    </div>
                                                    <div className="flex gap-2 text-xs text-text-secondary mt-1">
                                                        {rule.isRegex && <span className="px-1.5 py-0.5 bg-background-surface rounded border border-border">Regex</span>}
                                                        {rule.bookId === null
                                                            ? <span className="px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">Global</span>
                                                            : <span className="px-1.5 py-0.5 bg-accent/20 text-accent rounded">This Book</span>
                                                        }
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className="p-2 text-red-400 hover:bg-border rounded-lg transition-colors"
                                                    title="Delete Rule"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        ))}
                                        {replacementRules.length === 0 && (
                                            <div className="text-center py-8 text-text-muted italic">
                                                No replacement rules active.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Section: Advanced */}
                                <div>
                                    <h4 className="font-bold text-red-400 mb-3 border-b border-red-900/30 pb-1 flex items-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                        Danger Zone
                                    </h4>
                                    <div className="p-4 bg-red-900/10 rounded-lg border border-red-900/30 flex justify-between items-center">
                                        <span className="text-sm text-text-secondary">Clear cached chapters for this book</span>
                                        <button
                                            onClick={handleDeleteCache}
                                            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
                                        >
                                            Delete Cache
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {/* Grammar Diff Modal */}
                {showDiffModal && correctedContent && currentChapter && (
                    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-background-surface rounded-xl shadow-2xl w-full max-w-4xl border border-border flex flex-col max-h-[90vh]">
                            <div className="p-4 md:p-6 border-b border-border flex justify-between items-center bg-background rounded-t-xl shrink-0">
                                <div>
                                    <h3 className="text-xl md:text-2xl font-bold text-text-primary font-serif">Review Grammar Changes</h3>
                                    <p className="text-sm text-text-secondary mt-1">Review the AI-suggested corrections for {currentChapter.title}</p>
                                </div>
                                <button onClick={() => {
                                    setShowDiffModal(false);
                                    if (resumePlayAfterGrammarRef.current) {
                                        resumePlayAfterGrammarRef.current = false;
                                        window.speechSynthesis.resume();
                                        setIsPlaying(true);
                                    }
                                }} className="text-text-secondary hover:text-text-primary bg-border p-2 rounded-full transition-colors">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-background">
                                <div className="space-y-6 font-serif text-lg leading-relaxed text-text-primary">
                                    {currentChapter.content.map((originalParagraph, idx) => {
                                        const correctedParagraph = correctedContent[idx];
                                        if (!correctedParagraph) return null;

                                        if (originalParagraph === correctedParagraph) {
                                            return <p key={idx} className="text-text-secondary opacity-70">{originalParagraph}</p>;
                                        }

                                        const differences = diffWords(originalParagraph, correctedParagraph);

                                        return (
                                            <div key={idx} className="p-4 bg-background-surface rounded-lg border border-border shadow-sm">
                                                <p>
                                                    {differences.map((part, partIdx) => {
                                                        if (part.added) {
                                                            return <span key={partIdx} className="bg-green-200 text-green-900 font-medium px-1 rounded">{part.value}</span>;
                                                        }
                                                        if (part.removed) {
                                                            return <span key={partIdx} className="bg-red-200 text-red-900 line-through px-1 rounded mx-1 opacity-60">{part.value}</span>;
                                                        }
                                                        return <span key={partIdx}>{part.value}</span>;
                                                    })}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-4 md:p-6 border-t border-border bg-background-surface rounded-b-xl shrink-0 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowDiffModal(false);
                                        if (resumePlayAfterGrammarRef.current) {
                                            resumePlayAfterGrammarRef.current = false;
                                            window.speechSynthesis.resume();
                                            setIsPlaying(true);
                                        }
                                    }}
                                    className="px-5 py-2.5 bg-background hover:bg-border text-text-primary font-bold rounded-lg transition-colors border border-border"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmGrammarChanges}
                                    className="px-5 py-2.5 bg-accent hover:bg-accent/80 text-white font-bold rounded-lg shadow-md shadow-accent/20 transition-colors flex items-center gap-2"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
