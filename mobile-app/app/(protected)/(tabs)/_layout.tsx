import { Tabs } from 'expo-router';
import React from 'react';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: { display: 'none' },
            }}
        >
            <Tabs.Screen name="dashboard" />
            <Tabs.Screen name="library" />
            <Tabs.Screen name="expenses" />
            <Tabs.Screen name="scraper" />
            <Tabs.Screen name="admin" />
        </Tabs>
    );
}
