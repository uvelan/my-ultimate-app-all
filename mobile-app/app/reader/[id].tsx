import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { ChevronLeft, ChevronRight, Settings, Headphones, Download, CloudOff } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { bookService } from '@/src/services/book.service';
import { offlineService } from '@/src/services/offline.service';
import { ttsService } from '@/src/services/tts.service';

export default function ReaderScreen() {
    const router = useRouter();
    const { id, chapterId = '1' } = useLocalSearchParams<{ id: string, chapterId: string }>();

    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [fontSize, setFontSize] = useState(18);
    const [rate, setRate] = useState(1.0);
    const [sleepTimer, setSleepTimer] = useState<number | null>(null);

    const toggleTTS = async () => {
        if (isSpeaking) {
            ttsService.stop();
            setIsSpeaking(false);
        } else {
            setIsSpeaking(true);
            ttsService.speak(content, rate, () => setIsSpeaking(false));
        }
    };

    const startSleepTimer = (minutes: number) => {
        if (sleepTimer) clearTimeout(sleepTimer);
        const timer = setTimeout(() => {
            ttsService.stop();
            setIsSpeaking(false);
            setSleepTimer(null);
        }, minutes * 60000);
        setSleepTimer(timer as any);
    };

    const nextRate = () => {
        const rates = [0.75, 1.0, 1.25, 1.5, 2.0];
        const currentIndex = rates.indexOf(rate);
        const next = rates[(currentIndex + 1) % rates.length];
        setRate(next);
        if (isSpeaking) {
            ttsService.stop();
            ttsService.speak(content, next, () => setIsSpeaking(false));
        }
    };

    const loadChapter = async () => {
        setLoading(true);
        try {
            // 1. Try local cache first
            const cachedContent = await offlineService.getChapter(id, chapterId);
            if (cachedContent) {
                setContent(cachedContent);
                setIsOffline(true);
            } else {
                // 2. Fetch from API
                const data = await bookService.getChapterContent(id, chapterId);
                setContent(data.content);
                setIsOffline(false);
                // 3. Silently save to cache for next time
                await offlineService.saveChapter(id, chapterId, data.content);
            }
        } catch (error) {
            console.error("Failed to load chapter:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadChapter();
    }, [id, chapterId]);

    return (
        <View className="flex-1 bg-[#f4e4bc] pt-12">
            {/* Header */}
            <View className="px-6 py-4 flex-row justify-between items-center bg-[#f4e4bc] border-b border-black/5">
                <Pressable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#5c4033" />
                </Pressable>
                <View className="items-center">
                    <Text className="text-[#5c4033] font-bold font-serif text-base">
                        Chapter {chapterId}
                    </Text>
                    {isOffline && (
                        <View className="flex-row items-center">
                            <CloudOff size={10} color="#8b4513" />
                            <Text className="text-[#8b4513] text-[8px] font-bold ml-1 uppercase">Offline Mode</Text>
                        </View>
                    )}
                </View>
                <View className="flex-row gap-5 items-center">
                    <Pressable onPress={toggleTTS} className="flex-row items-center">
                        <Headphones size={22} color={isSpeaking ? "#8b4513" : "#5c4033"} />
                        {isSpeaking && <View className="w-1.5 h-1.5 rounded-full bg-[#8b4513] absolute -top-1 -right-1" />}
                    </Pressable>

                    {isSpeaking && (
                        <>
                            <Pressable onPress={nextRate} className="bg-[#5c4033]/10 px-2 py-0.5 rounded">
                                <Text className="text-[#5c4033] text-[10px] font-bold">{rate}x</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => startSleepTimer(sleepTimer ? 0 : 30)}
                                className={`p-1 rounded-full ${sleepTimer ? 'bg-[#8b4513]/10' : ''}`}
                            >
                                <View className="flex-row items-center">
                                    <View className="w-4 h-4 items-center justify-center">
                                        <View className="w-3 h-3 border border-[#5c4033] rounded-full" />
                                        <View className="w-1.5 h-0.5 bg-[#5c4033] absolute" style={{ top: 8, left: 8, transform: [{ rotate: '45deg' }] }} />
                                    </View>
                                    {sleepTimer && <Text className="text-[#8b4513] text-[8px] font-bold ml-0.5">30m</Text>}
                                </View>
                            </Pressable>
                        </>
                    )}

                    <Download size={20} color="#5c4033" />
                    <Settings size={22} color="#5c4033" />
                </View>
            </View>

            {/* Content */}
            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color="#8b4513" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
                    <Text
                        className="text-[#2e1d15] font-serif leading-8"
                        style={{ fontSize }}
                    >
                        {content || 'No content found for this chapter.'}
                    </Text>
                </ScrollView>
            )}

            {/* Footer */}
            <View className="absolute bottom-0 left-0 right-0 bg-[#f4e4bc] border-t border-black/5 p-6 flex-row justify-between items-center">
                <Pressable
                    className="flex-row items-center"
                    onPress={() => {
                        const prev = Math.max(1, parseInt(chapterId) - 1);
                        router.setParams({ chapterId: prev.toString() });
                    }}
                >
                    <ChevronLeft size={20} color="#5c4033" />
                    <Text className="text-[#5c4033] ml-1 font-bold">Prev</Text>
                </Pressable>

                <Text className="text-[#5c4033]/60 text-xs italic">Chapter {chapterId}</Text>

                <Pressable
                    className="flex-row items-center"
                    onPress={() => {
                        const next = parseInt(chapterId) + 1;
                        router.setParams({ chapterId: next.toString() });
                    }}
                >
                    <Text className="text-[#5c4033] mr-1 font-bold">Next</Text>
                    <ChevronRight size={20} color="#5c4033" />
                </Pressable>
            </View>
        </View>
    );
}
