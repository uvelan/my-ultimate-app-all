import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { api } from '@/src/lib/api-client';

export default function DataSyncScreen() {
    const [allowed, setAllowed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
    const [mode, setMode] = useState<'UPDATE' | 'REPLACE'>('UPDATE');
    const [result, setResult] = useState('');
    useEffect(() => {
        api.get('/auth/profile').then(res => setAllowed(res.data.role === 'SUPERUSER')).catch(() => setError('Unable to verify your access.')).finally(() => setLoading(false));
    }, []);
    const exportData = async () => {
        setBusy(true); setError(''); setResult('');
        try {
            if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
            const response = await api.get('/admin/data-sync/export', { responseType: 'text', transformResponse: value => value });
            const uri = `${FileSystem.cacheDirectory}ultimate-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
            await FileSystem.writeAsStringAsync(uri, response.data);
            await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save database backup' });
            setResult('Backup created. Use the share sheet to save it securely. Audio caches are excluded.');
        } catch (err: any) { setError(err.response?.data?.error || err.message || 'Export failed.'); }
        finally { setBusy(false); }
    };
    const chooseFile = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
            if (!result.canceled) {
                const file = result.assets[0];
                if (file.size && file.size > 50 * 1024 * 1024) return Alert.alert('File too large', 'Choose a JSON backup smaller than 50 MB.');
                setSelectedFile(file); setResult(''); setError('');
            }
        } catch { setError('Unable to choose a file.'); }
    };
    const importData = async () => {
        if (!selectedFile) return;
        setBusy(true); setError(''); setResult('');
        try {
            const content = await FileSystem.readAsStringAsync(selectedFile.uri);
            const parsed = JSON.parse(content);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || !Object.values(parsed).every(Array.isArray)) throw new Error('Choose a valid application JSON backup.');
            const form = new FormData();
            form.append('file', { uri: selectedFile.uri, name: selectedFile.name || 'backup.json', type: 'application/json' } as any);
            form.append('mode', mode);
            const response = await api.post('/admin/data-sync/import', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
            setResult(response.data.message || 'Import completed.'); setSelectedFile(null);
        } catch (err: any) { setError(err.response?.data?.error || err.message || 'Import failed.'); }
        finally { setBusy(false); }
    };
    const confirmImport = () => {
        if (!selectedFile) return Alert.alert('Choose a file', 'Select an application JSON backup first.');
        Alert.alert(mode === 'REPLACE' ? 'Replace the entire database?' : 'Update database from backup?', mode === 'REPLACE' ? `REPLACE deletes existing data before importing ${selectedFile.name}. This affects all users and cannot be undone.` : `UPDATE merges records from ${selectedFile.name}. Existing records with matching IDs will be overwritten.`, [{ text: 'Cancel', style: 'cancel' }, { text: mode === 'REPLACE' ? 'Delete existing data and import' : 'Import updates', style: mode === 'REPLACE' ? 'destructive' : 'default', onPress: importData }]);
    };
    return <View className="flex-1 bg-background"><View className="pt-12 px-5 pb-4 flex-row items-center"><SidebarToggle /><Text className="text-white text-2xl font-bold ml-3">Data sync</Text></View><ScrollView contentContainerStyle={{ padding: 20 }}>
        {loading ? <ActivityIndicator color="#8b5cf6" /> : !allowed ? <Text className="text-white">Superuser access is required to export or import the database.</Text> : <>
            <Text className="text-white text-xl font-bold mb-3">Database backup</Text><Text className="text-gray-300 mb-4">Exports include application data across all users. Keep the file private. Generated audio and audio cache tables are excluded.</Text>
            <TouchableOpacity disabled={busy} onPress={exportData} className="bg-accent p-4 rounded-xl mb-8"><Text className="text-white text-center font-bold">Export and save JSON backup</Text></TouchableOpacity>
            <Text className="text-white text-xl font-bold mb-3">Restore from file</Text><TouchableOpacity disabled={busy} onPress={chooseFile} className="bg-background-surface p-4 rounded-xl mb-4"><Text className="text-white">{selectedFile ? selectedFile.name : 'Choose JSON backup'}</Text></TouchableOpacity>
            <View className="flex-row mb-4">{(['UPDATE', 'REPLACE'] as const).map(item => <TouchableOpacity disabled={busy} key={item} onPress={() => setMode(item)} className={`p-3 rounded-lg mr-3 ${mode === item ? 'bg-accent' : 'bg-background-surface'}`}><Text className="text-white">{item}</Text></TouchableOpacity>)}</View>
            <Text className="text-gray-300 mb-4">{mode === 'UPDATE' ? 'Merge backup records by ID. Records missing from the backup remain.' : 'Delete existing database content and restore the selected backup. Export a backup before proceeding.'}</Text>
            <TouchableOpacity disabled={busy || !selectedFile} onPress={confirmImport} className={`p-4 rounded-xl ${mode === 'REPLACE' ? 'bg-red-900' : 'bg-accent'}`}><Text className="text-white text-center font-bold">{busy ? 'Working…' : `Review ${mode} import`}</Text></TouchableOpacity>
        </>}
        {!!error && <Text className="text-red-400 mt-5">{error}</Text>}{!!result && <Text className="text-green-400 mt-5">{result}</Text>}
    </ScrollView></View>;
}
