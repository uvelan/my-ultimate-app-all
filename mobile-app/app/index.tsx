import { Redirect } from 'expo-router';
import { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Logic to check session (Agent 9 will implement SecureStore logic)
        // For now, we wait 1s and redirect to login
        const timer = setTimeout(() => {
            setCheckingAuth(false);
            setIsAuthenticated(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    if (checkingAuth) {
        return (
            <View className="flex-1 bg-[#2e1d15] items-center justify-center">
                <ActivityIndicator size="large" color="#8b4513" />
            </View>
        );
    }

    if (isAuthenticated) {
        return <Redirect href="/(protected)/(tabs)/dashboard" />;
    }

    return <Redirect href="/(auth)/login" />;
}
