import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { kokoroService } from '../services/kokoro.service';

export function KokoroSetup({ onReady, textClass = 'text-text-primary' }: { onReady(): void; textClass?: string }) {
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const alive = useRef(true);
    const reportedReady = useRef(false);
    const reportReady = () => { if (!reportedReady.current) { reportedReady.current = true; completed.current(); } };
    const completed = useRef(onReady); completed.current = onReady;
    useEffect(() => {
        alive.current = true;
        void kokoroService.status().then(status => {
            if (!alive.current) return;
            setReady(status.ready); setBusy(status.installing);
        }).catch(error => { if (alive.current) setError(error.message); }).finally(() => { if (alive.current) setChecking(false); });
        const unsubscribe = kokoroService.subscribe(event => {
            if (event.requestId || !alive.current) return;
            if (event.phase === 'download') { setBusy(true); setMessage(`Downloading voice model: ${Math.round(event.progress * 100)}%`); }
            if (event.phase === 'extract') setMessage('Verifying and installing voice model…');
            if (event.phase === 'error') { setBusy(false); setError(event.message || 'Voice model download failed. Please retry.'); }
            if (event.phase === 'ready') { setReady(true); setBusy(false); setError(''); reportReady(); }
        });
        return () => { alive.current = false; unsubscribe(); };
    }, []);
    const install = async () => {
        setError(''); setBusy(true); setMessage('Starting voice model download…');
        try { await kokoroService.install(); if (alive.current) { setReady(true); reportReady(); } }
        catch (error: any) { if (alive.current) setError(error.message || 'Download failed. Please retry.'); }
        finally { if (alive.current) setBusy(false); }
    };
    if (checking) return <ActivityIndicator accessibilityLabel="Checking offline voice model" color="#8b5cf6" />;
    if (ready) return <Text className="text-accent text-xs text-center mb-3">Kokoro · female voice · ready offline</Text>;
    return <View className="border border-accent/40 rounded-xl p-4 mb-4">
        <Text className={`${textClass} font-bold mb-2`}>Set up offline narration</Text>
        <Text className={`${textClass} text-sm mb-3`}>Download the female Kokoro voices once (127 MB). Chapters are then generated on your phone. Allow 600 MB free space for installation.</Text>
        {!!error && <Text accessibilityRole="alert" className="text-red-400 mb-2">{error}</Text>}
        {busy ? <View>
            <Text accessibilityLiveRegion="polite" className={`${textClass} mb-2`}>{message || 'Downloading voice model…'}</Text>
            <Pressable accessibilityRole="button" onPress={() => kokoroService.cancelInstall()}><Text className="text-accent font-bold">Cancel download</Text></Pressable>
        </View> : <Pressable accessibilityRole="button" onPress={() => { void install(); }}><Text className="text-accent font-bold">{error ? 'Retry voice model download' : 'Download voice model'}</Text></Pressable>}
    </View>;
}
