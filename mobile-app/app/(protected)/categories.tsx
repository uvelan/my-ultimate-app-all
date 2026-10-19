import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, Alert, RefreshControl } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { financeService } from '@/src/services/finance.service';

const fieldStyle = { color: '#fff', backgroundColor: '#27232e', borderRadius: 8, padding: 12, marginBottom: 12 };
export default function CategoriesScreen() {
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [showArchived, setShowArchived] = useState(false);
    const [editing, setEditing] = useState<string | undefined>();
    const [name, setName] = useState('');
    const [color, setColor] = useState('#8b5cf6');
    const [formType, setFormType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [parentId, setParentId] = useState('');
    const load = async () => {
        setError('');
        try { setCategories(await financeService.categories(true)); }
        catch (err: any) { setError(err.response?.data?.error || 'Unable to load categories. Pull down to retry.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const reset = () => { setEditing(undefined); setName(''); setColor('#8b5cf6'); setParentId(''); };
    const save = async () => {
        if (!name.trim() || !/^#[a-f\d]{6}$/i.test(color)) return Alert.alert('Check details', 'Enter a name and a color in #RRGGBB format.');
        setSaving(true);
        try { await financeService.save('categories', { name: name.trim(), color, type: formType, parentId: parentId || null }, editing); reset(); await load(); }
        catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    };
    const archive = (item: any) => Alert.alert(item.isArchived ? 'Restore category?' : 'Archive category?', item.isArchived ? 'This category will be available for new transactions.' : 'Existing transactions remain. The category will be hidden from new entries.', [{ text: 'Cancel' }, { text: item.isArchived ? 'Restore' : 'Archive', onPress: async () => {
        setSaving(true);
        try { await financeService.save('categories', { isArchived: !item.isArchived }, item.id); await load(); }
        catch (err: any) { Alert.alert('Unable to update', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    } }]);
    const chip = (label: string, active: boolean, onPress: () => void, key = label) => <TouchableOpacity key={key} disabled={saving} onPress={onPress} style={{ padding: 10, marginRight: 8, marginBottom: 8, borderRadius: 8, backgroundColor: active ? '#7c3aed' : '#28232f' }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>;
    const shown = categories.filter(item => item.type === type && (showArchived || !item.isArchived)).sort((a, b) => {
        const key = (item: any) => `${categories.find(parent => parent.id === item.parentId)?.name || item.name}\0${item.parentId ? '1' : '0'}${item.name}`;
        return key(a).localeCompare(key(b));
    });
    return <View className="flex-1 bg-background"><View className="pt-12 px-5 pb-4 flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Finance categories</Text></View><ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {!!error && <Text className="text-red-400 mb-4">{error}</Text>}
        <View className="flex-row">{(['EXPENSE', 'INCOME'] as const).map(item => chip(item, type === item, () => { setType(item); if (!editing) { setFormType(item); setParentId(''); } }))}</View>
        <View className="flex-row justify-between items-center mb-4"><Text className="text-white">Include archived</Text><Switch value={showArchived} onValueChange={setShowArchived} /></View>
        {shown.map(item => <View key={item.id} style={{ marginLeft: item.parentId ? 16 : 0, borderLeftWidth: 3, borderLeftColor: item.color, backgroundColor: '#211e27', padding: 14, borderRadius: 10, marginBottom: 12 }}><Text className="text-white font-bold">{item.name}{item.isArchived ? ' · Archived' : ''}</Text>{item.parentId && <Text className="text-gray-400 mt-1">Under {categories.find(parent => parent.id === item.parentId)?.name || 'parent category'}</Text>}<View className="flex-row mt-3">{chip('Edit', editing === item.id, () => { setEditing(item.id); setName(item.name); setColor(item.color); setFormType(item.type); setParentId(item.parentId || ''); })}{chip(item.isArchived ? 'Restore' : 'Archive', false, () => archive(item))}</View></View>)}
        {!shown.length && !loading && <Text className="text-gray-400 py-4">No categories in this view.</Text>}
        <Text className="text-white text-xl font-bold mt-5 mb-4">{editing ? 'Edit category' : 'Add category'}</Text>
        <TextInput placeholder="Name" placeholderTextColor="#999" maxLength={100} style={fieldStyle} value={name} onChangeText={setName} />
        <TextInput placeholder="Color #RRGGBB" placeholderTextColor="#999" autoCapitalize="none" style={fieldStyle} value={color} onChangeText={setColor} />
        <View className="flex-row">{(['EXPENSE', 'INCOME'] as const).map(item => chip(item, formType === item, () => { setFormType(item); setParentId(''); }))}</View>
        <Text className="text-gray-300 mb-2">Parent category</Text><View className="flex-row flex-wrap">{chip('None', !parentId, () => setParentId(''))}{categories.filter(item => item.type === formType && !item.parentId && !item.isArchived && item.id !== editing).map(item => chip(item.name, parentId === item.id, () => setParentId(item.id), item.id))}</View>
        <TouchableOpacity disabled={saving} onPress={save} className="p-4 bg-accent rounded-xl mt-2"><Text className="text-white text-center">{saving ? 'Saving…' : 'Save category'}</Text></TouchableOpacity>{editing && <TouchableOpacity disabled={saving} onPress={reset} className="p-4"><Text className="text-white text-center">Cancel editing</Text></TouchableOpacity>}
    </ScrollView></View>;
}
