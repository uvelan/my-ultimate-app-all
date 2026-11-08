import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, BackHandler, Pressable, Platform, ScrollView } from 'react-native';
import { Home, ShieldCheck, LogOut, Menu, X, Library, PieChart, CloudDownload, MessageSquare, Timer } from 'lucide-react-native';
import { usePathname, useRouter } from 'expo-router';
import { authService } from '@/src/services/auth.service';
import { desktopContentMax, desktopRailWidth, useAndroidWindow } from '@/src/lib/android-window';

const SIDEBAR_W = 260;

interface SidebarContextType {
    desktop: boolean;
    isOpen: boolean;
    toggle: () => void;
    close: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
    desktop: false,
    isOpen: false,
    toggle: () => {},
    close: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const { desktop } = useAndroidWindow();
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

    useEffect(() => {
        if (!isOpen || desktop) return;
        const listener = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
        return () => listener.remove();
    }, [close, desktop, isOpen]);

    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = async () => {
        close();
        await authService.logout().catch(() => {});
        router.replace('/(auth)/login' as any);
    };

    const navItems = [
        { label: 'Dashboard', icon: Home, route: '/(protected)/(tabs)/dashboard' },
        { label: 'Library', icon: Library, route: '/(protected)/(tabs)/library' },
        { label: 'Transactions', icon: PieChart, route: '/(protected)/transactions' },
        { label: 'Categories', icon: PieChart, route: '/(protected)/categories' },
        { label: 'Finance Dashboard', icon: PieChart, route: '/(protected)/(tabs)/expenses' },
        { label: 'Budgets & Recurring', icon: PieChart, route: '/(protected)/finance' },
        { label: 'Tasks', icon: Home, route: '/(protected)/tasks' },
        ...(Platform.OS === 'android' ? [{ label: 'Activity Tracker', icon: Timer, route: '/(protected)/activities' }] : []),
        { label: 'Interview', icon: MessageSquare, route: '/(protected)/interview' },
        { label: 'Resume builder', icon: Library, route: '/(protected)/resumes' },
        { label: 'Settings', icon: ShieldCheck, route: '/(protected)/settings' },
        { label: 'Data sync', icon: CloudDownload, route: '/(protected)/data-sync' },
        { label: 'Spent Sync', icon: MessageSquare, route: '/(protected)/spentsync' },
        { label: 'Scraper', icon: CloudDownload, route: '/(protected)/(tabs)/scraper' },
        { label: 'Admin', icon: ShieldCheck, route: '/(protected)/(tabs)/admin' },
    ];

    return (
        <SidebarContext.Provider value={{ desktop, isOpen, toggle, close }}>
            <View className="flex-1">
                <View className="flex-1 bg-background" style={{ paddingLeft: desktop ? desktopRailWidth : 0 }}>
                    <View style={{ flex: 1, width: '100%', alignSelf: 'center', maxWidth: desktopContentMax }}>{children}</View>
                </View>

                {/* Overlay */}
                {!desktop && isOpen && (
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
                    pointerEvents={desktop || isOpen ? 'auto' : 'none'}
                    importantForAccessibility={desktop || isOpen ? 'auto' : 'no-hide-descendants'}
                    style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0,
                        width: desktop ? desktopRailWidth : SIDEBAR_W,
                        transform: [{ translateX: desktop ? 0 : slideAnim }],
                        zIndex: 999,
                    }}
                >
                    <View className="flex-1 bg-background-surface border-r border-border shadow-2xl shadow-black" style={{ paddingTop: Platform.OS === 'ios' ? 50 : 40 }}>
                        {/* Header */}
                        <View className="px-6 pb-6 pt-2 border-b border-border flex-row justify-between items-center bg-background/50">
                            <Text className="text-text-primary text-xl font-bold font-serif">Menu</Text>
                            {!desktop && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close navigation" onPress={close} className="p-2 -mr-2 rounded-full hover:bg-white/5">
                                <X size={20} color="#888888" />
                            </TouchableOpacity>}
                        </View>

                        {/* Navigation Items */}
                        <ScrollView className="mt-2 flex-1 px-3">
                            {navItems.map((item) => {
                                const selected = item.route.replace(/\/\([^/]+\)/g, '') === pathname;
                                return (
                                <TouchableOpacity
                                    key={item.label}
                                    focusable
                                    accessibilityRole="link"
                                    accessibilityState={{ selected }}
                                    onPress={() => {
                                        close();
                                        if (!selected) router.push(item.route as any);
                                    }}
                                    className={`flex-row items-center px-3 py-3 my-1 gap-3 rounded-xl active:bg-white/5 ${selected ? 'bg-background' : ''}`}
                                    activeOpacity={0.6}
                                >
                                    <item.icon size={22} color="#f5f5f0" />
                                    <Text className="flex-1 text-text-primary font-semibold text-base">{item.label}</Text>
                                </TouchableOpacity>
                                );
                            })}
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
    const { toggle, desktop } = useSidebar();
    if (desktop) return null;
    return (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation" onPress={toggle} className="p-2 active:bg-white/10 rounded-lg">
            <Menu size={24} color="#f5f5f0" />
        </TouchableOpacity>
    );
}
