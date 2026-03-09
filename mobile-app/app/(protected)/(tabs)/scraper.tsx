import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { scraperService } from '@/src/services/features.service';

export default function ScraperScreen() {
    const [url, setUrl] = useState('');
    const [scraping, setScraping] = useState(false);
    const [sources, setSources] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSources();
    }, []);

    const fetchSources = async () => {
        try {
            const data = await scraperService.getSources();
            setSources(data);
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
                    <Text className="text-[#e6dccf] font-bold text-lg mb-4">Supported Portals</Text>
                    {loading ? (
                        <ActivityIndicator color="#8b4513" />
                    ) : (
                        sources.map((source) => (
                            <View key={source.id} className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3">
                                <Text className="text-white font-bold">{source.name}</Text>
                                <Text className="text-[#d4c5b0]/60 text-xs">{source.url}</Text>
                            </View>
                        ))
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
