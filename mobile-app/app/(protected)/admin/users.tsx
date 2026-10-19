import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, Modal, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/src/lib/api-client';

const fieldStyle = { color: '#fff', backgroundColor: '#27232e', padding: 12, borderRadius: 8, marginBottom: 12 };
const emptyForm = () => ({ name: '', email: '', password: '', role: 'USER', isActive: true });
export default function AdminUsersScreen() {
    const router = useRouter();
    const [users, setUsers] = useState<any[]>([]);
    const [profile, setProfile] = useState<any>();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<string | undefined>();
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const load = async () => {
        setError('');
        try {
            const [list, user] = await Promise.all([api.get('/admin/users'), api.get('/auth/profile')]);
            setUsers(list.data); setProfile(user.data);
        } catch (err: any) { setError(err.response?.data?.error || 'Unable to load users.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const openForm = (user?: any) => {
        setEditing(user?.id); setForm(user ? { name: user.name, email: user.email, role: user.role, isActive: user.isActive, password: '' } : emptyForm()); setFormOpen(true);
    };
    const save = async () => {
        setSaving(true);
        try {
            const data: any = { role: form.role, isActive: form.isActive };
            if (!editing || profile?.role === 'SUPERUSER') { data.name = form.name; data.email = form.email; if (form.password || !editing) data.password = form.password; }
            await api.request({ url: editing ? `/admin/users/${editing}` : '/admin/users/create', method: editing ? 'PATCH' : 'POST', data });
            setFormOpen(false); await load();
        } catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    };
    const remove = (id: string) => Alert.alert('Delete user permanently?', 'This also removes related user data.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
        setSaving(true);
        try { await api.delete(`/admin/users/${id}`); await load(); }
        catch (err: any) { Alert.alert('Unable to delete', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    } }]);
    return <View className="flex-1 bg-background pt-12">
        <View className="flex-row justify-between items-center px-5 pb-4"><TouchableOpacity onPress={() => router.back()}><Text className="text-white">Back</Text></TouchableOpacity><Text className="text-white text-2xl font-bold">Users</Text>{['ADMIN', 'SUPERUSER'].includes(profile?.role) && <TouchableOpacity disabled={saving} onPress={() => openForm()}><Text className="text-purple-400">Create</Text></TouchableOpacity>}</View>
        <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
            {!!error && <Text className="text-red-400 mb-5">{error}</Text>}<TextInput placeholder="Search name or email" placeholderTextColor="#999" style={fieldStyle} value={search} onChangeText={setSearch} />
            {users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())).map(user => <View key={user.id} className="bg-background-surface p-4 rounded-xl mb-3"><Text className="text-white text-lg font-bold">{user.name}</Text><Text className="text-gray-300 mt-1">{user.email}</Text><Text className="text-gray-300 mt-1">{user.role} · {user.isActive ? 'Active' : 'Disabled'}</Text><View className="flex-row mt-3"><TouchableOpacity disabled={saving} onPress={() => openForm(user)} className="p-3 bg-accent rounded-lg mr-3"><Text className="text-white">Edit</Text></TouchableOpacity>{profile?.role === 'SUPERUSER' && <TouchableOpacity disabled={saving} onPress={() => remove(user.id)} className="p-3 bg-red-900 rounded-lg"><Text className="text-white">Delete</Text></TouchableOpacity>}</View></View>)}
        </ScrollView>
        <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}><View className="flex-1 bg-background pt-12"><ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled"><Text className="text-white text-2xl font-bold mb-5">{editing ? 'Edit user' : 'Create user'}</Text>
            {(!editing || profile?.role === 'SUPERUSER') && <><TextInput placeholder="Name" placeholderTextColor="#999" style={fieldStyle} value={form.name} onChangeText={name => setForm({ ...form, name })} /><TextInput placeholder="Email" placeholderTextColor="#999" autoCapitalize="none" keyboardType="email-address" style={fieldStyle} value={form.email} onChangeText={email => setForm({ ...form, email })} /><TextInput placeholder={editing ? 'New password (leave blank to keep)' : 'Password (at least 6 characters)'} placeholderTextColor="#999" secureTextEntry style={fieldStyle} value={form.password} onChangeText={password => setForm({ ...form, password })} /></>}
            <Text className="text-white mb-3">Role</Text><View className="flex-row mb-5">{(profile?.role === 'SUPERUSER' ? ['USER', 'ADMIN', 'SUPERUSER'] : ['USER', 'ADMIN']).map(role => <TouchableOpacity disabled={saving} key={role} onPress={() => setForm({ ...form, role })} className={`p-3 rounded-lg mr-2 ${form.role === role ? 'bg-accent' : 'bg-background-surface'}`}><Text className="text-white">{role}</Text></TouchableOpacity>)}</View>
            <View className="flex-row justify-between items-center mb-5"><Text className="text-white">Active</Text><Switch value={form.isActive} onValueChange={isActive => setForm({ ...form, isActive })} /></View><TouchableOpacity disabled={saving} onPress={save} className="p-4 bg-accent rounded-xl"><Text className="text-white text-center">{saving ? 'Saving…' : 'Save user'}</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={() => setFormOpen(false)} className="p-4"><Text className="text-white text-center">Cancel</Text></TouchableOpacity>
        </ScrollView></View></Modal>
    </View>;
}
