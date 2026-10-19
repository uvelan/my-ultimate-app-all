import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
import { AppCard } from '@/src/components/ui/AppCard';
import { useRouter } from 'expo-router';
import { api } from '@/src/lib/api-client';
import { SidebarToggle } from '@/src/components/ui/Sidebar';

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
                let link = app.appLink || '/finance';

                // Transformation mapping
                const routeMap: Record<string, string> = {
                    '/myexpence': 'expenses',
                    '/finance': 'expenses',
                    '/finance/dashboard': 'expenses',
                    '/finance/transactions': '../transactions',
                    '/finance/categories': '../categories',
                    '/finance/calendar': 'expenses',
                    '/finance/budgets': '../finance',
                    '/finance/recurring': '../finance',
                    '/finance/reports': '../finance',
                    '/books': 'library',
                    '/novelscraper': 'scraper',
                    '/admin': 'admin',
                    '/settings': '../settings',
                    '/interview': '../interview',
                    '/interview/explore': '../interview',
                    '/interview/manage': '../interview',
                    '/interview/goals': '../interview',
                    '/interview/flashcards': '../interview',
                    '/interview/mock': '../interview',
                    '/interview/ai-jobs': '../interview',
                    '/resume-builder': '../resumes',
                    '/admin/data-sync': '../data-sync',
                    '/admin/users': '../admin/users',
                    '/admin/my-apps': '../admin/apps'
                    ,'/tasks': '../tasks'
                };

                const mappedRoute = routeMap[link] || link;

                // Explicitly use the full path with groups for navigation
                let finalLink = mappedRoute;
                if (!finalLink.startsWith('http')) {
                    if (!routeMap[link] && !['dashboard', 'expenses', 'library', 'scraper', 'admin'].includes(link)) {
                        finalLink = `${baseUrl}${link.startsWith('/') ? link : `/${link}`}`;
                    } else if (mappedRoute.startsWith('../')) {
                        finalLink = `/(protected)/${mappedRoute.slice(3)}`;
                    } else {
                    const segment = finalLink.startsWith('/') ? finalLink.substring(1) : finalLink;
                    finalLink = segment.includes('(') ? (segment.startsWith('/') ? segment : `/${segment}`) : `/(protected)/(tabs)/${segment}`;
                    }
                }

                return {
                    id: app.id,
                    name: app.name,
                    description: /^https?:\/\//.test(finalLink) ? `${app.description || ''}${app.description ? '\n' : ''}Open web` : app.description,
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
        <View className="flex-1 bg-background">
            <View className="px-6 pt-12 pb-4 border-b border-border bg-background-surface/80 flex-row items-center">
                <SidebarToggle />
                <View className="ml-3">
                    <Text className="text-3xl font-bold text-text-primary font-serif">Explore Apps</Text>
                    <Text className="text-text-secondary text-sm mt-1">Discover and manage your connected modules.</Text>
                </View>
            </View>

            <FlatList
                data={apps}
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
                            name={item.name}
                            description={item.description}
                            image={item.imageLink}
                            onPress={() => {
                                if (/^https?:\/\//.test(item.appLink)) {
                                    Linking.openURL(item.appLink).catch(() => Alert.alert('Unable to open module', 'Please try again.'));
                                } else router.push(item.appLink);
                            }}
                        />
                    </View>
                )}
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator color="#8b5cf6" size="large" className="mt-20" />
                    ) : (
                        <View className="mt-20 items-center">
                            <Text className="text-text-secondary text-lg">No modules found</Text>
                        </View>
                    )
                }
            />
        </View>
    );
}
