import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, RefreshControl, Alert } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { api } from '@/src/lib/api-client';

const inputStyle = { color: '#fff', backgroundColor: '#27232e', borderRadius: 8, padding: 12, marginBottom: 12 };
export default function SettingsScreen() {
    const [profile, setProfile] = useState<any>();
    const [models, setModels] = useState<any[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<string | undefined>();
    const [modelId, setModelId] = useState('');
    const [name, setName] = useState('');
    const [active, setActive] = useState(true);
    const load = async () => {
        setError('');
        try {
            const [user, settings] = await Promise.all([api.get('/auth/profile'), api.get('/mobile/settings')]);
            setProfile(user.data); setModels(settings.data.models); setCanManage(settings.data.canManageModels);
        } catch (err: any) { setError(err.response?.data?.error || 'Unable to load settings. Pull down to retry.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const reset = () => { setEditing(undefined); setModelId(''); setName(''); setActive(true); };
    const save = async () => {
        if (!modelId.trim() || !name.trim()) return Alert.alert('Details required', 'Enter the model ID and display name.');
        setSaving(true);
        try {
            await api.request({ url: '/mobile/settings', method: editing ? 'PATCH' : 'POST', data: { id: editing, data: { modelId, name, isActive: active } } });
            reset(); await load();
        } catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    };
    const remove = (id: string) => Alert.alert('Delete model?', 'This removes it from the global model catalog.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
        setSaving(true);
        try { await api.delete('/mobile/settings', { data: { id } }); await load(); if (editing === id) reset(); }
        catch (err: any) { Alert.alert('Unable to delete', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    } }]);
    return <View className="flex-1 bg-background"><View className="pt-12 px-5 pb-4 flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Settings</Text></View>
        <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
            {!!error && <Text className="text-red-400 mb-5">{error}</Text>}
            <View className="bg-background-surface rounded-xl p-4 mb-5"><Text className="text-white text-xl font-bold">{profile?.name || 'Your account'}</Text><Text className="text-gray-300 mt-2">{profile?.email}</Text><Text className="text-gray-300 mt-2">Role: {profile?.role || '—'}</Text></View>
            <Text className="text-white text-xl font-bold mb-3">AI models</Text><Text className="text-gray-400 mb-4">{canManage ? 'Changes apply globally to AI model choices.' : 'Active models available for AI features. Administrators manage the catalog.'}</Text>
            {models.map(model => <View key={model.id} className="bg-background-surface p-4 rounded-xl mb-3"><Text className="text-white font-bold">{model.name}</Text><Text className="text-gray-300 mt-2">{model.modelId} · {model.isActive ? 'Active' : 'Disabled'}</Text>{canManage && <View className="flex-row mt-3"><TouchableOpacity disabled={saving} onPress={() => { setEditing(model.id); setModelId(model.modelId); setName(model.name); setActive(model.isActive); }} className="p-3 bg-accent rounded-lg mr-3"><Text className="text-white">Edit</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={() => remove(model.id)} className="p-3 bg-red-900 rounded-lg"><Text className="text-white">Delete</Text></TouchableOpacity></View>}</View>)}
            {canManage && <View className="mt-5"><Text className="text-white text-xl mb-4">{editing ? 'Edit model' : 'Add model'}</Text><TextInput placeholder="Model ID" placeholderTextColor="#999" autoCapitalize="none" style={inputStyle} value={modelId} onChangeText={setModelId} /><TextInput placeholder="Display name" placeholderTextColor="#999" style={inputStyle} value={name} onChangeText={setName} />{editing && <View className="flex-row items-center justify-between mb-3"><Text className="text-white">Active</Text><Switch value={active} onValueChange={setActive} /></View>}<TouchableOpacity disabled={saving} onPress={save} className="bg-accent p-4 rounded-xl"><Text className="text-white text-center">{saving ? 'Saving…' : 'Save model'}</Text></TouchableOpacity>{editing && <TouchableOpacity disabled={saving} onPress={reset} className="p-4"><Text className="text-white text-center">Cancel editing</Text></TouchableOpacity>}</View>}
        </ScrollView>
    </View>;
}
