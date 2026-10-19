import { Redirect } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export default function Index() {
    const [authenticated, setAuthenticated] = useState<boolean | null>(null);
    useEffect(() => { let active = true;
        SecureStore.getItemAsync('refreshToken').then(token => { if (active) setAuthenticated(!!token); }).catch(() => { if (active) setAuthenticated(false); });
        return () => { active = false; };
    }, []);
    if (authenticated === null) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color="#8b5cf6" /></View>;
    return authenticated ? <Redirect href="/(protected)/(tabs)/dashboard" /> : <Redirect href="/(auth)/login" />;
}
