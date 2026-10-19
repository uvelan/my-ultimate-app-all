import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Modal, Alert, RefreshControl, ActivityIndicator } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { api } from '@/src/lib/api-client';

const statuses = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'ARCHIVED'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const fieldStyle = { color: '#fff', backgroundColor: '#27232e', padding: 12, borderRadius: 8, marginBottom: 12 };
const emptyForm = () => ({ title: '', description: '', status: 'TODO', priority: 'MEDIUM', projectId: '', tagIds: [] as string[], frequency: '', startDate: '', dueDate: '' });
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function TasksScreen() {
    const [data, setData] = useState<{ tasks: any[]; projects: any[]; tags: any[] }>({ tasks: [], projects: [], tags: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState('List');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('All');
    const [priority, setPriority] = useState('All');
    const [due, setDue] = useState('All');
    const [project, setProject] = useState('');
    const [tag, setTag] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | undefined>();
    const [form, setForm] = useState(emptyForm());
    const [formOpen, setFormOpen] = useState(false);
    const [metaName, setMetaName] = useState('');
    const [metaColor, setMetaColor] = useState('#8b5cf6');
    const [metaType, setMetaType] = useState<'projects' | 'tags'>('projects');
    const [metaId, setMetaId] = useState<string | undefined>();
    const [calendarMonth, setCalendarMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [calendarDay, setCalendarDay] = useState('');
    const load = async () => {
        setError('');
        try { setData((await api.get('/mobile/tasks')).data); }
        catch (err: any) { setError(err.response?.data?.error || 'Unable to load tasks. Pull down to retry.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);
    const mutate = async (resource: string, value: any = {}, id?: string, method?: string) => {
        setSaving(true);
        try {
            await api.request({ url: '/mobile/tasks', method: method || (id ? 'PATCH' : 'POST'), data: { resource, id, data: value } });
            await load();
            return true;
        } catch (err: any) { Alert.alert('Unable to save', err.response?.data?.error || err.message); return false; }
        finally { setSaving(false); }
    };
    const chip = (label: string, active: boolean, action: () => void) => <TouchableOpacity key={label} disabled={saving} onPress={action} style={{ backgroundColor: active ? '#7c3aed' : '#28232f', borderRadius: 8, padding: 10, marginRight: 7, marginBottom: 7 }}><Text style={{ color: '#fff', fontSize: 12 }}>{label.replace(/_/g, ' ')}</Text></TouchableOpacity>;
    const toggleSelection = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id].slice(0, 200));
    const filtered = useMemo(() => data.tasks.filter(task => {
        const today = dayKey(new Date());
        const dueDay = task.dueDate ? dayKey(new Date(task.dueDate)) : '';
        return `${task.title} ${task.description || ''}`.toLowerCase().includes(search.toLowerCase()) && (status === 'All' || task.status === status) && (priority === 'All' || task.priority === priority) && (!project || task.projectId === project) && (!tag || task.tagIds.includes(tag)) && (due === 'All' || due === 'No date' && !dueDay || due === 'Today' && dueDay === today || due === 'Overdue' && dueDay && dueDay < today && !['DONE', 'ARCHIVED'].includes(task.status));
    }), [data, search, status, priority, due, project, tag]);
    const openForm = (task?: any) => {
        setEditingId(task?.id);
        setForm(task ? { title: task.title, description: task.description || '', status: task.status, priority: task.priority, projectId: task.projectId || '', tagIds: task.tagIds || [], frequency: task.frequency || '', startDate: task.startDate ? dayKey(new Date(task.startDate)) : '', dueDate: task.dueDate ? dayKey(new Date(task.dueDate)) : '' } : emptyForm());
        setFormOpen(true);
    };
    const saveTask = async () => {
        if (!form.title.trim()) return Alert.alert('Title required', 'Enter a task title.');
        for (const value of [form.startDate, form.dueDate]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) return Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
        if (form.startDate && form.dueDate && form.startDate > form.dueDate) return Alert.alert('Invalid dates', 'Start date must precede due date.');
        if (await mutate('tasks', { ...form, title: form.title.trim(), frequency: form.frequency || null, projectId: form.projectId || null, startDate: form.startDate ? new Date(`${form.startDate}T00:00:00`).toISOString() : null, dueDate: form.dueDate ? new Date(`${form.dueDate}T23:59:59`).toISOString() : null }, editingId)) setFormOpen(false);
    };
    const confirmDelete = (resource: string, id: string) => Alert.alert('Delete entry?', resource === 'tasks' ? 'This task will be permanently deleted.' : 'Tasks will remain; this label will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => mutate(resource, {}, id, 'DELETE') }]);
    const card = (task: any) => <View key={task.id} className="bg-background-surface p-4 rounded-xl mb-3">
        <TouchableOpacity onPress={() => openForm(task)} onLongPress={() => toggleSelection(task.id)}><Text className="text-white text-lg font-bold">{selected.includes(task.id) ? '☑ ' : ''}{task.title}</Text><Text className="text-gray-300 mt-1">{task.status.replace(/_/g, ' ')} · {task.priority}{task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString()}` : ''}</Text>{!!task.description && <Text className="text-gray-300 mt-2">{task.description}</Text>}<Text className="text-gray-400 mt-2">{[task.project?.name, ...task.tags.map((item: any) => item.name), task.frequency].filter(Boolean).join(' · ')}</Text></TouchableOpacity>
        <View className="flex-row flex-wrap mt-3">{chip(task.status === 'DONE' ? 'Reopen' : 'Complete', false, () => mutate('tasks', { status: task.status === 'DONE' ? 'TODO' : 'DONE' }, task.id))}{chip('Select', selected.includes(task.id), () => toggleSelection(task.id))}{chip('Delete', false, () => confirmDelete('tasks', task.id))}</View>
    </View>;
    const changeCalendarMonth = (offset: number) => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1)); setCalendarDay(''); };
    return <View className="flex-1 bg-background">
        <View className="pt-12 px-5 pb-4 flex-row items-center justify-between"><View className="flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Tasks</Text></View><TouchableOpacity disabled={saving} onPress={() => openForm()} className="p-3 bg-accent rounded-xl"><Text className="text-white">Add task</Text></TouchableOpacity></View>
        <View className="flex-row px-5">{['List', 'Board', 'Calendar', 'Projects & tags'].map(item => chip(item, item === view, () => setView(item)))}</View>
        <ScrollView contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
            {!!error && <Text className="text-red-400 mb-4">{error}</Text>}
            {loading && !data.tasks.length && <ActivityIndicator color="#8b5cf6" />}
            {view === 'Projects & tags' ? <>
                <View className="flex-row">{(['projects', 'tags'] as const).map(item => chip(item, metaType === item, () => { setMetaType(item); setMetaId(undefined); setMetaName(''); }))}</View>
                {data[metaType].map(item => <View key={item.id} className="bg-background-surface p-3 rounded-xl mb-2"><Text style={{ color: item.color || '#fff' }}>{item.name}</Text><View className="flex-row mt-2">{chip('Edit', metaId === item.id, () => { setMetaId(item.id); setMetaName(item.name); setMetaColor(item.color || '#8b5cf6'); })}{chip('Delete', false, () => confirmDelete(metaType, item.id))}</View></View>)}
                <TextInput accessibilityLabel="Project or tag name" placeholder="Name" placeholderTextColor="#999" style={fieldStyle} value={metaName} onChangeText={setMetaName} />
                <TextInput accessibilityLabel="Project or tag color" placeholder="Color #RRGGBB" placeholderTextColor="#999" style={fieldStyle} value={metaColor} onChangeText={setMetaColor} />
                {chip(metaId ? 'Save changes' : 'Create', false, async () => { if (!metaName.trim() || !/^#[a-f\d]{6}$/i.test(metaColor)) return Alert.alert('Check details', 'Enter a name and hex color.'); if (await mutate(metaType, { name: metaName.trim(), color: metaColor }, metaId)) { setMetaName(''); setMetaId(undefined); } })}
            </> : <>
                <TextInput placeholder="Search tasks" placeholderTextColor="#999" style={fieldStyle} value={search} onChangeText={setSearch} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['All', ...statuses].map(item => chip(item, status === item, () => setStatus(item)))}</ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['All', ...priorities].map(item => chip(item === 'All' ? 'All priorities' : item, priority === item, () => setPriority(item)))}</ScrollView>
                <View className="flex-row">{['All', 'Today', 'Overdue', 'No date'].map(item => chip(item === 'All' ? 'Any due date' : item, due === item, () => setDue(item)))}</View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{chip('All projects', !project, () => setProject(''))}{data.projects.map(item => chip(item.name, project === item.id, () => setProject(item.id)))}</ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>{chip('All tags', !tag, () => setTag(''))}{data.tags.map(item => chip(item.name, tag === item.id, () => setTag(item.id)))}</ScrollView>
                <Text className="text-gray-300 mb-3">{filtered.length} tasks · {selected.length} selected</Text>
                {!!selected.length && <View className="bg-background-surface p-3 mb-4 rounded-xl"><Text className="text-white mb-2">Set selected status</Text><View className="flex-row flex-wrap">{statuses.map(item => chip(item, false, async () => { if (await mutate('bulk', { taskIds: selected, status: item })) setSelected([]); }))}{chip('Clear selection', false, () => setSelected([]))}{chip('Delete selected', false, () => Alert.alert('Delete selected tasks?', 'This cannot be undone.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { if (await mutate('bulk', { taskIds: selected }, undefined, 'DELETE')) setSelected([]); } }]))}</View></View>}
                {view === 'List' && <>{!!filtered.length && chip('Select displayed (up to 200)', false, () => setSelected(filtered.slice(0, 200).map(item => item.id)))}{filtered.map(card)}</>}
                {view === 'Board' && <ScrollView horizontal>{statuses.map(item => <View key={item} style={{ width: 280, marginRight: 12 }}><Text className="text-white font-bold mb-3">{item.replace(/_/g, ' ')} ({filtered.filter(task => task.status === item).length})</Text>{filtered.filter(task => task.status === item).map(card)}</View>)}</ScrollView>}
                {view === 'Calendar' && <>
                    <View className="flex-row justify-between mb-3">{chip('Previous', false, () => changeCalendarMonth(-1))}<Text className="text-white pt-2">{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>{chip('Next', false, () => changeCalendarMonth(1))}</View>
                    <View className="flex-row flex-wrap mb-4">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(item => <Text key={item} style={{ width: '14.28%', color: '#aaa', textAlign: 'center', padding: 8 }}>{item}</Text>)}{Array.from({ length: calendarMonth.getDay() }, (_, i) => <View key={`blank-${i}`} style={{ width: '14.28%' }} />)}{Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }, (_, i) => {
                        const date = dayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i + 1));
                        const count = filtered.filter(task => task.dueDate && dayKey(new Date(task.dueDate)) === date).length;
                        return <TouchableOpacity key={date} onPress={() => setCalendarDay(date === calendarDay ? '' : date)} style={{ width: '14.28%', padding: 10, borderRadius: 6, backgroundColor: calendarDay === date ? '#7c3aed' : '#211d28' }}><Text className="text-white text-center">{i + 1}</Text><Text className="text-gray-300 text-center text-xs">{count || ' '}</Text></TouchableOpacity>;
                    })}</View>
                    {filtered.filter(task => task.dueDate && (calendarDay ? dayKey(new Date(task.dueDate)) === calendarDay : new Date(task.dueDate).getMonth() === calendarMonth.getMonth() && new Date(task.dueDate).getFullYear() === calendarMonth.getFullYear())).map(card)}
                </>}
                {!filtered.length && !loading && <Text className="text-gray-400 py-8 text-center">No matching tasks. Add a task or adjust filters.</Text>}
            </>}
        </ScrollView>
        <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
            <View className="flex-1 bg-background pt-12"><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}><Text className="text-white text-2xl font-bold mb-5">{editingId ? 'Edit task' : 'New task'}</Text>
                <TextInput placeholder="Title" placeholderTextColor="#999" maxLength={100} style={fieldStyle} value={form.title} onChangeText={value => setForm({ ...form, title: value })} />
                <TextInput placeholder="Description" placeholderTextColor="#999" multiline maxLength={1000} style={fieldStyle} value={form.description} onChangeText={value => setForm({ ...form, description: value })} />
                <Text className="text-gray-300 mb-2">Status</Text><View className="flex-row flex-wrap">{statuses.map(item => chip(item, form.status === item, () => setForm({ ...form, status: item })))}</View>
                <Text className="text-gray-300 mb-2">Priority</Text><View className="flex-row flex-wrap">{priorities.map(item => chip(item, form.priority === item, () => setForm({ ...form, priority: item })))}</View>
                <Text className="text-gray-300 mb-2">Project</Text><View className="flex-row flex-wrap">{chip('None', !form.projectId, () => setForm({ ...form, projectId: '' }))}{data.projects.map(item => chip(item.name, form.projectId === item.id, () => setForm({ ...form, projectId: item.id })))}</View>
                <Text className="text-gray-300 mb-2">Tags</Text><View className="flex-row flex-wrap">{data.tags.map(item => chip(item.name, form.tagIds.includes(item.id), () => setForm({ ...form, tagIds: form.tagIds.includes(item.id) ? form.tagIds.filter(id => id !== item.id) : [...form.tagIds, item.id] })))}</View>
                <Text className="text-gray-300 mb-2">Repeat when completed</Text><View className="flex-row flex-wrap">{['', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map(item => chip(item || 'Never', form.frequency === item, () => setForm({ ...form, frequency: item })))}</View>
                <TextInput placeholder="Start date YYYY-MM-DD (optional)" placeholderTextColor="#999" style={fieldStyle} value={form.startDate} onChangeText={value => setForm({ ...form, startDate: value })} />
                <TextInput placeholder="Due date YYYY-MM-DD (optional)" placeholderTextColor="#999" style={fieldStyle} value={form.dueDate} onChangeText={value => setForm({ ...form, dueDate: value })} />
                <TouchableOpacity disabled={saving} onPress={saveTask} className="bg-accent p-4 rounded-xl"><Text className="text-white text-center font-bold">{saving ? 'Saving…' : 'Save task'}</Text></TouchableOpacity>
                <TouchableOpacity disabled={saving} onPress={() => setFormOpen(false)} className="p-4"><Text className="text-white text-center">Cancel</Text></TouchableOpacity>
            </ScrollView></View>
        </Modal>
    </View>;
}
