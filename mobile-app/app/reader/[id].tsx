import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, ScrollView, Pressable, ActivityIndicator,
    Modal, Switch, Animated, Dimensions, Platform, TouchableOpacity, FlatList, TextInput, Alert, AppState,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import {
    ChevronLeft, ChevronRight, Settings, Headphones, CloudOff, Sun, Moon,
    Wand2, X, Plus, Minus, BookOpen, List,
    SkipBack, SkipForward, Play, Pause as PauseIcon, Trash2,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { bookService, ChapterMeta } from '@/src/services/book.service';
import { replacementService } from '@/src/services/features.service';
import { offlineService } from '@/src/services/offline.service';
import { ttsService } from '@/src/services/tts.service';
import { cacheService } from '@/src/lib/storage';
import { usePlaybackStore } from '@/src/store/playbackStore';
import { playbackNotificationService } from '@/src/services/playback-notification.service';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.75);

export default function ReaderScreen() {
    const router = useRouter();
    const idParam = useLocalSearchParams().id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    const chapterIdParam = useLocalSearchParams().chapterId;
    const [chapterId, setChapterId] = useState<string>(
        Array.isArray(chapterIdParam) ? chapterIdParam[0] : (chapterIdParam ?? '0')
    );

    // Sync state when URL param changes
    useEffect(() => {
        const newVal = Array.isArray(chapterIdParam) ? chapterIdParam[0] : (chapterIdParam ?? '0');
        if (newVal !== chapterId) setChapterId(newVal);
    }, [chapterIdParam]);

    // Chapter list (for sidebar)
    const [chapterList, setChapterList] = useState<{ order: number; title: string }[]>([]);
    const [totalChapters, setTotalChapters] = useState(0);

    // Content display states
    const [content, setContent] = useState<string>('');
    const [rawContent, setRawContent] = useState<string>('');
    const [replacements, setReplacements] = useState<any[]>([]);
    const [replacementsEnabled, setReplacementsEnabled] = useState(true);
    const [aiModel, setAiModel] = useState('OFF');
    const [searchWord, setSearchWord] = useState('');
    const [replaceWord, setReplaceWord] = useState('');
    const [isRegexRule, setIsRegexRule] = useState(false);
    const [isLightMode, setIsLightMode] = useState(false);

    useEffect(() => {
        const theme = cacheService.get('reader-theme');
        const savedModel = cacheService.get('reader-ai-model');
        if (savedModel) setAiModel(savedModel);
        if (theme === 'light') setIsLightMode(true);
    }, []);

    
    const changeAiModel = (m: string) => {
        setAiModel(m);
        cacheService.set('reader-ai-model', m);
    };

    const handleAddReplacement = async () => {
        if (!searchWord.trim()) return;
        try {
            await replacementService.addReplacement({ bookId: id, search: searchWord, replace: replaceWord, isRegex: isRegexRule });
            setSearchWord('');
            setReplaceWord('');
            fetchReplacements();
        } catch (e) { Alert.alert('Error', 'Failed to add rule'); }
    };

    const handleRemoveReplacement = async (ruleId: string) => {
        try {
            await replacementService.deleteReplacement(ruleId);
            fetchReplacements();
        } catch (e) { Alert.alert('Error', 'Failed to remove rule'); }
    };

    const toggleTheme = () => {
        setIsLightMode(p => {
            const next = !p;
            cacheService.set('reader-theme', next ? 'light' : 'dark');
            return next;
        });
    };
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isCorrecting, setIsCorrecting] = useState(false);
    const [fontSize, setFontSize] = useState(18);
    const [rate, setRate] = useState(1.0);
    const [sleepTimer, setSleepTimer] = useState<any>(null);
    const [selectedTimerMinutes, setSelectedTimerMinutes] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string>('');
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

    // TTS Sentence States
    const [sentences, setSentences] = useState<{ text: string; paraIdx: number }[]>([]);
    const [paragraphStructure, setParagraphStructure] = useState<string[][]>([]);
    const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(-1);
    const isSpeakingRef = useRef(false);
    const shouldAutoStartTTSRef = useRef(false);
    const sentencesRef = useRef<string[]>([]);
    const currentIndexRef = useRef<number>(-1);
    const ttsRateRef = useRef<number>(1.0);
    const skipDirectionRef = useRef<number>(1);

    // Keep the JS thread alive and screen on while reading/TTS is active
    useKeepAwake();

    // AppState: resume TTS if it was interrupted when app went to background
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                // App came back to foreground. If we were speaking and isSpeakingRef is false,
                // it means the OS killed TTS mid-sentence — auto-resume from current index.
                if (isSpeakingRef.current === false && isSpeaking && !isPaused) {
                    console.log('[Reader] App resumed: restarting TTS from current sentence');
                    isSpeakingRef.current = true;
                    speakNextSentence(true);
                }
            }
        });
        return () => sub.remove();
    }, [isSpeaking, isPaused]);

    // Scroll Ref for highlighting
    const scrollViewRef = useRef<FlatList>(null);
    const sentenceYPositions = useRef<{ [key: number]: number }>({});
    const paragraphYPositions = useRef<{ [key: number]: number }>({});

    // Chapter sidebar
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const sidebarAnim = useRef(new Animated.Value(SCREEN_W)).current;
    const overlayAnim = useRef(new Animated.Value(0)).current;

    // Playback Store Subs
    const { 
        playTarget, pauseTarget, nextTarget, prevTarget, 
        setPlayerState, clearPlayerState 
    } = usePlaybackStore();

    // Listen to store actions
    useEffect(() => {
        if (!isSpeakingRef.current && !isPaused) return; // Only react if TTS is the active player (or paused)
        if (playTarget > 0) {
            if (isPaused) toggleTTS(); // Resume
        }
    }, [playTarget]);

    useEffect(() => {
        if (!isSpeakingRef.current && !isPaused) return;
        if (pauseTarget > 0) {
            if (isSpeakingRef.current) toggleTTS(); // Pause
        }
    }, [pauseTarget]);

    useEffect(() => {
        if (!isSpeakingRef.current && !isPaused) return;
        if (nextTarget > 0) {
            skipForward();
        }
    }, [nextTarget]);

    useEffect(() => {
        if (!isSpeakingRef.current && !isPaused) return;
        if (prevTarget > 0) {
            skipBackward();
        }
    }, [prevTarget]);

    const bookTitleCache = cacheService.getObject<any>(`book_meta_${id}`)?.title || 'Unknown Book';

    // Update Notification State when speaking changes
    useEffect(() => {
        if (isSpeaking || isPaused) {
            setPlayerState('tts', !isPaused);
            const title = bookTitleCache;
            const chapter = chapterList.find(c => c.order === parseInt(chapterId))?.title || `Chapter ${currentChapterNum + 1}`;
            playbackNotificationService.showNotification(title, chapter, !isPaused).catch(console.error);
        } else {
            clearPlayerState();
            playbackNotificationService.stopNotification().catch(console.error);
        }
    }, [isSpeaking, isPaused, chapterId, chapterList, bookTitleCache]);

    const openSidebar = useCallback(() => {
        setIsSidebarOpen(true);
        Animated.parallel([
            Animated.spring(sidebarAnim, { toValue: SCREEN_W - SIDEBAR_W, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
    }, []);

    const closeSidebar = useCallback(() => {
        Animated.parallel([
            Animated.spring(sidebarAnim, { toValue: SCREEN_W, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setIsSidebarOpen(false));
    }, []);

    // ─── Helpers ────────────────────────────────────────────────────────────────
    const toStr = (val: any): any => {
        if (!val) return '';
        // If it's an array, return it as is to preserve paragraph structure
        if (Array.isArray(val)) return val;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    const goToNextChapter = useCallback(() => {
        const nextNum = parseInt(chapterId) + 1;
        if (totalChapters > 0 && nextNum < totalChapters) {
            skipDirectionRef.current = 1;
            setChapterId(String(nextNum));
            return true;
        }
        return false;
    }, [chapterId, totalChapters]);

    // ─── Bulk fetch + cache all chapters ────────────────────────────────────────
    const bulkFetchAndCache = useCallback(async (bookId: string) => {
        // Check if we already have ALL chapters cached
        const cachedChapterIds = offlineService.getCachedChapterIds(bookId);
        
        // If we have some chapters, let's assume valid cache unless syncing is requested
        // But the user said "do the network call only once for books, chapter and chapterindex rest from cache"
        // So if we have cached chapters, we skip bulk fetch.
        if (cachedChapterIds.length > 0) {
            console.warn(`[Reader] Found ${cachedChapterIds.length} cached chapters, skipping bulk fetch.`);
            // Still need to populate chapter list from cache or some other way? 
            // Better to still have the chapter names etc. 
            // In the real app, we might store the book/chapter list in cacheService too.
            const bookMeta = cacheService.getObject<any>(`book_meta_${bookId}`);
            if (bookMeta?.chapters) {
                setChapterList(bookMeta.chapters);
                setTotalChapters(bookMeta.chapters.length);
                return;
            }
        }

        setBulkLoading(true);
        try {
            console.warn(`[Reader] Bulk fetching all chapters for book ${bookId}`);
            const { chapters } = await bookService.getAllChapters(bookId);
            if (chapters && chapters.length > 0) {
                await offlineService.saveAllChapters(bookId, chapters);
                const list = chapters.map(c => ({ order: c.order, title: c.title || `Chapter ${c.order + 1}` }));
                setChapterList(list);
                setTotalChapters(chapters.length);
                setIsOffline(false);
                
                // Try to get book title from first chapter's book relation if possible, or leave blank
                const bookTitle = (chapters[0] as any)?.book?.title || 'Unknown Book';
                
                // Store metadata for future cache-only loads
                cacheService.setObject(`book_meta_${bookId}`, { chapters: list, title: bookTitle });
                
                console.warn(`[Reader] Bulk cached ${chapters.length} chapters`);
            }
        } catch (err: any) {
            console.warn('[Reader] Bulk fetch failed (will rely on existing cache):', err?.message);
            setIsOffline(true);
        } finally {
            setBulkLoading(false);
        }
    }, []);

    // ─── Load a single chapter from cache ───────────────────────────────────────
    const loadChapterFromCache = useCallback(async (bookId: string, chapId: string) => {
        setLoading(true);
        setLoadError('');
        setRawContent(''); // Clear old content completely to trigger auto-skip logic correctly
        try {
            const cached = await offlineService.getChapter(bookId, chapId);
            if (cached) {
                setRawContent(toStr(cached));
            } else {
                // Fallback: individual network request if somehow not in cache
                console.warn(`[Reader] Cache miss for chapter ${chapId}, fetching individually`);
                const data = await bookService.getChapterContent(bookId, chapId);
                const liveContent = toStr(data?.content) || '';
                setRawContent(liveContent);
                if (liveContent) {
                    await offlineService.saveChapter(bookId, chapId, liveContent).catch(() => {});
                } else {
                    setLoadError(`Chapter ${chapId} not found in cache or network.`);
                }
            }
        } catch (err: any) {
            console.error('[Reader] Error loading chapter:', err);
            setLoadError(`Error: ${err?.message || 'Unknown'}`);
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── On book change: bulk fetch, then load first/current chapter ─────────────
    useEffect(() => {
        if (!id) return;

        const init = async () => {
            // First, load from cache so UI isn't blank
            await loadChapterFromCache(id as string, chapterId);
            // Then bulk fetch (updates cache in background)
            await bulkFetchAndCache(id as string);
            // Reload in case bulk fetch updated the content
            await loadChapterFromCache(id as string, chapterId);
        };

        init();
        fetchReplacements();
    }, [id]);

    // ─── On chapter change (after initial): load from cache ─────────────────────
    const isFirstMount = useRef(true);
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }
        if (id) loadChapterFromCache(id as string, chapterId);
    }, [chapterId]);

    // ─── Auto-skip empty chapters ───────────────────────────────────────────────
    useEffect(() => {
        if (loading || isFirstMount.current) return;
        if (!id || !chapterId) return;

        let isEmpty = false;
        if (!rawContent) {
            isEmpty = true;
        } else if (Array.isArray(rawContent)) {
            isEmpty = rawContent.length === 0 || rawContent.every(p => !p || String(p).trim() === '');
        } else {
            isEmpty = String(rawContent).trim() === '';
        }

        const currentNum = parseInt(chapterId);
        if (isEmpty && totalChapters > 0) {
            const nextSkip = currentNum + skipDirectionRef.current;
            if (nextSkip >= 0 && nextSkip < totalChapters) {
                console.log(`[Reader] Chapter ${chapterId} is empty. Auto-skipping to ${nextSkip} (dir: ${skipDirectionRef.current})`);
                setChapterId(String(nextSkip));
            }
        }
    }, [loading, rawContent, chapterId, totalChapters, id]);

    const fetchReplacements = async () => {
        try {
            const rules = await replacementService.getReplacements(id as string);
            setReplacements(rules);
        } catch (err) {
            console.error('Failed to fetch replacements', err);
        }
    };

    // Apply replacements and formatting
    useEffect(() => {
        if (!rawContent) { setContent(''); setParagraphStructure([]); return; }
        
        let paragraphs: string[] = [];
        if (Array.isArray(rawContent)) {
            paragraphs = rawContent.flatMap(p => String(p).split(/\n+/));
        } else {
            paragraphs = String(rawContent).split(/\n+/);
        }
        paragraphs = paragraphs.filter(p => p.trim().length > 0);

        const processedParas = paragraphs.map(p => {
            let processed = p.trim();
            if (!replacementsEnabled || replacements.length === 0) return processed;
            
            replacements.forEach(rule => {
                try {
                    const searchValue = rule.isRegex ? new RegExp(rule.search, 'g') : rule.search;
                    const replaceValue = rule.replace || '';
                    processed = rule.isRegex
                        ? processed.replace(searchValue, replaceValue)
                        : processed.split(searchValue as string).join(replaceValue);
                } catch (e) {
                    console.error(`Invalid replacement rule: ${rule.search}`, e);
                }
            });
            return processed;
        }).filter(p => p.trim().length > 0);

        setParagraphStructure(processedParas.map(p => {
            const sentenceArray = p.match(/[^.!?]+[.!?]+["'”’\]\)]*|\s*[^.!?]+$/g) || [p];
            return sentenceArray.map(s => s.trim()).filter(s => s.length > 0);
        }));
        
        setContent(processedParas.join('\n\n\n'));
        
        // Auto-start TTS if we transitioned chapters
        if (shouldAutoStartTTSRef.current) {
            shouldAutoStartTTSRef.current = false;
            // Small delay to ensure UI labels and sentences are updated
            setTimeout(() => {
                toggleTTS();
            }, 500);
        }
    }, [rawContent, replacements, replacementsEnabled]);

    const flatSentences = useMemo(() => {
        const flat: { text: string; paraIdx: number; globalIdx: number }[] = [];
        let globalIdx = 0;
        paragraphStructure.forEach((p: string[], pIdx: number) => {
            p.forEach((s: string) => {
                flat.push({ text: s, paraIdx: pIdx, globalIdx });
                globalIdx++;
            });
        });
        return flat;
    }, [paragraphStructure]);

    // Progress sync
    useEffect(() => {
        const timer = setTimeout(() => {
            if (id && chapterId) {
                const cIndex = parseInt(chapterId);
                if (!isNaN(cIndex)) {
                    bookService.updateProgress(id as string, cIndex, 0)
                        .catch((err: any) => console.error('Failed to sync progress:', err.message));
                }
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [id, chapterId]);

    // ─── TTS ────────────────────────────────────────────────────────────────────
    
    // Sync refs for the callback loop
    useEffect(() => {
        sentencesRef.current = flatSentences.map((s: any) => s.text);
    }, [flatSentences]);

    useEffect(() => {
        currentIndexRef.current = currentSentenceIndex;
    }, [currentSentenceIndex]);

    useEffect(() => {
        ttsRateRef.current = rate;
    }, [rate]);

    const speakNextSentence = useCallback((replay = false) => {
        if (!isSpeakingRef.current) return;
        
        const nextIndex = replay ? currentIndexRef.current : currentIndexRef.current + 1;
        
        if (nextIndex >= 0 && nextIndex < sentencesRef.current.length) {
            currentIndexRef.current = nextIndex;
            setCurrentSentenceIndex(nextIndex); // UI sync
            
            const sentence = sentencesRef.current[nextIndex];
            const sentenceWithNewline = sentence + '\n';
            
            console.log(`[Reader] Speaking sentence ${nextIndex + 1}/${sentencesRef.current.length}${replay ? ' (replay)' : ''}`);
            
            ttsService.speak(
                sentenceWithNewline, 
                ttsRateRef.current, 
                () => { // onDone
                    const delay = Platform.OS === 'android' ? 250 : 100;
                    setTimeout(() => {
                        speakNextSentence(false); // Move to next
                    }, delay);
                },
                (err) => { // onError
                    console.warn('[Reader] TTS Error, skipping to next sentence', err);
                    setTimeout(() => {
                        speakNextSentence(false);
                    }, 500);
                }
            );
        } else if (nextIndex >= sentencesRef.current.length) {
            console.log('[Reader] Finished all sentences, checking for next chapter');
            const transitioned = goToNextChapter();
            if (transitioned) {
                // Set flag to auto-start on next chapter load
                shouldAutoStartTTSRef.current = true;
                
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setCurrentSentenceIndex(-1);
                currentIndexRef.current = -1;
            } else {
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                setCurrentSentenceIndex(-1);
                currentIndexRef.current = -1;
            }
        } else if (nextIndex < 0 && sentencesRef.current.length > 0) {
            // Start from first if somehow negative
            currentIndexRef.current = -1;
            speakNextSentence(false);
        }
    }, [sentences]);

    // Scroll to highlighted sentence
    useEffect(() => {
        if (currentSentenceIndex >= 0 && isSpeaking) {
            const sentenceObj = flatSentences[currentSentenceIndex];
            if (sentenceObj) {
                try {
                    // Center the paragraph in the view using FlatList built-in scroll
                    scrollViewRef.current?.scrollToIndex({ 
                        index: sentenceObj.paraIdx, 
                        animated: true, 
                        viewPosition: 0.3 
                    });
                } catch (error) {
                    // Item might not be rendered yet
                }
            }
        }
    }, [currentSentenceIndex, isSpeaking, flatSentences]);

    const skipForward = () => {
        if (!isSpeaking) return;
        ttsService.stop();
        speakNextSentence();
        setIsPaused(false);
    };

    const skipBackward = () => {
        if (!isSpeaking) return;
        ttsService.stop();
        // Move back 2 because speakNextSentence increments by 1
        currentIndexRef.current = Math.max(-1, currentIndexRef.current - 2);
        speakNextSentence();
        setIsPaused(false);
    };

    const toggleTTS = async () => {
        if (isSpeaking) {
            if (isPaused) {
                // Resume
                console.log('[Reader] Resuming TTS');
                setIsPaused(false);
                isSpeakingRef.current = true;
                // Replay the current sentence to ensure continuity
                speakNextSentence(true);
            } else {
                // Pause
                console.log('[Reader] Pausing TTS');
                ttsService.stop();
                setIsPaused(true);
                isSpeakingRef.current = false;
            }
        } else {
            if (paragraphStructure.length === 0) {
                alert('No content available for text-to-speech.');
                return;
            }

            setSentences(flatSentences);
            sentencesRef.current = flatSentences.map(s => s.text);
            setCurrentSentenceIndex(-1);
            currentIndexRef.current = -1;
            
            setIsSpeaking(true);
            setIsPaused(false);
            isSpeakingRef.current = true;
            
            // Small delay to ensure state updates are settled
            setTimeout(() => {
                speakNextSentence(false);
            }, 100);
        }
    };

    const stopTTS = useCallback(() => {
        ttsService.stop();
        setIsSpeaking(false);
        setIsPaused(false);
        isSpeakingRef.current = false;
        setCurrentSentenceIndex(-1);
        currentIndexRef.current = -1;
    }, []);

    const startSleepTimer = (minutes: number) => {
        if (sleepTimer) clearInterval(sleepTimer);
        setSelectedTimerMinutes(minutes);
        
        let secondsLeft = minutes * 60;
        setRemainingSeconds(secondsLeft);
        
        const interval = setInterval(() => {
            secondsLeft -= 1;
            setRemainingSeconds(secondsLeft);
            
            if (secondsLeft <= 0) {
                clearInterval(interval);
                stopTTS();
                setSleepTimer(null);
                setSelectedTimerMinutes(null);
                setRemainingSeconds(null);
                console.log('[Reader] Sleep timer finished');
            }
        }, 1000);
        
        setSleepTimer(interval as any);
    };

    const nextRate = () => {
        const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
        const next = rates[(rates.indexOf(rate) + 1) % rates.length];
        setRate(next);
        // No need to restart manually here as the next speakNextSentence call will use the ref value
    };

    // ─── Grammar correction ──────────────────────────────────────────────────────
    const handleGrammarCorrection = async () => {
        if (isOffline) { alert('Grammar correction requires an internet connection.'); return; }
        setIsCorrecting(true);
        try {
            if (aiModel === 'OFF') return;
            const res = await bookService.proposeGrammarCorrection(id as string, chapterId, aiModel);
            if (res.correctedChapter) {
                requestAnimationFrame(() => {
                    alert('Grammar correction generated successfully! Applying now...');
                    setRawContent(res.correctedChapter);
                    bookService.updateChapterContent(id as string, chapterId, res.correctedChapter)
                        .catch(err => console.error('Failed to save grammar on backend', err));
                });
            }
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Grammar correction failed.');
        } finally {
            setIsCorrecting(false);
        }
    };

    
    const th = {
        bg: isLightMode ? 'bg-[#fdfdfc]' : 'bg-background',
        surface: isLightMode ? 'bg-[#f3f3f0]' : 'bg-background-surface',
        text: isLightMode ? 'text-[#171717]' : 'text-text-primary',
        textMuted: isLightMode ? 'text-[#666666]' : 'text-text-muted',
        textSec: isLightMode ? 'text-[#444444]' : 'text-text-secondary',
        border: isLightMode ? 'border-[#e5e5e0]' : 'border-border',
        icon: isLightMode ? '#666666' : '#a39b98',
    };

    const currentChapterNum = parseInt(chapterId);
    const chapterTitle = chapterList.find(c => c.order === currentChapterNum)?.title || `Chapter ${currentChapterNum + 1}`;

    // ─── Render ─────────────────────────────────────────────────────────────────
    return (
        <View className={`flex-1 ${th.bg}`} style={{ paddingTop: Platform.OS === 'ios' ? 44 : 24 }}>

            {/* Header */}
            <View className={`px-4 py-3 flex-row justify-between items-center ${th.surface} border-b ${th.border}`}>
                <Pressable onPress={() => router.back()} className="p-1">
                    <ChevronLeft size={24} color={th.icon} />
                </Pressable>

                <View className="items-center flex-1 mx-2">
                    <Text className={`${th.text} font-bold font-serif text-sm`} numberOfLines={1}>
                        {chapterTitle}
                    </Text>
                    <View className="flex-row items-center gap-1">
                        {isOffline && (
                            <View className="flex-row items-center">
                                <CloudOff size={9} color="#f59e0b" />
                                <Text className="text-amber-400 text-[8px] font-bold ml-0.5 uppercase">Offline</Text>
                            </View>
                        )}
                        {remainingSeconds !== null && (
                            <View className="flex-row items-center ml-1">
                                <View className="w-1 h-1 rounded-full bg-red-500 mr-1" />
                                <Text className="text-red-800 text-[10px] font-bold">
                                    {Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, '0')}
                                </Text>
                            </View>
                        )}
                        {bulkLoading && (
                            <View className="flex-row items-center ml-1">
                                <ActivityIndicator size="small" color="#8b5cf6" style={{ transform: [{ scale: 0.5 }] }} />
                                <Text className="text-accent text-[8px] ml-0.5">Caching…</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View className="flex-row items-center gap-2">
                    <Pressable onPress={toggleTTS} className="flex-row items-center bg-accent/10 px-2 py-1.5 rounded-full">
                        <Headphones size={16} color={isSpeaking ? '#8b5cf6' : '#a39b98'} />
                        {isSpeaking && <View className="w-1.5 h-1.5 rounded-full bg-accent ml-1" />}
                    </Pressable>

                    {isSpeaking && (
                        <View className="bg-accent/20 px-2 py-0.5 rounded-full">
                            <Text className="text-accent text-[10px] font-bold">{rate}x</Text>
                        </View>
                    )}

                    <Pressable onPress={() => aiModel === 'OFF' ? setIsSettingsOpen(true) : handleGrammarCorrection()} disabled={isCorrecting} className={`bg-accent/10 p-1.5 rounded-full ${(isCorrecting || aiModel === 'OFF') ? 'opacity-50' : ''}`}>
                        {isCorrecting ? <ActivityIndicator size="small" color="#8b5cf6" /> : <Wand2 size={16} color={th.icon} />}
                    </Pressable>

                    <Pressable onPress={toggleTheme} className="p-1.5">
                        {isLightMode ? <Moon size={18} color="#666" /> : <Sun size={18} color={th.icon} />}
                    </Pressable>
                    <Pressable onPress={() => setIsSettingsOpen(true)} className="p-1.5">
                        <Settings size={18} color={th.icon} />
                    </Pressable>

                    {/* Chapter list sidebar toggle */}
                    <Pressable onPress={openSidebar} className="p-1.5">
                        <List size={18} color={th.icon} />
                    </Pressable>
                </View>
            </View>

            {/* Content */}
            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color="#8b5cf6" />
                    <Text className="text-accent text-xs mt-2">Loading chapter…</Text>
                </View>
            ) : (
                <FlatList
                    ref={scrollViewRef as any}
                    data={paragraphStructure}
                    keyExtractor={(_, i) => `p-${i}`}
                    onScrollToIndexFailed={(info) => {
                        const wait = new Promise(resolve => setTimeout(resolve, 500));
                        wait.then(() => {
                            scrollViewRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
                        });
                    }}
                    contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
                    renderItem={({ item: sentencesInPara, index: pIdx }) => {
                        let prevSentenceCount = 0;
                        for (let i = 0; i < pIdx; i++) prevSentenceCount += paragraphStructure[i].length;

                        return (
                            <View 
                                key={pIdx} 
                                onLayout={(e) => {
                                    paragraphYPositions.current[pIdx] = e.nativeEvent.layout.y;
                                }}
                                style={{ marginBottom: 64 }}
                            >
                                <View className="flex-row flex-wrap">
                                    {sentencesInPara.map((sentence, sIdx) => {
                                        const globalIdx = prevSentenceCount + sIdx;
                                        const isHighlighted = isSpeaking && globalIdx === currentSentenceIndex;
                                        
                                        return (
                                            <View 
                                                key={sIdx} 
                                                onLayout={(e) => {
                                                    sentenceYPositions.current[globalIdx] = e.nativeEvent.layout.y;
                                                }}
                                                style={{ 
                                                    backgroundColor: isHighlighted ? 'rgba(139, 92, 246, 0.18)' : 'transparent', 
                                                    borderRadius: 4, 
                                                    paddingHorizontal: 2,
                                                    marginRight: 4,
                                                    marginBottom: 4
                                                }}
                                            >
                                                <Text
                                                    className={`${th.text} font-serif leading-8`}
                                                    style={{ fontSize }}
                                                >
                                                    {sentence}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View className="p-10">
                            <Text className={`${th.text} font-serif leading-8 text-center`} style={{ fontSize }}>
                                {content || 'No content found for this chapter.'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* TTS Player Bar */}
            {isSpeaking && (
                <Animated.View 
                    style={{ 
                        position: 'absolute', bottom: 85, left: 16, right: 16, 
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isLightMode ? "#f3f3f0" : "#1a1412", borderRadius: 16, padding: 12,
                        shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
                        borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.2)',
                    }}
                >
                    <TouchableOpacity onPress={skipBackward} className="p-3 mx-1">
                        <SkipBack size={24} color={th.icon} />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        onPress={toggleTTS}
                        className="p-4 mx-2 bg-accent rounded-full"
                        style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 }}
                    >
                        {isPaused ? <Play size={24} color="#fff" /> : <PauseIcon size={24} color="#fff" />}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={skipForward} className="p-3 mx-1">
                        <SkipForward size={24} color={th.icon} />
                    </TouchableOpacity>

                    <View className="w-px h-8 bg-border mx-3" />

                    <TouchableOpacity 
                        onPress={stopTTS}
                        className="p-3"
                    >
                        <X size={24} color={th.icon} />
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* Footer navigation */}
            <View className={`absolute bottom-0 left-0 right-0 ${th.surface} border-t ${th.border} px-6 py-4 flex-row justify-between items-center`}>
                <Pressable
                    className="flex-row items-center"
                    onPress={() => {
                        skipDirectionRef.current = -1;
                        setChapterId(String(Math.max(0, currentChapterNum - 1)));
                    }}
                    disabled={currentChapterNum <= 0}
                >
                    <ChevronLeft size={20} color={currentChapterNum <= 0 ? '#3a3330' : '#8b5cf6'} />
                    <Text className={`ml-1 font-bold ${currentChapterNum <= 0 ? 'text-border' : 'text-accent'}`}>Prev</Text>
                </Pressable>

                <Text className={`${th.textMuted} text-xs italic`}>
                    {currentChapterNum + 1}{totalChapters > 0 ? ` / ${totalChapters}` : ''}
                </Text>

                <Pressable
                    className="flex-row items-center"
                    onPress={() => {
                        skipDirectionRef.current = 1;
                        setChapterId(String(currentChapterNum + 1));
                    }}
                    disabled={totalChapters > 0 && currentChapterNum >= totalChapters - 1}
                >
                    <Text className={`mr-1 font-bold ${totalChapters > 0 && currentChapterNum >= totalChapters - 1 ? 'text-border' : 'text-accent'}`}>Next</Text>
                    <ChevronRight size={20} color={totalChapters > 0 && currentChapterNum >= totalChapters - 1 ? '#3a3330' : '#8b5cf6'} />
                </Pressable>
            </View>

            {/* ── Chapter List Sidebar ─────────────────────────────────────────── */}
            {isSidebarOpen && (
                <Animated.View
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        opacity: overlayAnim,
                        zIndex: 998,
                    }}
                >
                    <Pressable style={{ flex: 1 }} onPress={closeSidebar} />
                </Animated.View>
            )}

            <Animated.View
                style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width: SIDEBAR_W,
                    transform: [{ translateX: sidebarAnim }],
                    zIndex: 999,
                }}
            >
                <View
                    className="flex-1 bg-background-surface border-l border-border"
                    style={{ paddingTop: Platform.OS === 'ios' ? 50 : 40 }}
                >
                    {/* Sidebar header */}
                    <View className={`px-4 pb-4 border-b ${th.border}/50 flex-row items-center justify-between`}>
                        <View className="flex-row items-center gap-2">
                            <BookOpen size={18} color="#8b5cf6" />
                            <Text className={`${th.text} text-base font-bold font-serif`}>
                                Chapters {totalChapters > 0 ? `(${totalChapters})` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={closeSidebar} className="p-1">
                            <X size={20} color={th.icon} />
                        </TouchableOpacity>
                    </View>

                    {/* Chapter list */}
                    {chapterList.length > 0 ? (
                        <FlatList
                            data={chapterList}
                            keyExtractor={(item) => String(item.order)}
                            initialScrollIndex={Math.max(0, currentChapterNum - 2)}
                            getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
                            renderItem={({ item }) => {
                                const isActive = item.order === currentChapterNum;
                                return (
                                    <TouchableOpacity
                                        onPress={() => {
                                            skipDirectionRef.current = item.order > currentChapterNum ? 1 : -1;
                                            setChapterId(String(item.order));
                                            closeSidebar();
                                        }}
                                        className={`px-4 py-3 border-b border-border/20 ${isActive ? 'bg-accent/20 border-l-2 border-l-accent pl-3' : ''}`}
                                        activeOpacity={0.6}
                                    >
                                        <Text
                                            className={`text-sm font-serif ${isActive ? 'text-accent font-bold' : 'text-text-secondary'}`}
                                            numberOfLines={2}
                                        >
                                            {item.order + 1}. {item.title}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    ) : (
                        <View className="flex-1 items-center justify-center p-6">
                            <ActivityIndicator color="#8b5cf6" />
                            <Text className="text-text-muted text-sm mt-3 text-center">Loading chapter list…</Text>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* ── Settings Modal ──────────────────────────────────────────────── */}
            <Modal visible={isSettingsOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/60">
                    <View className={`${th.surface} rounded-t-3xl p-6 min-h-[40%] border-t ${th.border}`}>
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className={`text-2xl font-bold ${th.text} font-serif`}>Reader Settings</Text>
                            <Pressable onPress={() => setIsSettingsOpen(false)}>
                                <X size={24} color={th.icon} />
                            </Pressable>
                        </View>

                        <Text className={`${th.textSec} font-bold mb-3`}>Font Size</Text>
                        <View className={`flex-row items-center justify-between ${th.bg} p-3 rounded-xl border ${th.border} mb-6`}>
                            <Pressable onPress={() => setFontSize(Math.max(12, fontSize - 2))} className="p-3 bg-accent/20 rounded-lg">
                                <Minus size={20} color="#8b5cf6" />
                            </Pressable>
                            <Text className={`${th.text} font-bold text-lg`}>{fontSize}px</Text>
                            <Pressable onPress={() => setFontSize(Math.min(32, fontSize + 2))} className="p-3 bg-accent/20 rounded-lg">
                                <Plus size={20} color="#8b5cf6" />
                            </Pressable>
                        </View>

                        
                        <View className="flex-row items-center justify-between mb-2">
                            <View>
                                <Text className={`${th.textSec} font-bold`}>Custom Replacements</Text>
                                <Text className={`${th.textMuted} text-xs`}>Apply {replacements.length} custom text rules</Text>
                            </View>
                            <Switch
                                value={replacementsEnabled}
                                onValueChange={setReplacementsEnabled}
                                trackColor={{ false: '#2a2a2a', true: '#6d28d9' }}
                                thumbColor="#8b5cf6"
                            />
                        </View>
                        
                        {replacementsEnabled && (
                            <View className="mb-6">
                                <View className={`flex-row items-center gap-2 mb-3 ${th.bg} p-2 rounded-lg border ${th.border}`}>
                                    <TextInput 
                                        className={`flex-1 ${th.text} p-2`}
                                        placeholder="Search..."
                                        placeholderTextColor={th.icon}
                                        value={searchWord}
                                        onChangeText={setSearchWord}
                                    />
                                    <TextInput 
                                        className={`flex-1 ${th.text} p-2 border-l ${th.border}`}
                                        placeholder="Replace..."
                                        placeholderTextColor={th.icon}
                                        value={replaceWord}
                                        onChangeText={setReplaceWord}
                                    />
                                    <TouchableOpacity onPress={handleAddReplacement} className="p-2 bg-accent rounded-lg">
                                        <Plus size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                {replacements.map(rule => (
                                    <View key={rule._id || rule.id} className={`flex-row justify-between items-center p-3 mb-2 rounded-lg border ${th.border}`}>
                                        <View className="flex-1">
                                            <Text className={`${th.text} font-bold`} numberOfLines={1}>{rule.search} <Text className="text-accent">→</Text> {rule.replace}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleRemoveReplacement(rule._id || rule.id)} className="p-2">
                                            <Trash2 size={18} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                        
                        <View className="border-t border-border/30 pt-4 mb-6">
                            <Text className={`text-xl font-bold ${th.text} font-serif mb-4`}>AI Model</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {['OFF', 'gemini-2.5-flash', 'gpt-4o-mini', 'ollama'].map(m => (
                                    <TouchableOpacity 
                                        key={m}
                                        onPress={() => changeAiModel(m)}
                                        className={`px-3 py-2 rounded-lg border ${aiModel === m ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                    >
                                        <Text className={`font-bold ${aiModel === m ? 'text-white' : th.textSec}`}>{m === 'OFF' ? 'Disabled' : m.replace('gemini-2.5-flash', 'Gemini Flash').replace('gpt-4o-mini', 'GPT-4o Mini').replace('ollama', 'Local (Ollama)')}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>


                        <View className="border-t border-border/30 pt-4">
                            <Text className={`text-xl font-bold ${th.text} font-serif mb-4`}>Speech Settings</Text>
                            
                            <Text className={`${th.textSec} font-bold mb-3`}>Speech Rate</Text>
                            <View className="flex-row flex-wrap gap-2 mb-6">
                                {[0.75, 1.0, 1.25, 1.5, 2.0].map(r => (
                                    <TouchableOpacity 
                                        key={r}
                                        onPress={() => setRate(r)}
                                        className={`px-4 py-2 rounded-lg border ${rate === r ? 'bg-accent border-accent' : 'bg-background border-border'}`}
                                    >
                                        <Text className={`font-bold ${rate === r ? 'text-white' : 'text-text-secondary'}`}>{r}x</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text className={`${th.textSec} font-bold mb-3`}>Sleep Timer</Text>
                            <View className="flex-row gap-2">
                                {[15, 30, 60].map(m => (
                                    <TouchableOpacity 
                                        key={m}
                                        onPress={() => startSleepTimer(m)}
                                        className={`flex-1 px-4 py-3 rounded-xl border items-center ${selectedTimerMinutes === m ? 'bg-accent border-accent' : 'bg-background border-border'}`}
                                    >
                                        <Text className={`font-bold ${selectedTimerMinutes === m ? 'text-white' : 'text-text-secondary'}`}>{m}m</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    onPress={() => { 
                                        if (sleepTimer) clearInterval(sleepTimer); 
                                        setSleepTimer(null); 
                                        setSelectedTimerMinutes(null);
                                        setRemainingSeconds(null);
                                    }}
                                    className="flex-1 px-4 py-3 rounded-xl border border-border bg-background items-center"
                                >
                                    <Text className={`${th.textSec} font-bold`}>Off</Text>
                                </TouchableOpacity>
                            </View>
                            {remainingSeconds !== null && (
                                <Text className="text-accent text-sm mt-3 font-bold italic text-center">
                                    Stopping in {Math.floor(remainingSeconds / 60)}m {remainingSeconds % 60}s
                                </Text>
                            )}

                            {/* Explicit Close Button */}
                            <TouchableOpacity 
                                onPress={() => setIsSettingsOpen(false)} 
                                className="w-full bg-accent p-4 rounded-xl mt-6 items-center shadow-lg"
                                style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 }}
                            >
                                <Text className="text-white font-bold text-lg">Close Settings</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
