import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { AppCard } from '@/src/components/ui/AppCard';
import { bookService } from '@/src/services/book.service';
import { useRouter } from 'expo-router';

export default function LibraryScreen() {
    const [books, setBooks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();

    const fetchBooks = async () => {
        try {
            const data = await bookService.getBooks();
            setBooks(data);
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
        fetchBooks();
    };

    return (
        <View className="flex-1 bg-[#2e1d15]">
            <View className="px-6 pt-12 pb-4 border-b border-[#5c4033] bg-[#1a110d]/50">
                <Text className="text-3xl font-bold text-[#e6dccf] font-serif">My Library</Text>
                <Text className="text-[#d4c5b0]/60 text-sm mt-1">Your collection of digital artifacts</Text>
            </View>

            <FlatList
                data={books}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={{ padding: 16 }}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8b4513" />
                }
                renderItem={({ item }) => (
                    <View className="w-[48%]">
                        <AppCard
                            name={item.title}
                            description={item.author || 'Unknown Author'}
                            image={item.coverImage}
                            onPress={() => router.push(`/(protected)/reader/${item.id}` as any)}
                        />
                    </View>
                )}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator color="#8b4513" size="large" className="mt-20" />
                    ) : (
                        <View className="mt-20 items-center px-10">
                            <Text className="text-[#d4c5b0]/60 text-lg text-center">No books found. Use the Scraper to add some!</Text>
                        </View>
                    )
                }
            />
        </View>
    );
}
