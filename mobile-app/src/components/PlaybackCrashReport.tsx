import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { kokoroService } from '../services/kokoro.service';

export function PlaybackCrashReport() {
    const [report, setReport] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);
    useEffect(() => {
        let active = true;
        void kokoroService.lastFailure().then(value => { if (active) setReport(value); }).catch(() => {});
        return () => { active = false; };
    }, []);
    if (!report) return <Text style={{ color: '#64748b', marginVertical: 12 }}>No recent Android crash report.</Text>;
    return <View style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 12, padding: 12, margin: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)}>
            <Text style={{ color: '#7c2d12', fontWeight: '700' }}>Previous Android app exit · {expanded ? 'Hide' : 'Show'} crash details</Text>
        </Pressable>
        {expanded && <>
            <Text style={{ color: '#7c2d12', marginTop: 8 }}>These details stay on your phone. You can select the text to copy it or take a screenshot for troubleshooting.</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 8 }} contentContainerStyle={{ flexGrow: 0 }} nestedScrollEnabled>
                <Text selectable style={{ color: '#431407', fontSize: 12 }}>{report}</Text>
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => { kokoroService.dismissFailure(); setReport(null); }} style={{ paddingTop: 12 }}>
                <Text style={{ color: '#7c2d12', fontWeight: '700' }}>Dismiss report</Text>
            </Pressable>
        </>}
    </View>;
}
