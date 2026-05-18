import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, Pressable, ActivityIndicator,
    Modal, Animated, Dimensions, Platform, TouchableOpacity, FlatList, Image
} from 'react-native';
import {
    ChevronLeft, List, SkipBack, SkipForward, Play, Pause as PauseIcon, X, Settings, Clock, BookOpen
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import Slider from '@react-native-community/slider';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/src/lib/api-client';
import { cacheService } from '@/src/lib/storage';
import { usePlaybackStore } from '@/src/store/playbackStore';
import { playbackNotificationService } from '@/src/services/playback-notification.service';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = Math.min(300, SCREEN_W * 0.75);

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://my-ultimate-app-all.vercel.app/api';

interface Chapter {
    id: string;
    title: string;
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
        if (storedVoice) setTtsVoice(storedVoice);
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
        setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'mixWithOthers'
        });
        
        if (bookId) {
            fetchBook(String(bookId));
        }
    }, [bookId]);

    const fetchBook = async (id: string) => {
        try {
            const res = await api.get(`/books/${id}`);
            const data = res.data;
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
            setCurrentChapterIndex(finalIdx);
        } catch (error) {
            console.error('Error loading book', error);
        } finally {
            setLoading(false);
        }
    };

    const saveProgressToDb = async (id: string, index: number) => {
        try {
            await api.patch(`/books/${id}`, { chapterId: index, sentenceId: 0 });
        } catch (error) {}
    };

    const currentChapter = book?.chapters[currentChapterIndex];

    useEffect(() => {
        if (!book || !currentChapter) return;
        
        cacheService.set(`listen-progress-${book.id}`, JSON.stringify({ chapterIndex: currentChapterIndex }));
        saveProgressToDb(book.id, currentChapterIndex);
        
        loadAudioForChapter(currentChapter.id);
    }, [currentChapterIndex, book, grammarModel, ttsVoice]);

    const loadAudioForChapter = async (chapterId: string) => {
        setIsGenerating(true);
        try {
            const url = `${BASE_URL}/tts?chapterId=${chapterId}&grammarModel=${grammarModel}&voice=${ttsVoice}`;
            const token = await SecureStore.getItemAsync('accessToken');
            
            player.replace({ uri: url, headers: { Authorization: `Bearer ${token}` } });
            player.play();
        } catch (error) {
            console.error('Audio load error:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAudioEnded = () => {
        if (sleepTimer === 'EOC') {
            setSleepTimer(null);
        } else {
            handleNextChapter();
        }
    };

    // Keep track of ended events by checking duration vs current
    useEffect(() => {
        if (status.isLoaded && !status.playing && status.currentTime > 0 && status.duration > 0 && status.currentTime >= status.duration - 0.5) {
            handleAudioEnded();
        }
    }, [status.currentTime, status.duration, status.playing, status.isLoaded]);

    // Playback Store Subs
    const { 
        playTarget, pauseTarget, nextTarget, prevTarget, 
        setPlayerState, clearPlayerState 
    } = usePlaybackStore();

    // Listen to store actions from Notifee
    useEffect(() => {
        if (playTarget > 0) {
            if (!isPlaying) player.play();
        }
    }, [playTarget]);

    useEffect(() => {
        if (pauseTarget > 0) {
            if (isPlaying) player.pause();
        }
    }, [pauseTarget]);

    useEffect(() => {
        if (nextTarget > 0) {
            // Note: Notifee "next" can either mean next chapter or skip forward. 
            // Usually media next means next chapter.
            handleNextChapter();
        }
    }, [nextTarget]);

    useEffect(() => {
        if (prevTarget > 0) {
            handlePrevChapter();
        }
    }, [prevTarget]);

    // Update Notification Service
    useEffect(() => {
        if (status.isLoaded) {
            setPlayerState('audio', isPlaying);
            const title = book?.title || 'Audiobook';
            const chapter = currentChapter?.title || `Chapter ${currentChapterIndex + 1}`;
            playbackNotificationService.showNotification(title, chapter, isPlaying).catch(console.error);
        } else {
            clearPlayerState();
            playbackNotificationService.stopNotification().catch(console.error);
        }
    }, [isPlaying, status.isLoaded, currentChapterIndex, book]);

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev === null) return null;
                if (prev > 0) return prev - 1;

                player.pause();
                setSleepTimer(null);
                return null;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timeRemaining]);

    const formatTime = (millis: number) => {
        if (!millis || millis < 0) return "00:00";
        const seconds = Math.floor(millis / 1000);
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const togglePlayPause = () => {
        if (isPlaying) {
            player.pause();
        } else {
            player.play();
        }
    };

    const skipForward = () => {
        player.seekTo((status.currentTime || 0) + 15);
    };

    const skipBackward = () => {
        player.seekTo(Math.max(0, (status.currentTime || 0) - 15));
    };

    const handleNextChapter = () => {
        if (book && currentChapterIndex < book.chapters.length - 1) {
            setCurrentChapterIndex(prev => prev + 1);
        }
    };

    const handlePrevChapter = () => {
        if (currentChapterIndex > 0) {
            setCurrentChapterIndex(prev => prev - 1);
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

    if (!book) return null;

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
            <View className="flex-1 items-center justify-center p-6">
                
                {/* Artwork */}
                <View className={`w-64 h-64 rounded-xl shadow-2xl mb-8 border ${th.border} overflow-hidden ${th.surface} items-center justify-center`} style={{ elevation: 10 }}>
                    {book.cover ? (
                        <Image source={{ uri: book.cover }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                        <BookOpen size={64} color={th.icon} />
                    )}
                </View>

                {/* Chapter Info */}
                <Text className={`text-2xl font-bold ${th.text} text-center mb-2 px-4`} numberOfLines={2}>
                    {currentChapter?.title || 'Unknown Chapter'}
                </Text>
                <Text className={`${th.textMuted} font-medium mb-8`}>
                    Chapter {currentChapterIndex + 1} of {book.chapters.length}
                </Text>

                {/* Status / Timer */}
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
                <View className="w-full max-w-sm flex-row items-center gap-2 mb-6">
                    <Text className={`${th.textMuted} text-xs font-mono w-11 text-right`}>{formatTime(positionMillis)}</Text>
                    <Slider
                        style={{ flex: 1, height: 40 }}
                        minimumValue={0}
                        maximumValue={durationMillis > 0 ? durationMillis : 100}
                        value={positionMillis}
                        onSlidingComplete={(val) => {
                            player.seekTo(val / 1000);
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
                        className={`w-20 h-20 rounded-full bg-accent items-center justify-center shadow-lg ${isGenerating ? 'opacity-50' : ''}`}
                        style={{ shadowColor: '#8b5cf6', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8 }}
                    >
                        {isPlaying ? <PauseIcon size={36} color="#fff" /> : <Play size={36} color="#fff" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={skipForward} className="p-3">
                        <SkipForward size={32} color={th.icon} />
                    </TouchableOpacity>
                </View>

                {/* Chapter Navigation */}
                <View className="flex-row items-center justify-between w-full max-w-sm mt-12 px-6">
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
            </View>

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
                                    onPress={() => { setCurrentChapterIndex(index); closeSidebar(); }}
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
                    <View className={`${th.surface} rounded-t-3xl p-6 min-h-[40%] border-t ${th.border}`}>
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
                        
                        {/* Voice */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Target Voice (Accent)</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {[{id:'en', label:'Default'}, {id:'en-US', label:'US'}, {id:'en-GB', label:'British'}, {id:'en-AU', label:'Aus'}, {id:'en-IN', label:'Indian'}].map(v => (
                                <TouchableOpacity 
                                    key={v.id}
                                    onPress={() => {
                                        setTtsVoice(v.id);
                                        cacheService.set('listen-tts-voice', v.id);
                                    }}
                                    className={`px-4 py-2 rounded-lg border ${ttsVoice === v.id ? 'bg-accent border-accent' : `${th.bg} ${th.border}`}`}
                                >
                                    <Text className={`font-bold ${ttsVoice === v.id ? 'text-white' : th.textSec}`}>{v.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* AI Model */}
                        <Text className={`${th.textSec} font-bold mb-3`}>Grammar Model</Text>
                        <View className="flex-row flex-wrap gap-2 mb-6">
                            {['OFF', 'gemini-2.5-flash', 'gpt-4o-mini', 'ollama'].map(m => (
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
                    </View>
                </View>
            </Modal>
        </View>
    );
}
