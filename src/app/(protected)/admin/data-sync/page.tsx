'use client';

import React, { useState, useRef } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Section } from '@/components/layout/Primitives';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Upload, AlertTriangle, FileJson, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function DataSyncPage() {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importMode, setImportMode] = useState<'UPDATE' | 'REPLACE'>('UPDATE');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsExporting(true);
        toast.loading('Exporting database...', { id: 'export-toast' });
        
        try {
            const response = await fetch('/api/admin/data-sync/export');
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to export data');
            }

            // Get filename from Content-Disposition if available
            let filename = `ultimate-app-backup-${new Date().toISOString().split('T')[0]}.json`;
            const contentDisposition = response.headers.get('Content-Disposition');
            if (contentDisposition && contentDisposition.includes('filename=')) {
                filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success('Database exported successfully', { id: 'export-toast' });
        } catch (error: any) {
            toast.error(`Export failed: ${error.message}`, { id: 'export-toast' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImport = async () => {
        if (!selectedFile) {
            toast.error('Please select a JSON backup file to import');
            return;
        }

        if (importMode === 'REPLACE') {
            const confirmed = window.confirm(
                'WARNING: You have selected REPLACE mode. This will completely wipe all current data in the database before importing. Are you absolutely sure you want to proceed?'
            );
            if (!confirmed) return;
        }

        setIsImporting(true);
        toast.loading(`Importing data in ${importMode} mode... This may take a moment.`, { id: 'import-toast' });

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('mode', importMode);

            const response = await fetch('/api/admin/data-sync/import', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to import data');
            }

            toast.success('Database imported successfully!', { id: 'import-toast' });
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            
        } catch (error: any) {
            toast.error(`Import failed: ${error.message}`, { id: 'import-toast' });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <ProtectedRoute adminOnly>
            {/* Added an extra check in case an Admin sneaks in, though API protects it too */}
            <DashboardLayout>
                <Section title="Data Sync" description="Export and import database backups (Superuser only).">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-space-6 max-w-5xl">
                        
                        {/* EXPORT CARD */}
                        <Card className="border-border bg-background-surface flex flex-col h-full">
                            <CardHeader>
                                <div className="p-space-3 w-fit rounded-radius-lg bg-blue-500/10 text-blue-500 mb-space-2">
                                    <Download size={24} />
                                </div>
                                <CardTitle className="text-h3">Export Database</CardTitle>
                                <CardDescription>
                                    Download a complete JSON dump of all tables and collections. This backup can be used to restore this environment or migrate to a new one.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <ul className="text-sm text-text-muted space-y-2 list-disc list-inside">
                                    <li>Exports all Prisma models dynamically.</li>
                                    <li>Contains sensitive data (hashed passwords, etc).</li>
                                    <li>Store the downloaded file securely.</li>
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button 
                                    onClick={handleExport} 
                                    disabled={isExporting}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isExporting ? 'Exporting...' : 'Download Full Backup'}
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* IMPORT CARD */}
                        <Card className="border-border bg-background-surface flex flex-col h-full border-t-4 border-t-red-500/50">
                            <CardHeader>
                                <div className="p-space-3 w-fit rounded-radius-lg bg-red-500/10 text-red-500 mb-space-2">
                                    <Upload size={24} />
                                </div>
                                <CardTitle className="text-h3">Import Database</CardTitle>
                                <CardDescription>
                                    Restore a previously exported JSON backup file.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-6">
                                
                                {/* Mode Selection */}
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-text-primary block">Import Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setImportMode('UPDATE')}
                                            className={`p-3 border rounded-radius-md text-sm font-medium transition-all text-left flex items-start gap-2 ${importMode === 'UPDATE' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-background-muted'}`}
                                        >
                                            <CheckCircle className={`w-4 h-4 mt-0.5 ${importMode === 'UPDATE' ? 'opacity-100' : 'opacity-0'}`} />
                                            <div>
                                                <div className={importMode === 'UPDATE' ? 'text-primary' : 'text-text-primary'}>Update Existing</div>
                                                <div className="text-xs font-normal opacity-80 mt-1">Upserts records using their IDs. Existing data remains.</div>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setImportMode('REPLACE')}
                                            className={`p-3 border rounded-radius-md text-sm font-medium transition-all text-left flex items-start gap-2 ${importMode === 'REPLACE' ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-border text-text-muted hover:bg-background-muted'}`}
                                        >
                                            <AlertTriangle className={`w-4 h-4 mt-0.5 ${importMode === 'REPLACE' ? 'opacity-100' : 'opacity-0'}`} />
                                            <div>
                                                <div className={importMode === 'REPLACE' ? 'text-red-500' : 'text-text-primary'}>Replace All</div>
                                                <div className="text-xs font-normal opacity-80 mt-1">Wipes the entire database before inserting the backup.</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* File Selection */}
                                <div className="space-y-3">
                                    <label className="text-sm font-medium text-text-primary block">Select Backup File</label>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 border border-border border-dashed rounded-radius-md p-4 text-center hover:bg-background-muted transition-colors cursor-pointer relative">
                                            <input 
                                                type="file" 
                                                accept=".json" 
                                                onChange={handleFileChange}
                                                ref={fileInputRef}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            {selectedFile ? (
                                                <div className="flex items-center justify-center gap-2 text-text-primary text-sm font-medium">
                                                    <FileJson className="w-4 h-4 text-primary" />
                                                    {selectedFile.name}
                                                </div>
                                            ) : (
                                                <div className="text-text-muted text-sm">
                                                    Click to browse or drag JSON file here
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </CardContent>
                            <CardFooter>
                                <Button 
                                    onClick={handleImport} 
                                    disabled={!selectedFile || isImporting}
                                    variant={importMode === 'REPLACE' ? 'danger' : 'primary'}
                                    className="w-full"
                                >
                                    {isImporting ? 'Importing...' : importMode === 'REPLACE' ? 'Wipe & Import Backup' : 'Import Backup'}
                                </Button>
                            </CardFooter>
                        </Card>

                    </div>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
