import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, Switch } from 'react-native';
import { ChevronLeft, ChevronRight, Settings, Headphones, Download, CloudOff, Wand2, X, Plus, Minus } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { bookService } from '@/src/services/book.service';
import { replacementService } from '@/src/services/features.service';
import { offlineService } from '@/src/services/offline.service';
import { ttsService } from '@/src/services/tts.service';

export default function ReaderScreen() {
    const router = useRouter();
    const { id, chapterId = '1' } = useLocalSearchParams<{ id: string, chapterId: string }>();

    const [content, setContent] = useState<string>('');
    const [rawContent, setRawContent] = useState<string>('');
    const [replacements, setReplacements] = useState<any[]>([]);
    const [replacementsEnabled, setReplacementsEnabled] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isCorrecting, setIsCorrecting] = useState(false);
    const [fontSize, setFontSize] = useState(18);
    const [rate, setRate] = useState(1.0);
    const [sleepTimer, setSleepTimer] = useState<number | null>(null);

    const handleGrammarCorrection = async () => {
        if (isOffline) {
            alert("Grammar correction requires an internet connection.");
            return;
        }
        setIsCorrecting(true);
        try {
            const res = await bookService.proposeGrammarCorrection(id as string, chapterId as string, 'gemini-2.5-flash');
            
            if (res.correctedChapter) {
                // We use Alert in React Native for simple confirmations
                requestAnimationFrame(() => {
                    alert("Grammar correction generated successfully! Applying now...");
                    setRawContent(res.correctedChapter);
                    bookService.updateChapterContent(id as string, chapterId as string, res.correctedChapter)
                        .catch(err => console.error("Failed to save grammar on backend", err));
                });
            }
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Grammar correction failed.");
        } finally {
            setIsCorrecting(false);
        }
    };

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
                setRawContent(cachedContent);
                setIsOffline(true);
            } else {
                // 2. Fetch from API
                const data = await bookService.getChapterContent(id, chapterId);
                setRawContent(data.content);
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

    const fetchReplacements = async () => {
        try {
            const rules = await replacementService.getReplacements(id as string);
            setReplacements(rules);
        } catch (err) {
            console.error("Failed to fetch replacements", err);
        }
    };

    useEffect(() => {
        loadChapter();
        fetchReplacements();
    }, [id, chapterId]);

    // Apply replacements whenever content or rules change
    useEffect(() => {
        if (!rawContent) {
            setContent('');
            return;
        }

        if (!replacementsEnabled || replacements.length === 0) {
            setContent(rawContent);
            return;
        }

        let processedContent = rawContent;
        replacements.forEach(rule => {
            try {
                const searchValue = rule.isRegex ? new RegExp(rule.search, 'g') : rule.search;
                const replaceValue = rule.replace || '';

                if (rule.isRegex) {
                    processedContent = processedContent.replace(searchValue, replaceValue);
                } else {
                    processedContent = processedContent.split(searchValue as string).join(replaceValue);
                }
            } catch (e) {
                console.error(`Invalid replacement rule: ${rule.search}`, e);
            }
        });

        setContent(processedContent);
    }, [rawContent, replacements, replacementsEnabled]);

    useEffect(() => {
        const saveTimer = setTimeout(() => {
            if (id && chapterId) {
                const cIndex = parseInt(chapterId as string);
                if (!isNaN(cIndex)) {
                     bookService.updateProgress(id as string, cIndex, 0)
                        .catch((err: any) => console.log('Silently failed to sync progress', err.message));
                }
            }
        }, 1500);

        return () => clearTimeout(saveTimer);
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

                    <Pressable onPress={handleGrammarCorrection} disabled={isCorrecting} className={isCorrecting ? 'opacity-50' : ''}>
                        {isCorrecting ? <ActivityIndicator size="small" color="#5c4033" /> : <Wand2 size={20} color="#5c4033" />}
                    </Pressable>

                    <Download size={20} color="#5c4033" />
                    <Pressable onPress={() => setIsSettingsOpen(true)}>
                        <Settings size={22} color="#5c4033" />
                    </Pressable>
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

            {/* Settings Modal */}
            <Modal visible={isSettingsOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 min-h-[40%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#e6dccf] font-serif">Reader Settings</Text>
                            <Pressable onPress={() => setIsSettingsOpen(false)}>
                                <X size={24} color="#d4c5b0" />
                            </Pressable>
                        </View>

                        <Text className="text-[#d4c5b0] font-bold mb-3">Font Size</Text>
                        <View className="flex-row items-center justify-between bg-[#1a110d] p-3 rounded-xl border border-[#5c4033] mb-6">
                            <Pressable onPress={() => setFontSize(Math.max(12, fontSize - 2))} className="p-3 bg-[#5c4033] rounded-lg">
                                <Minus size={20} color="#e6dccf" />
                            </Pressable>
                            <Text className="text-[#e6dccf] font-bold text-lg">{fontSize}px</Text>
                            <Pressable onPress={() => setFontSize(Math.min(32, fontSize + 2))} className="p-3 bg-[#5c4033] rounded-lg">
                                <Plus size={20} color="#e6dccf" />
                            </Pressable>
                        </View>

                        <View className="flex-row items-center justify-between mb-2">
                            <View>
                                <Text className="text-[#d4c5b0] font-bold">Custom Replacements</Text>
                                <Text className="text-[#d4c5b0]/60 text-xs">Apply {replacements.length} custom text rules</Text>
                            </View>
                            <Switch 
                                value={replacementsEnabled}
                                onValueChange={setReplacementsEnabled}
                                trackColor={{ false: "#1a110d", true: "#8b4513" }}
                                thumbColor="#e6dccf"
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
