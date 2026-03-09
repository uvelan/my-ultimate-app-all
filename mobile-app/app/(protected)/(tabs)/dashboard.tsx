import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { AppCard } from '@/src/components/ui/AppCard';
import { useRouter } from 'expo-router';
import { api } from '@/src/lib/api-client';

interface MyApp {
    id: string;
    name: string;
    description: string;
    imageLink: string;
    appLink: any;
}

export default function DashboardScreen() {
    const [apps, setApps] = useState<MyApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();

    const fetchApps = async () => {
        try {
            const res = await api.get('/my-apps');
            const data = res.data.map((app: any) => {
                const baseUrl = api.defaults.baseURL?.replace('/api', '') || '';
                let imageUrl = app.imageLink || '';
                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = `${baseUrl}${imageUrl}`;
                }

                // Map legacy/web links to mobile routes
                let link = app.appLink || 'expenses';

                // Transformation mapping
                const routeMap: Record<string, string> = {
                    '/myexpence': 'expenses',
                    '/books': 'library',
                    '/novelscraper': 'scraper',
                    '/admin': 'admin'
                };

                const mappedRoute = routeMap[link] || link;

                // Explicitly use the full path with groups for navigation
                let finalLink = mappedRoute;
                if (!finalLink.startsWith('http')) {
                    const segment = finalLink.startsWith('/') ? finalLink.substring(1) : finalLink;
                    finalLink = segment.includes('(') ? (segment.startsWith('/') ? segment : `/${segment}`) : `/(protected)/(tabs)/${segment}`;
                }

                return {
                    id: app.id,
                    name: app.name,
                    description: app.description,
                    imageLink: imageUrl,
                    appLink: finalLink,
                };
            });
            setApps(data);
        } catch (error) {
            console.error('Dashboard Fetch Error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchApps();
    };

    return (
        <View className="flex-1 bg-[#2e1d15]">
            <View className="px-6 pt-12 pb-4 border-b border-[#5c4033] bg-[#1a110d]/50">
                <Text className="text-3xl font-bold text-[#e6dccf] font-serif">Explorer Hub</Text>
                <Text className="text-[#d4c5b0]/60 text-sm mt-1">Select an artifact to begin</Text>
            </View>

            <FlatList
                data={apps}
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
                            name={item.name}
                            description={item.description}
                            image={item.imageLink}
                            onPress={() => router.push(item.appLink)}
                        />
                    </View>
                )}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator color="#8b4513" size="large" className="mt-20" />
                    ) : (
                        <View className="mt-20 items-center">
                            <Text className="text-[#d4c5b0]/60 text-lg">No modules found</Text>
                        </View>
                    )
                }
            />
        </View>
    );
}
