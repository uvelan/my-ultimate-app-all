import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { ChevronLeft, Trash2, ShieldCheck, User as UserIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { api } from '@/src/lib/api-client';
import { Card } from '@/src/components/ui/Card';

export default function AdminUsersScreen() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/admin/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Failed to fetch users', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleDelete = (id: string) => {
        Alert.alert('Verify Deletion', 'Delete this user permanently?', [
            { text: 'Cancel', style: 'cancel' },
            { 
               text: 'Delete', 
               style: 'destructive',
               onPress: async () => {
                   try {
                       await api.delete(`/admin/users/${id}`);
                       setUsers(users.filter(u => u.id !== id));
                   } catch (error) {
                       Alert.alert('Error', 'Failed to delete user');
                   }
               }
            }
        ]);
    };

    return (
        <View className="flex-1 bg-[#2e1d15] pt-12">
            <View className="px-6 py-4 flex-row items-center border-b border-[#5c4033] bg-[#1a110d]/50 gap-4">
                <TouchableOpacity onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#e6dccf" />
                </TouchableOpacity>
                <Text className="text-2xl font-bold text-[#e6dccf] font-serif">System Users</Text>
            </View>

            {loading ? (
                <ActivityIndicator color="#8b4513" className="mt-10" />
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20 }}
                    renderItem={({ item }) => (
                        <Card className="p-4 mb-4 flex-row items-center border border-[#5c4033]">
                            <View className="w-10 h-10 bg-[#8b4513]/20 rounded-full items-center justify-center mr-4">
                                {item.role === 'SUPERADMIN' ? <ShieldCheck size={20} color="#eab308" /> : <UserIcon size={20} color="#8b4513" />}
                            </View>
                            <View className="flex-1">
                                <Text className="text-[#e6dccf] font-bold">{item.name}</Text>
                                <Text className="text-[#d4c5b0]/60 text-xs">{item.email}</Text>
                                <Text className={`text-[10px] font-bold mt-1 ${item.role === 'USER' ? 'text-[#8b4513]' : 'text-[#eab308]'}`}>
                                    {item.role}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-2 bg-red-500/10 rounded-lg">
                                <Trash2 size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </Card>
                    )}
                />
            )}
        </View>
    );
}
