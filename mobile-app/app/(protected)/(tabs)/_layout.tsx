import { Tabs } from 'expo-router';
import React from 'react';
import { Home, Library, PiggyBank, ShieldCheck, Globe } from 'lucide-react-native';

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#1a110d',
                    borderTopColor: '#5c4033',
                    height: 60,
                    paddingBottom: 10,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: '#e6dccf',
                tabBarInactiveTintColor: '#6f4e37',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: 'bold',
                }
            }}
        >
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color }) => <Home size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="library"
                options={{
                    title: 'Library',
                    tabBarIcon: ({ color }) => <Library size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="expenses"
                options={{
                    title: 'Expenses',
                    tabBarIcon: ({ color }) => <PiggyBank size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="scraper"
                options={{
                    title: 'Scraper',
                    tabBarIcon: ({ color }) => <Globe size={22} color={color} />,
                }}
            />
            <Tabs.Screen
                name="admin"
                options={{
                    title: 'Admin',
                    tabBarIcon: ({ color }) => <ShieldCheck size={22} color={color} />,
                }}
            />
        </Tabs>
    );
}
