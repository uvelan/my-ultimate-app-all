import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LocalSyncPanel } from '@/src/components/LocalSyncPanel';
import { cacheService } from '@/src/lib/storage';

export default function LocalSyncScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ pair?: string }>();
    const profile = cacheService.getObject<{ id?: string; email?: string }>('session-profile');
    return <View style={{ flex: 1, backgroundColor: '#111827', paddingTop: 50 }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/' as any)} style={{ padding: 20 }}><Text style={{ color: '#f8fafc' }}>‹ Back</Text></Pressable>
        <LocalSyncPanel userId={profile?.id || profile?.email || ''} initialCode={typeof params.pair === 'string' ? params.pair : ''} initialOpen />
    </View>;
}
