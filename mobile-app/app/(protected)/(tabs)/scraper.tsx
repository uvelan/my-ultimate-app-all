import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { Plus, Trash2, Settings, X, Tag } from 'lucide-react-native';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { scraperService } from '@/src/services/features.service';

export default function ScraperScreen() {
    const [url, setUrl] = useState('');
    const [scraping, setScraping] = useState(false);
    const [sources, setSources] = useState<any[]>([]);
    const [scrapedNovels, setScrapedNovels] = useState<any[]>([]);
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    const [selectedSource, setSelectedSource] = useState<any>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newTagSearch, setNewTagSearch] = useState('');
    const [newTagReplace, setNewTagReplace] = useState('');
    const [sourceTags, setSourceTags] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [sourcesData, novelsData, settingsData] = await Promise.all([
                scraperService.getSources(),
                scraperService.getScrapedNovels(),
                scraperService.getScraperSettings()
            ]);
            setSources(sourcesData);
            setScrapedNovels(novelsData);
            setSettings(settingsData);
        } catch (error) {
            console.error('Scraper Sources Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleScrape = async () => {
        if (!url) return;
        setScraping(true);
        try {
            await scraperService.scrapeNovel(url);
            alert('Scrape initiated successfully!');
            setUrl('');
        } catch (error) {
            console.error('Scrape Error:', error);
            alert('Failed to initiate scrape.');
        } finally {
            setScraping(false);
        }
    };

    const handleAddToDb = async (novel: any) => {
        try {
            // Web frontend uses novel.author or "Unknown", and novel.coverUrl
            await scraperService.addNovelToLibrary(novel.id, novel.author || "Unknown", novel.coverUrl || "");
            Alert.alert("Success", "Novel added to your Library!");
            fetchData();
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to add novel to library");
        }
    };

    const handleDeleteScraped = async (id: string) => {
        Alert.alert('Verify Deletion', 'Delete this scraped novel from the queue?', [
            { text: 'Cancel', style: 'cancel' },
            { 
               text: 'Delete', 
               style: 'destructive',
               onPress: async () => {
                   try {
                       await scraperService.deleteScrapedNovel(id);
                       setScrapedNovels(scrapedNovels.filter(n => n.id !== id));
                   } catch (error) {
                       Alert.alert('Error', 'Failed to delete novel');
                   }
               }
            }
        ]);
    };

    const openSettings = (source: any) => {
        setSelectedSource(source);
        setSourceTags(settings[source.id]?.replacements || []);
        setIsSettingsOpen(true);
    };

    const saveSettings = async () => {
        if (!selectedSource) return;
        setSaving(true);
        try {
            await scraperService.updateScraperSettings(selectedSource.id, sourceTags);
            Alert.alert("Success", "Site settings updated!");
            setIsSettingsOpen(false);
            fetchData();
        } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to update settings");
        } finally {
            setSaving(false);
        }
    };

    const addTag = () => {
        if (!newTagSearch) return;
        setSourceTags([...sourceTags, { search: newTagSearch, replace: newTagReplace, isRegex: false }]);
        setNewTagSearch('');
        setNewTagReplace('');
    };

    const removeTag = (idx: number) => {
        const newTags = [...sourceTags];
        newTags.splice(idx, 1);
        setSourceTags(newTags);
    };

    return (
        <ScrollView className="flex-1 bg-[#2e1d15]">
            <View className="px-6 pt-12 pb-4 border-b border-[#5c4033] bg-[#1a110d]/50">
                <Text className="text-3xl font-bold text-[#e6dccf] font-serif">Novel Scraper</Text>
                <Text className="text-[#d4c5b0]/60 text-sm mt-1">Acquire new artifacts from the web</Text>
            </View>

            <View className="p-6">
                <Text className="text-[#e6dccf] font-bold text-lg mb-2">Quick Scrape</Text>
                <Input
                    placeholder="Enter novel URL..."
                    value={url}
                    onChangeText={setUrl}
                    className="mb-4"
                />
                <Button onPress={handleScrape} isLoading={scraping}>
                    Start Scraper
                </Button>

                <View className="mt-8">
                    <Text className="text-[#e6dccf] font-bold text-lg mb-4">Ready to Add</Text>
                    {loading ? (
                        <ActivityIndicator color="#8b4513" />
                    ) : scrapedNovels.length === 0 ? (
                        <Text className="text-[#d4c5b0]/60 italic">No completely scraped novels pending transfer.</Text>
                    ) : (
                        scrapedNovels.map((novel) => (
                            <View key={novel.id} className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3 flex-row items-center justify-between">
                                <View className="flex-1 mr-4">
                                    <Text className="text-white font-bold" numberOfLines={1}>{novel.title}</Text>
                                    <Text className="text-[#d4c5b0]/60 text-xs mt-1" numberOfLines={1}>
                                        {novel.url} • Chapters: {novel.chapters?.length || 0}
                                    </Text>
                                    <Text className="text-[#8b4513] text-[10px] font-bold uppercase mt-1">
                                        Status: {novel.status}
                                    </Text>
                                </View>
                                <View className="flex-row items-center gap-3">
                                    <TouchableOpacity 
                                        onPress={() => handleAddToDb(novel)} 
                                        className="bg-[#5c4033] p-2 rounded-lg flex-row items-center"
                                        disabled={novel.status !== 'COMPLETED'}
                                    >
                                        <Plus size={16} color={novel.status === 'COMPLETED' ? "#e6dccf" : "#6f4e37"} />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteScraped(novel.id)} className="bg-red-500/10 p-2 rounded-lg">
                                        <Trash2 size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View className="mt-8">
                    <Text className="text-[#e6dccf] font-bold text-lg mb-4">Supported Portals</Text>
                    {loading ? (
                        <ActivityIndicator color="#8b4513" />
                    ) : (
                        sources.map((source) => (
                            <TouchableOpacity 
                                key={source.id} 
                                onPress={() => openSettings(source)}
                                className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3 border-l-4 border-l-[#8b4513] flex-row justify-between items-center"
                            >
                                <View>
                                    <Text className="text-white font-bold">{source.name}</Text>
                                    <Text className="text-[#d4c5b0]/60 text-xs mt-1">{source.url}</Text>
                                </View>
                                <Settings size={20} color="#6f4e37" />
                            </TouchableOpacity>
                        ))
                    )}
                </View>
                <View className="h-10" />
            </View>

            {/* Site Config Modal */}
            <Modal visible={isSettingsOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 h-[80%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-[#e6dccf] font-serif">
                                Config: {selectedSource?.name}
                            </Text>
                            <TouchableOpacity onPress={() => setIsSettingsOpen(false)}>
                                <X size={24} color="#d4c5b0" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#d4c5b0] font-bold mb-4">Content Filtering Tags</Text>
                        <View className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-6">
                            <Text className="text-[#d4c5b0]/60 text-xs mb-3">Add strings that should be stripped or replaced during scraping for this site.</Text>
                            
                            <View className="flex-row gap-2 mb-4">
                                <TextInput
                                    className="flex-1 bg-[#2e1d15] text-white p-3 rounded-lg border border-[#5c4033]"
                                    placeholder="Search string..."
                                    placeholderTextColor="#6f4e37"
                                    value={newTagSearch}
                                    onChangeText={setNewTagSearch}
                                />
                                <TextInput
                                    className="flex-1 bg-[#2e1d15] text-white p-3 rounded-lg border border-[#5c4033]"
                                    placeholder="Replace with..."
                                    placeholderTextColor="#6f4e37"
                                    value={newTagReplace}
                                    onChangeText={setNewTagReplace}
                                />
                                <TouchableOpacity onPress={addTag} className="bg-[#5c4033] justify-center px-4 rounded-lg">
                                    <Plus size={20} color="#e6dccf" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView className="max-h-48 nested-scroll">
                                {sourceTags.length === 0 ? (
                                    <View className="py-4 items-center">
                                        <Tag size={20} color="#5c4033" className="mb-2" />
                                        <Text className="text-[#d4c5b0]/40 text-xs italic">No custom tags set for this site.</Text>
                                    </View>
                                ) : (
                                    sourceTags.map((tag, idx) => (
                                        <View key={idx} className="flex-row items-center justify-between bg-[#2e1d15] p-3 rounded-lg border border-[#5c4033]/50 mb-2">
                                            <View className="flex-1 flex-row flex-wrap items-center">
                                                <Text className="text-[#ef4444] font-bold bg-[#ef4444]/10 px-2 py-0.5 rounded text-xs">"{tag.search}"</Text>
                                                <Text className="text-[#d4c5b0]/40 mx-2">→</Text>
                                                <Text className="text-[#10b981] font-bold bg-[#10b981]/10 px-2 py-0.5 rounded text-xs">{tag.replace ? `"${tag.replace}"` : '(remove)'}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => removeTag(idx)} className="p-2 ml-2">
                                                <Trash2 size={16} color="#ef4444" />
                                            </TouchableOpacity>
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                        </View>

                        <View className="flex-1 justify-end pb-4">
                            <TouchableOpacity 
                                onPress={saveSettings}
                                disabled={saving}
                                className={`p-4 rounded-xl items-center flex-row justify-center ${saving ? 'bg-[#5c4033]' : 'bg-[#8b4513]'}`}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#e6dccf" className="mr-2" />
                                ) : null}
                                <Text className="text-[#e6dccf] font-bold text-lg">Save Site Config</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}
