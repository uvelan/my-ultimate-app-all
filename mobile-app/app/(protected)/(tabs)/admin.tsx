import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ShieldCheck, User as UserIcon, LogOut, Settings, Users, LayoutGrid } from 'lucide-react-native';
import { authService, User } from '@/src/services/auth.service';
import { Card } from '@/src/components/ui/Card';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function AdminScreen() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
            } catch (error) {
                console.error('Profile fetch failed:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleLogout = async () => {
        try {
            await authService.logout();
            await SecureStore.deleteItemAsync('accessToken');
            await SecureStore.deleteItemAsync('refreshToken');
            router.replace('/(auth)/login' as any);
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 bg-[#2e1d15] items-center justify-center">
                <ActivityIndicator color="#8b4513" />
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-[#2e1d15]">
            <View className="px-6 pt-12 pb-4 border-b border-[#5c4033] bg-[#1a110d]/50">
                <Text className="text-3xl font-bold text-[#e6dccf] font-serif">Admin Panel</Text>
                <Text className="text-[#d4c5b0]/60 text-sm mt-1">System oversight and configuration</Text>
            </View>

            <View className="p-6">
                <Card className="p-6 mb-6">
                    <View className="flex-row items-center mb-4">
                        <View className="w-12 h-12 bg-[#8b4513]/20 rounded-full items-center justify-center border border-[#8b4513]/30">
                            <UserIcon size={24} color="#8b4513" />
                        </View>
                        <View className="ml-4">
                            <Text className="text-[#e6dccf] font-bold text-lg">{user?.name || 'Explorer'}</Text>
                            <Text className="text-[#d4c5b0]/60 text-sm">{user?.email}</Text>
                        </View>
                    </View>

                    <View className="flex-row items-center bg-[#8b4513]/10 self-start px-3 py-1 rounded-full border border-[#8b4513]/20">
                        <ShieldCheck size={14} color="#8b4513" />
                        <Text className="text-[#8b4513] font-bold text-[10px] ml-1 uppercase">{user?.role || 'User'}</Text>
                    </View>
                </Card>

                <Text className="text-[#e6dccf] font-bold text-lg mb-4">Quick Actions</Text>

                <TouchableOpacity
                    className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3 flex-row items-center"
                    onPress={() => router.push('/(protected)/admin/users' as any)}
                >
                    <Users size={20} color="#8b4513" />
                    <Text className="text-white font-bold ml-3">Manage Users</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3 flex-row items-center"
                    onPress={() => router.push('/(protected)/admin/apps' as any)}
                >
                    <LayoutGrid size={20} color="#8b4513" />
                    <Text className="text-white font-bold ml-3">Manage Apps</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-[#1a110d] p-4 rounded-xl border border-[#5c4033] mb-3 flex-row items-center"
                    onPress={() => { }}
                >
                    <Settings size={20} color="#8b4513" />
                    <Text className="text-white font-bold ml-3">System Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-[#1a110d] p-4 rounded-xl border border-[#ef4444]/20 mb-3 flex-row items-center"
                    onPress={handleLogout}
                >
                    <LogOut size={20} color="#ef4444" />
                    <Text className="text-[#ef4444] font-bold ml-3">Sign Out</Text>
                </TouchableOpacity>

                <View className="mt-8 p-4 bg-[#8b4513]/5 rounded-xl border border-[#8b4513]/10">
                    <Text className="text-[#d4c5b0]/40 text-xs text-center font-serif">
                        Ultimate App Mobile v1.0.0
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}
