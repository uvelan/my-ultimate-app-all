import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { PlaybackCrashReport } from '@/src/components/PlaybackCrashReport';
import { audioDiagnostics } from '@/src/lib/audio-diagnostics';
import { cacheService } from '@/src/lib/storage';

export default function DiagnosticsScreen() {
    const router = useRouter();
    const [revision, setRevision] = useState(0);
    const refresh = () => setRevision(value => value + 1);
    useFocusEffect(useCallback(() => { refresh(); }, []));
    const light = cacheService.get('reader-theme') === 'light';
    const color = light ? '#0f172a' : '#f1f5f9';
    const events = audioDiagnostics.read();
    return <View style={{ flex: 1, backgroundColor: light ? '#fafafa' : '#111827', paddingTop: 44 }}>
        <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(protected)/settings' as any)}><Text style={{ color, fontSize: 24 }}>‹</Text></Pressable>
            <Text style={{ color, fontSize: 23, fontWeight: '700' }}>Diagnostics</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
            <Text style={{ color }}>Android app {Constants.expoConfig?.version || 'unknown'} · Kokoro v1.0 INT8</Text>
            <Text style={{ color, marginVertical: 12 }}>Crash reports and the latest 100 audio events stay on this phone. Audio event logs exclude chapter text and account details.</Text>
            <Pressable accessibilityRole="button" onPress={refresh} style={{ paddingVertical: 12 }}><Text style={{ color: '#8b5cf6', fontWeight: '700' }}>Refresh diagnostics</Text></Pressable>
            <Text style={{ color, fontSize: 19, fontWeight: '700', marginTop: 16 }}>Crash report</Text>
            <PlaybackCrashReport key={revision} />
            <Text style={{ color, fontSize: 19, fontWeight: '700', marginTop: 20 }}>Audio debug logs</Text>
            <Pressable accessibilityRole="button" onPress={() => { audioDiagnostics.clear(); refresh(); }} style={{ paddingVertical: 14 }}><Text style={{ color: '#8b5cf6', fontWeight: '700' }}>Clear debug logs</Text></Pressable>
            <Text selectable style={{ color, fontSize: 12, lineHeight: 20 }}>{events.length ? events.map(entry => entry.time + ' · ' + entry.event + '\n' + JSON.stringify(entry.details)).join('\n\n') : 'No audio events recorded yet.'}</Text>
        </ScrollView>
    </View>;
}
