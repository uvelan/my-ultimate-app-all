import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, Switch } from 'react-native';
import { ChevronLeft, Trash2, LayoutGrid, Plus, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { adminService } from '@/src/services/features.service';
import { Card } from '@/src/components/ui/Card';

export default function AdminAppsScreen() {
    const router = useRouter();
    const [apps, setApps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [imageLink, setImageLink] = useState('');
    const [appLink, setAppLink] = useState('');
    const [isNative, setIsNative] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fetchApps = async () => {
        try {
            const res = await adminService.getApps();
            setApps(res);
        } catch (error) {
            console.error('Failed to fetch apps', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchApps(); }, []);

    const handleDelete = (id: string) => {
        Alert.alert('Verify Deletion', 'Delete this embedded app permanently?', [
            { text: 'Cancel', style: 'cancel' },
            { 
               text: 'Delete', 
               style: 'destructive',
               onPress: async () => {
                   try {
                       await adminService.deleteApp(id);
                       setApps(apps.filter(a => a.id !== id));
                   } catch (error) {
                       Alert.alert('Error', 'Failed to delete app');
                   }
               }
            }
        ]);
    };

    const handleAddApp = async () => {
        if (!name || !description || !imageLink || !appLink) return;
        setSubmitting(true);
        try {
            await adminService.addApp({ name, description, imageLink, appLink, isNative });
            setIsAddModalOpen(false);
            setName('');
            setDescription('');
            setImageLink('');
            setAppLink('');
            setIsNative(false);
            fetchApps();
        } catch (error) {
            Alert.alert('Error', 'Failed to add app');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View className="flex-1 bg-[#2e1d15] pt-12">
            <View className="px-6 py-4 flex-row justify-between items-center border-b border-[#5c4033] bg-[#1a110d]/50">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#e6dccf" />
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-[#e6dccf] font-serif">Manage Apps</Text>
                </View>
                <TouchableOpacity onPress={() => setIsAddModalOpen(true)} className="bg-[#8b4513] p-2 rounded-full shadow-lg">
                    <Plus size={20} color="#e6dccf" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color="#8b4513" className="mt-10" />
            ) : (
                <FlatList
                    data={apps}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 20 }}
                    ListEmptyComponent={
                        <View className="mt-10 items-center">
                            <Text className="text-[#d4c5b0]/40 italic text-center">No apps deployed yet</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <Card className="p-4 mb-4 flex-row items-center border border-[#5c4033] bg-[#1a110d]">
                            <View className="w-12 h-12 bg-[#8b4513]/20 rounded-xl items-center justify-center mr-4 border border-[#8b4513]/30">
                                <LayoutGrid size={24} color="#e6dccf" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[#e6dccf] font-bold text-lg">{item.name}</Text>
                                <Text className="text-[#d4c5b0]/60 text-xs mt-1" numberOfLines={2}>{item.description}</Text>
                                <View className="flex-row items-center mt-2">
                                    <Text className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.isNative ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                        {item.isNative ? 'NATIVE' : 'WEB APP'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-3 bg-[#ef4444]/10 rounded-xl ml-2 border border-[#ef4444]/20">
                                <Trash2 size={20} color="#ef4444" />
                            </TouchableOpacity>
                        </Card>
                    )}
                />
            )}

            {/* Add App Modal */}
            <Modal visible={isAddModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#2e1d15] rounded-t-3xl p-6 min-h-[70%] border-t border-[#5c4033]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-bold text-[#e6dccf] font-serif">Add Embedded App</Text>
                            <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                                <X size={24} color="#d4c5b0" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#d4c5b0] font-bold mb-2">App Name</Text>
                        <TextInput 
                            value={name}
                            onChangeText={setName}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-4 font-bold text-base"
                            placeholderTextColor="#6f4e37"
                            placeholder="e.g., Chess Tracker"
                        />

                        <Text className="text-[#d4c5b0] font-bold mb-2">Description</Text>
                        <TextInput 
                            value={description}
                            onChangeText={setDescription}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-4"
                            placeholderTextColor="#6f4e37"
                            placeholder="Short app description"
                        />

                        <Text className="text-[#d4c5b0] font-bold mb-2">Icon / Image URL</Text>
                        <TextInput 
                            value={imageLink}
                            onChangeText={setImageLink}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-4"
                            placeholderTextColor="#6f4e37"
                            placeholder="https://example.com/icon.png"
                        />

                        <Text className="text-[#d4c5b0] font-bold mb-2">App URL Route</Text>
                        <TextInput 
                            value={appLink}
                            onChangeText={setAppLink}
                            className="bg-[#1a110d] text-white p-4 rounded-xl border border-[#5c4033] mb-6"
                            placeholderTextColor="#6f4e37"
                            placeholder="e.g., /games/chess"
                            autoCapitalize="none"
                        />

                        <View className="flex-row items-center justify-between mb-8 bg-[#1a110d] p-4 rounded-xl border border-[#5c4033]">
                            <View>
                                <Text className="text-[#d4c5b0] font-bold">Native App View</Text>
                                <Text className="text-[#d4c5b0]/60 text-xs mt-1">Is this a native screen or embedded webview?</Text>
                            </View>
                            <Switch 
                                value={isNative}
                                onValueChange={setIsNative}
                                trackColor={{ false: "#2e1d15", true: "#8b4513" }}
                                thumbColor="#e6dccf"
                            />
                        </View>

                        <TouchableOpacity 
                            onPress={handleAddApp}
                            disabled={submitting}
                            className={`p-4 rounded-xl items-center flex-row justify-center ${submitting ? 'bg-[#5c4033]' : 'bg-[#8b4513]'}`}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#e6dccf" className="mr-2" />
                            ) : null}
                            <Text className="text-[#e6dccf] font-bold text-lg">Deploy App</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
