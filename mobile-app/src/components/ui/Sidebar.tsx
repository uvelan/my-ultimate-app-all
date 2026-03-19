import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, Pressable, Dimensions, Platform, ScrollView } from 'react-native';
import { Home, ShieldCheck, LogOut, Menu, X, ChevronLeft, Library, PieChart, CloudDownload } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = 260;

interface SidebarContextType {
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
    isOpen: false,
    toggle: () => {},
    close: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(-SIDEBAR_W)).current;
    const overlayAnim = useRef(new Animated.Value(0)).current;

    const open = useCallback(() => {
        setIsOpen(true);
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
    }, []);

    const close = useCallback(() => {
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: -SIDEBAR_W, useNativeDriver: true, speed: 20, bounciness: 4 }),
            Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setIsOpen(false));
    }, []);

    const toggle = useCallback(() => {
        if (isOpen) close();
        else open();
    }, [isOpen]);

    const router = useRouter();

    const handleLogout = async () => {
        close();
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        router.replace('/(auth)/login' as any);
    };

    const navItems = [
        { label: 'Dashboard', icon: Home, route: '/(protected)/(tabs)/dashboard' },
        { label: 'Library', icon: Library, route: '/(protected)/(tabs)/library' },
        { label: 'Expenses', icon: PieChart, route: '/(protected)/(tabs)/expenses' },
        { label: 'Scraper', icon: CloudDownload, route: '/(protected)/(tabs)/scraper' },
        { label: 'Admin', icon: ShieldCheck, route: '/(protected)/(tabs)/admin' },
    ];

    return (
        <SidebarContext.Provider value={{ isOpen, toggle, close }}>
            <View className="flex-1">
                {children}

                {/* Overlay */}
                {isOpen && (
                    <Animated.View
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            opacity: overlayAnim,
                            zIndex: 998,
                        }}
                    >
                        <Pressable style={{ flex: 1 }} onPress={close} />
                    </Animated.View>
                )}

                {/* Sidebar Panel */}
                <Animated.View
                    style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0,
                        width: SIDEBAR_W,
                        transform: [{ translateX: slideAnim }],
                        zIndex: 999,
                    }}
                >
                    <View className="flex-1 bg-background-surface border-r border-border shadow-2xl shadow-black" style={{ paddingTop: Platform.OS === 'ios' ? 50 : 40 }}>
                        {/* Header */}
                        <View className="px-6 pb-6 pt-2 border-b border-border flex-row justify-between items-center bg-background/50">
                            <Text className="text-text-primary text-xl font-bold font-serif">Menu</Text>
                            <TouchableOpacity onPress={close} className="p-2 -mr-2 rounded-full hover:bg-white/5">
                                <X size={20} color="#888888" />
                            </TouchableOpacity>
                        </View>

                        {/* Navigation Items */}
                        <ScrollView className="mt-2 flex-1 px-3">
                            {navItems.map((item) => (
                                <TouchableOpacity
                                    key={item.label}
                                    onPress={() => {
                                        close();
                                        router.push(item.route as any);
                                    }}
                                    className="flex-row items-center px-4 py-4 my-1 gap-4 rounded-xl active:bg-white/5"
                                    activeOpacity={0.6}
                                >
                                    <item.icon size={22} color="#f5f5f0" />
                                    <Text className="text-text-primary font-semibold text-base">{item.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Logout */}
                        <View className="p-4 border-t border-border bg-background/30">
                            <TouchableOpacity
                                onPress={handleLogout}
                                className="flex-row items-center px-4 py-4 gap-4 rounded-xl active:bg-error/10"
                                activeOpacity={0.6}
                            >
                                <LogOut size={22} color="#f5f5f0" />
                                <Text className="text-text-primary font-semibold text-base">Logout</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </SidebarContext.Provider>
    );
}

/** Small hamburger button component — drop this into any screen header */
export function SidebarToggle() {
    const { toggle } = useSidebar();
    return (
        <TouchableOpacity onPress={toggle} className="p-2 active:bg-white/10 rounded-lg">
            <Menu size={24} color="#f5f5f0" />
        </TouchableOpacity>
    );
}
