'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Section } from '@/components/layout/Primitives';
import { Settings, Cpu, Edit2, Trash2, Check, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAiModels, addAiModel, updateAiModel, deleteAiModel } from '@/actions/ai';

export default function GlobalSettingsPage() {
    const [aiModels, setAiModels] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Model form state
    const [editingModel, setEditingModel] = useState<any>(null);
    const [modelForm, setModelForm] = useState({ modelId: '', name: '', isActive: true });

    const fetchModels = async () => {
        setLoading(true);
        try {
            const mData = await getAiModels();
            setAiModels(mData);
        } catch (error) {
            console.error('Failed to load AI models', error);
            toast.error('Failed to load AI models');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    const handleModelSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modelForm.modelId.trim() || !modelForm.name.trim()) {
            return toast.error('Fields are required');
        }
        
        if (editingModel) {
            const res = await updateAiModel(editingModel.id, modelForm);
            if (res.success) {
                toast.success('Model updated');
                setEditingModel(null);
                setModelForm({ modelId: '', name: '', isActive: true });
                fetchModels();
            } else {
                toast.error(res.error || 'Update failed');
            }
        } else {
            const res = await addAiModel(modelForm.modelId, modelForm.name);
            if (res.success) {
                toast.success('Model added');
                setModelForm({ modelId: '', name: '', isActive: true });
                fetchModels();
            } else {
                toast.error(res.error || 'Failed to add model');
            }
        }
    };

    const handleModelDelete = async (id: string) => {
        if (confirm('Delete this AI model?')) {
            const res = await deleteAiModel(id);
            if (res.success) {
                toast.success('Deleted');
                fetchModels();
            } else {
                toast.error(res.error || 'Failed to delete');
            }
        }
    };

    return (
        <ProtectedRoute>
            <DashboardLayout>
                <Section title="Global Settings" description="Manage application preferences and AI configurations globally.">
                    <div className="bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl p-6 mt-6">
                        <div className="mb-6 flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                                <Cpu className="w-5 h-5 text-purple-500" /> AI Models Manager
                            </h2>
                        </div>
                        
                        <form onSubmit={handleModelSubmit} className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Model ID (e.g. gemini-2.5-flash)</label>
                                <input 
                                    required 
                                    type="text" 
                                    value={modelForm.modelId} 
                                    onChange={e => setModelForm({...modelForm, modelId: e.target.value})} 
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" 
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                                <input 
                                    required 
                                    type="text" 
                                    value={modelForm.name} 
                                    onChange={e => setModelForm({...modelForm, name: e.target.value})} 
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all" 
                                />
                            </div>
                            <div className="flex items-end">
                                <button type="submit" className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                                    {editingModel ? <><Check className="w-4 h-4"/> Update</> : <><Plus className="w-4 h-4"/> Add Model</>}
                                </button>
                                {editingModel && (
                                    <button 
                                        type="button" 
                                        onClick={() => { setEditingModel(null); setModelForm({modelId: '', name: '', isActive: true }); }} 
                                        className="ml-2 px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-800 text-sm text-gray-500">
                                        <th className="pb-3 font-medium">Model Name</th>
                                        <th className="pb-3 font-medium">Model ID</th>
                                        <th className="pb-3 font-medium">Status</th>
                                        <th className="pb-3 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50 text-sm">
                                    {loading ? (
                                        <tr><td colSpan={4} className="py-8 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-500" /></td></tr>
                                    ) : aiModels.map((model: any) => (
                                        <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            <td className="py-4 font-medium text-gray-900 dark:text-white">{model.name}</td>
                                            <td className="py-4 text-gray-500">{model.modelId}</td>
                                            <td className="py-4">
                                                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${model.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                    {model.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right">
                                                <button 
                                                    onClick={() => { setEditingModel(model); setModelForm({modelId: model.modelId, name: model.name, isActive: model.isActive}); }} 
                                                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors inline-block"
                                                >
                                                    <Edit2 className="w-4 h-4"/>
                                                </button>
                                                <button 
                                                    onClick={() => handleModelDelete(model.id)} 
                                                    className="p-2 text-gray-400 hover:text-red-600 transition-colors inline-block ml-1"
                                                >
                                                    <Trash2 className="w-4 h-4"/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!loading && aiModels.length === 0 && (
                                        <tr><td colSpan={4} className="py-8 text-center text-gray-500">No models configured.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
