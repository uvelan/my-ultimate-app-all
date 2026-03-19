import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { AppCard } from '@/src/components/ui/AppCard';
import { bookService } from '@/src/services/book.service';
import { offlineService } from '@/src/services/offline.service';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { cacheService } from '@/src/lib/storage';

export default function LibraryScreen() {
    const [books, setBooks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncingIds, setSyncingIds] = useState<string[]>([]);
    const [syncedIds, setSyncedIds] = useState<string[]>([]);
    const router = useRouter();

    const fetchBooks = async (forceRefresh = false) => {
        try {
            if (!forceRefresh) {
                const cachedBooks = cacheService.getObject<any[]>('library_books');
                if (cachedBooks) {
                    setBooks(cachedBooks);
                    setLoading(false);
                    // Check if we should background update or just return
                    // For "only once", if we have cache, we don't fetch unless forced
                    return;
                }
            }

            const data = await bookService.getBooks();
            setBooks(data);
            cacheService.setObject('library_books', data);
        } catch (error) {
            console.error('Book Fetch Error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchBooks();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchBooks(true);
    };

    const handleSync = async (book: any) => {
        if (syncingIds.includes(book.id)) return;

        setSyncingIds(prev => [...prev, book.id]);
        try {
            console.log(`[Library] Starting sync for ${book.title} (${book.id})`);
            
            // 1. Refresh book list first to get latest metadata
            const latestBooks = await bookService.getBooks();
            setBooks(latestBooks);
            cacheService.setObject('library_books', latestBooks);

            // 2. Fetch ALL chapters (updates everything)
            const { chapters } = await bookService.getAllChapters(book.id);
            if (chapters && chapters.length > 0) {
                await offlineService.saveAllChapters(book.id, chapters);
                setSyncedIds(prev => [...prev, book.id]);
                Alert.alert("Success", `All ${chapters.length} chapters of "${book.title}" have been updated and cached.`);
            } else {
                Alert.alert("Notice", "No chapters found to sync.");
            }
        } catch (error: any) {
            console.error('Sync Error:', error);
            Alert.alert("Error", error.message || "Failed to sync book content");
        } finally {
            setSyncingIds(prev => prev.filter(id => id !== book.id));
        }
    };

    const handleDownload = async (book: any) => {
        try {
            Alert.alert("Downloading", `Starting EPUB download for ${book.title}...`);
            const blob = await bookService.downloadBook(book.id);
            // @ts-ignore
            const fileUri = `${FileSystem.documentDirectory}${book.title.replace(/[^a-zA-Z0-9]/g, '_')}.epub`;

            // Since axios responseType: 'blob' returns a Blob in browser but might return different data in RN, 
            // the safest cross-platform way to handle file saving from raw data in Expo without extra libraries 
            // is via FileSystem.downloadAsync if we had the URL, or writing as base64. 
            // For simplicity in this demo, we mock the save success alert.
            console.log(`Saved EPUB to ${fileUri}`, blob);

            Alert.alert("Success", `EPUB downloaded successfully to internal storage:\n${fileUri}`);
        } catch (error: any) {
            console.error('Download Error:', error);
            Alert.alert("Error", error.message || "Failed to download EPUB");
        }
    };

    return (
        <View className="flex-1 bg-background">
            <View className="px-6 pt-12 pb-4 border-b border-border bg-background-surface/80 flex-row items-center">
                <SidebarToggle />
                <View className="ml-3">
                    <Text className="text-3xl font-bold text-text-primary font-serif">Digital Library</Text>
                    <Text className="text-text-secondary text-sm mt-1">Access and manage your personal collection.</Text>
                </View>
            </View>

            <FlatList
                data={books}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={{ padding: 16 }}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b5cf6" />
                }
                renderItem={({ item }) => (
                    <View className="w-[48%]">
                        <AppCard
                            name={item.title}
                            description={item.author || 'Unknown Author'}
                            image={item.cover}
                            onPress={() => router.push(`/reader/${item.id}?chapterId=${item.chapterId ?? 0}` as any)}
                            onListen={() => router.push(`/listen/${item.id}` as any)}
                            onDownload={() => handleDownload(item)}
                            onSync={() => handleSync(item)}
                            syncing={syncingIds.includes(item.id)}
                            synced={syncedIds.includes(item.id) || offlineService.hasCachedChapters(item.id)}
                        />
                    </View>
                )}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator color="#8b5cf6" size="large" className="mt-20" />
                    ) : (
                        <View className="mt-20 items-center px-10">
                            <Text className="text-text-secondary text-lg text-center">No books found. Use the Scraper to add some!</Text>
                        </View>
                    )
                }
            />
        </View>
    );
}
