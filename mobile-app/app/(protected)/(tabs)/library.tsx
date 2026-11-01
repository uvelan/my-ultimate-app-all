import { bookProgress } from '@/src/lib/book-progress';
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Alert, TouchableOpacity, Platform } from 'react-native';
import { AppCard } from '@/src/components/ui/AppCard';
import { bookService } from '@/src/services/book.service';
import { exportLibraryBook } from '@/src/services/book-export.service';
import type { LibraryExportFormat } from '@/src/lib/book-export-file';
import { offlineService } from '@/src/services/offline.service';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { cacheService } from '@/src/lib/storage';
import { Upload, BookOpen, Download, RefreshCw, Plus } from 'lucide-react-native';

export default function LibraryScreen() {
    const [books, setBooks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncingIds, setSyncingIds] = useState<string[]>([]);
    const [syncedIds, setSyncedIds] = useState<string[]>([]);
    const [exportingIds, setExportingIds] = useState<string[]>([]);
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

    const runExport = async (book: any, format: LibraryExportFormat, destination: 'save' | 'share') => {
        if (exportingIds.includes(book.id)) return;
        setExportingIds(ids => [...ids, book.id]);
        try {
            const result = await exportLibraryBook(book, format, destination);
            if (result.status === 'saved') Alert.alert('Book saved', `${result.filename} was saved and verified in the folder you selected.`);
            // Closing a share sheet is not proof that another app saved the file.
        } catch (error: any) { Alert.alert('Export failed', error.message || 'No book was saved. Please try again.'); }
        finally { setExportingIds(ids => ids.filter(id => id !== book.id)); }
    };
    const chooseDestination = (book: any, format: LibraryExportFormat) => {
        if (Platform.OS !== 'android') { void runExport(book, format, 'share'); return; }
        Alert.alert('Export ' + format.toUpperCase(), 'Choose where to save the validated book.', [
            { text: 'Save to folder', onPress: () => { void runExport(book, format, 'save'); } },
            { text: 'Share file', onPress: () => { void runExport(book, format, 'share'); } },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };
    const handleDownload = (book: any) => {
        if (exportingIds.includes(book.id)) return;
        Alert.alert('Export book', 'Choose a format. All chapters are checked before export.', [
            { text: 'EPUB', onPress: () => chooseDestination(book, 'epub') },
            { text: 'JSON backup', onPress: () => chooseDestination(book, 'json') },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const handleUpload = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/epub+zip', 'application/json'],
                copyToCacheDirectory: true
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const file = result.assets[0];
            setLoading(true);
            Alert.alert("Uploading", `Uploading "${file.name}"...`);

            await bookService.uploadBook({
                uri: file.uri,
                name: file.name,
                type: file.mimeType || (file.name.endsWith('.epub') ? 'application/epub+zip' : 'application/json')
            });

            Alert.alert("Success", "Book uploaded and processed successfully!");
            fetchBooks(true); // Refresh list
        } catch (error: any) {
            console.error('Upload Error:', error);
            Alert.alert("Error", error.message || "Failed to upload book");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-background">
            <View className="px-6 pt-12 pb-4 border-b border-border bg-background-surface/80 flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                    <SidebarToggle />
                    <View className="ml-3">
                        <Text className="text-3xl font-bold text-text-primary font-serif">Digital Library</Text>
                        <Text className="text-text-secondary text-sm mt-1">Access and manage your personal collection.</Text>
                    </View>
                </View>
                
                <TouchableOpacity 
                    onPress={handleUpload}
                    className="p-3 bg-accent/20 rounded-full border border-accent/30"
                >
                    <Plus size={24} color="#8b5cf6" />
                </TouchableOpacity>
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
                            onPress={() => router.push(`/reader/${item.id}?chapterId=${bookProgress.getChapter(item.id, item.chapterId ?? 0)}` as any)}
                            onListen={() => router.push(`/listen/${item.id}` as any)}
                            onDownload={() => handleDownload(item)}
                            downloading={exportingIds.includes(item.id)}
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
