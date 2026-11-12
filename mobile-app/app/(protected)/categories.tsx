import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, Alert, Modal, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { financeService } from '@/src/services/finance.service';

const fieldStyle = { color: '#fff', backgroundColor: '#27232e', borderRadius: 8, padding: 12, marginBottom: 12 };
export default function CategoriesScreen() {
    const router = useRouter();
    const { add } = useLocalSearchParams<{ add?: string }>();
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
    const [showArchived, setShowArchived] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
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
    const openForm = useCallback((item?: (typeof categories)[number]) => {
        setEditing(item?.id);
        setName(item?.name ?? '');
        setColor(item?.color ?? '#8b5cf6');
        setFormType(item?.type ?? type);
        setParentId(item?.parentId ?? '');
        setFormOpen(true);
    }, [type]);
    useEffect(() => {
        if (add === '1') {
            openForm();
            router.setParams({ add: '' });
        }
    }, [add, openForm, router]);
    const save = async () => {
        if (!name.trim() || !/^#[a-f\d]{6}$/i.test(color)) return Alert.alert('Check details', 'Enter a name and a color in #RRGGBB format.');
        setSaving(true);
        try { await financeService.save('categories', { name: name.trim(), color, type: formType, parentId: parentId || null }, editing); setFormOpen(false); await load(); }
        catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    };
    const archive = (item: any) => Alert.alert(item.isArchived ? 'Restore category?' : 'Archive category?', item.isArchived ? 'This category will be available for new transactions.' : 'Existing transactions remain. The category will be hidden from new entries.', [{ text: 'Cancel' }, { text: item.isArchived ? 'Restore' : 'Archive', onPress: async () => {
        setSaving(true);
        try { await financeService.save('categories', { isArchived: !item.isArchived }, item.id); await load(); }
        catch (err: any) { Alert.alert('Unable to update', err.response?.data?.error || err.message); }
        finally { setSaving(false); }
    } }]);
    const chip = (label: string, active: boolean, onPress: () => void, key = label) => <TouchableOpacity key={key} disabled={saving} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ padding: 10, marginRight: 8, marginBottom: 8, borderRadius: 8, backgroundColor: active ? '#7c3aed' : '#28232f' }}><Text style={{ color: '#fff' }}>{label}</Text></TouchableOpacity>;
    const eligibleParents = categories.filter(item =>
        item.type === formType && !item.parentId && item.id !== editing && (!item.isArchived || item.id === parentId));
    const shown = categories.filter(item => item.type === type && (showArchived || !item.isArchived)).sort((a, b) => {
        const key = (item: any) => `${categories.find(parent => parent.id === item.parentId)?.name || item.name}\0${item.parentId ? '1' : '0'}${item.name}`;
        return key(a).localeCompare(key(b));
    });
    return <View className="flex-1 bg-background"><View className="pt-12 px-5 pb-4 flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Finance categories</Text></View>
    <View className="flex-row px-5">{chip('Add category', true, () => openForm())}</View>
    <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {!!error && <Text className="text-red-400 mb-4">{error}</Text>}
        <View className="flex-row">{(['EXPENSE', 'INCOME'] as const).map(item => chip(item, type === item, () => setType(item)))}</View>
        <View className="flex-row justify-between items-center mb-4"><Text className="text-white">Include archived</Text><Switch value={showArchived} onValueChange={setShowArchived} /></View>
        {shown.map(item => <View key={item.id} style={{ marginLeft: item.parentId ? 16 : 0, borderLeftWidth: 3, borderLeftColor: item.color, backgroundColor: '#211e27', padding: 14, borderRadius: 10, marginBottom: 12 }}><Text className="text-white font-bold">{item.name}{item.isArchived ? ' · Archived' : ''}</Text>{item.parentId && <Text className="text-gray-400 mt-1">Under {categories.find(parent => parent.id === item.parentId)?.name || 'parent category'}</Text>}<View className="flex-row mt-3">{chip('Edit', editing === item.id, () => openForm(item))}{chip(item.isArchived ? 'Restore' : 'Archive', false, () => archive(item))}</View></View>)}
        {!shown.length && !loading && <Text className="text-gray-400 py-4">No categories in this view.</Text>}
    </ScrollView>
    <Modal visible={formOpen} animationType="slide" onRequestClose={() => { if (!saving) setFormOpen(false); }}>
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, paddingTop: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="text-white text-xl font-bold mb-4">{editing ? 'Edit category' : 'Add category'}</Text>
        <TextInput placeholder="Name" placeholderTextColor="#999" maxLength={100} style={fieldStyle} value={name} onChangeText={setName} />
        <TextInput placeholder="Color #RRGGBB" placeholderTextColor="#999" autoCapitalize="none" style={fieldStyle} value={color} onChangeText={setColor} />
        <View className="flex-row">{(['EXPENSE', 'INCOME'] as const).map(item => chip(item, formType === item, () => { if (item !== formType) { setFormType(item); setParentId(''); } }))}</View>
        <Text className="text-gray-300 mb-2">Parent category (optional)</Text>
        <View className="flex-row flex-wrap">
            {chip('None (top-level)', !parentId, () => setParentId(''))}
            {eligibleParents.map(item => chip(item.isArchived ? item.name + ' (archived)' : item.name, parentId === item.id, () => setParentId(item.id), item.id))}
        </View>
        {!eligibleParents.length && <Text className="text-gray-400 mb-3">
            {loading ? 'Loading categories…' : 'To choose a parent, first add an active top-level category of this type.'}
        </Text>}
        <TouchableOpacity disabled={saving} onPress={save} className="p-4 bg-accent rounded-xl mt-2"><Text className="text-white text-center">{saving ? 'Saving…' : 'Save category'}</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={() => setFormOpen(false)} className="p-4"><Text className="text-white text-center">Cancel</Text></TouchableOpacity>
      </ScrollView>
    </Modal></View>;
}
