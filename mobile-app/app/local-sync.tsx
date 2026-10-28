import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LocalSyncPanel } from '@/src/components/LocalSyncPanel';

export default function LocalSyncScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ pair?: string }>();
    return <View style={{ flex: 1, backgroundColor: '#111827', paddingTop: 50 }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/' as any)} style={{ padding: 20 }}><Text style={{ color: '#f8fafc' }}>‹ Back</Text></Pressable>
        <LocalSyncPanel initialCode={typeof params.pair === 'string' ? params.pair : ''} initialOpen />
    </View>;
}
