'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Typography } from '@/components/ui/Typography';
import { Modal } from '@/components/ui/Modal';
import { Grid, Section } from '@/components/layout/Primitives';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Plus, Edit2, Trash2, ArrowLeft, ExternalLink, Globe, Smartphone, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface MyApp {
    id: string;
    name: string;
    description: string;
    imageLink: string;
    appLink: string;
    isNative: boolean;
    createdAt: string;
}

export default function AdminAppsPage() {
    const [apps, setApps] = useState<MyApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        imageLink: '',
        appLink: '',
        isNative: false,
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        fetchApps();
    }, []);

    const fetchApps = async () => {
        try {
            const res = await fetch('/api/admin/my-apps');
            if (res.ok) {
                const data = await res.json();
                setApps(data);
            }
        } catch (error) {
            toast.error('Failed to fetch apps');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            // Just read as DataURL for local preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, imageLink: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingId ? `/api/admin/my-apps/${editingId}` : '/api/admin/my-apps';
            const method = editingId ? 'PATCH' : 'POST';

            const formDataToSend = new FormData();
            formDataToSend.append('name', formData.name);
            formDataToSend.append('description', formData.description);
            formDataToSend.append('appLink', formData.appLink);
            formDataToSend.append('isNative', formData.isNative.toString());
            
            if (imageFile) {
                formDataToSend.append('imageFile', imageFile);
            } else if (formData.imageLink) {
                formDataToSend.append('imageLink', formData.imageLink);
            }

            const res = await fetch(url, {
                method,
                body: formDataToSend,
            });

            if (res.ok) {
                toast.success(editingId ? 'App updated successfully' : 'App created successfully');
                fetchApps();
                resetForm();
            } else {
                toast.error('Operation failed');
            }
        } catch (error) {
            toast.error('Error saving app');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this app?')) return;
        try {
            const res = await fetch(`/api/admin/my-apps/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('App deleted');
                setApps(apps.filter(app => app.id !== id));
            } else {
                toast.error('Failed to delete');
            }
        } catch (error) {
            toast.error('Error deleting app');
        }
    };

    const startEdit = (app: MyApp) => {
        setFormData({
            name: app.name,
            description: app.description,
            imageLink: app.imageLink,
            appLink: app.appLink,
            isNative: app.isNative,
        });
        setImageFile(null);
        setEditingId(app.id);
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            imageLink: '',
            appLink: '',
            isNative: false,
        });
        setImageFile(null);
        setEditingId(null);
        setShowModal(false);
    };

    return (
        <ProtectedRoute adminOnly>
            <DashboardLayout>
                <Section title="Application Registry" description="Manage the catalog of applications displayed on the main user dashboard.">
                    <div className="flex justify-between items-center mb-space-6">
                        <Link href="/admin">
                            <Button variant="ghost" size="sm" className="gap-space-2 text-text-muted hover:text-text-primary">
                                <ArrowLeft size={16} /> Back to Admin
                            </Button>
                        </Link>
                        <Button onClick={() => setShowModal(true)} className="gap-space-2">
                            <Plus size={18} /> Add New Application
                        </Button>
                    </div>

                    <Card className="border-none bg-background-surface shadow-shadow-sm">
                        <CardContent className="p-0 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Application</TableHead>
                                        <TableHead className="hidden md:table-cell">Details</TableHead>
                                        <TableHead className="hidden sm:table-cell">Type</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center gap-space-3 text-text-muted">
                                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                    <Typography variant="small">Loading applications...</Typography>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : apps.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-64 text-center">
                                                <Typography variant="body" className="text-text-muted">No applications found</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        apps.map((app) => (
                                            <TableRow key={app.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-space-4">
                                                        <div className="h-12 w-12 rounded-radius-md overflow-hidden bg-background-muted flex-shrink-0">
                                                            {app.imageLink ? (
                                                                <img src={app.imageLink} alt={app.name} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <div className="h-full w-full flex items-center justify-center text-text-muted">
                                                                    <Globe size={20} />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <Typography variant="small" className="font-semibold text-text-primary">{app.name}</Typography>
                                                            <Typography variant="caption" className="text-text-muted md:hidden max-w-[150px] truncate">
                                                                {app.description}
                                                            </Typography>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <div className="flex flex-col gap-space-1 max-w-[250px]">
                                                        <Typography variant="caption" className="text-text-primary line-clamp-1">
                                                            {app.description}
                                                        </Typography>
                                                        <div className="flex items-center gap-space-1 text-text-muted">
                                                            <ExternalLink size={12} />
                                                            <Typography variant="caption" className="truncate">{app.appLink}</Typography>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden sm:table-cell">
                                                    <Badge variant={app.isNative ? 'success' : 'secondary'} className="gap-space-1">
                                                        {app.isNative ? <Smartphone size={12} /> : <Globe size={12} />}
                                                        {app.isNative ? 'Native' : 'External'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-space-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => startEdit(app)}
                                                            className="text-primary hover:bg-primary/10"
                                                            title="Edit Application"
                                                        >
                                                            <Edit2 size={16} />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(app.id)}
                                                            className="text-error hover:bg-error/10"
                                                            title="Delete Application"
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* App Form Modal */}
                    <Modal
                        isOpen={showModal}
                        onClose={resetForm}
                        title={editingId ? 'Edit Application' : 'Add New Application'}
                        description="Configure the metadata and links for an application in the system."
                    >
                        <form onSubmit={handleSubmit} className="space-y-space-4 pt-space-4">
                            <Grid cols={{ sm: 1, md: 2 }} gap="space-4">
                                <Input
                                    label="App Name"
                                    placeholder="e.g. My Expense Tracker"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                                <div>
                                    <label className="text-sm font-medium text-text-primary mb-2 block">App Icon/Image</label>
                                    <div className="flex items-center gap-4">
                                        {formData.imageLink ? (
                                            <div className="w-12 h-12 rounded-md bg-background-surface border border-border flex-shrink-0 overflow-hidden relative group">
                                                <img src={formData.imageLink} alt="Preview" className="w-full h-full object-cover" />
                                                <button 
                                                    type="button" 
                                                    onClick={() => {
                                                        setFormData({ ...formData, imageLink: '' });
                                                        setImageFile(null);
                                                    }}
                                                    className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-12 h-12 rounded-md bg-background-surface border border-border border-dashed flex items-center justify-center text-text-muted flex-shrink-0">
                                                <Globe size={18} />
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            className="text-sm text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </Grid>
                            <Textarea
                                label="Description"
                                placeholder="What does this app do?"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                required
                            />
                            <Input
                                label="Application Link (URL)"
                                placeholder="/dashboard or https://..."
                                value={formData.appLink}
                                onChange={e => setFormData({ ...formData, appLink: e.target.value })}
                                required
                            />
                            <div className="flex items-center gap-space-3 pt-space-2 p-space-4 bg-background-muted/50 rounded-radius-md border border-border">
                                <input
                                    type="checkbox"
                                    id="isNative"
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 transition-premium"
                                    checked={formData.isNative}
                                    onChange={e => setFormData({ ...formData, isNative: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <label htmlFor="isNative" className="text-small font-medium text-text-primary cursor-pointer select-none">
                                        Native Routing
                                    </label>
                                    <Typography variant="caption" className="text-text-muted">
                                        If enabled, the dashboard will use internal navigation instead of opening a new tab.
                                    </Typography>
                                </div>
                            </div>
                            <div className="flex gap-space-3 pt-space-6 border-t border-border mt-space-6">
                                <Button type="button" variant="ghost" className="flex-1" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" className="flex-1">
                                    {editingId ? 'Update Application' : 'Register Application'}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
