'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Card, Button } from '@/components/ui/components';
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
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        imageLink: '',
        appLink: '',
        isNative: false,
    });
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const url = editingId ? `/api/admin/my-apps/${editingId}` : '/api/admin/my-apps';
            const method = editingId ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                toast.success(editingId ? 'App updated' : 'App created');
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
        if (!confirm('Are you sure?')) return;
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
        setEditingId(app.id);
        setShowForm(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            imageLink: '',
            appLink: '',
            isNative: false,
        });
        setEditingId(null);
        setShowForm(false);
    };

    return (
        <ProtectedRoute adminOnly>
            <div className="row justify-content-center">
                <div className="col-12">
                    <Card className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <div>
                                <h1 className="h2 text-white mb-0">Manage My Apps</h1>
                                <span className="badge bg-info text-dark">Admin</span>
                            </div>
                            <div className="d-flex gap-2">
                                <Link href="/admin" className="btn btn-outline-light btn-sm border-white/20 hover:bg-white/10">
                                    Back to Admin
                                </Link>
                                <Button onClick={() => setShowForm(!showForm)}>
                                    {showForm ? 'Cancel' : 'Add New App'}
                                </Button>
                            </div>
                        </div>

                        {showForm && (
                            <div className="bg-white/5 p-4 rounded mb-4 border border-white/10">
                                <h3 className="h5 text-white mb-3">{editingId ? 'Edit App' : 'Add New App'}</h3>
                                <form onSubmit={handleSubmit} className="row g-3">
                                    <div className="col-md-6">
                                        <label htmlFor="name" className="form-label text-white">App Name</label>
                                        <input
                                            type="text"
                                            id="name"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="Name"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label htmlFor="imageLink" className="form-label text-white">Image URL</label>
                                        <input
                                            type="text"
                                            id="imageLink"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="https://example.com/image.png"
                                            value={formData.imageLink}
                                            onChange={e => setFormData({ ...formData, imageLink: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label htmlFor="description" className="form-label text-white">Description</label>
                                        <textarea
                                            id="description"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="Brief description of the app"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-8">
                                        <label htmlFor="appLink" className="form-label text-white">App Link (URL)</label>
                                        <input
                                            type="text"
                                            id="appLink"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="https://example.com"
                                            value={formData.appLink}
                                            onChange={e => setFormData({ ...formData, appLink: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-4 d-flex align-items-end">
                                        <div className="form-check form-switch mb-2">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="isNative"
                                                checked={formData.isNative}
                                                onChange={e => setFormData({ ...formData, isNative: e.target.checked })}
                                            />
                                            <label className="form-check-label text-white" htmlFor="isNative">Is Native (Internal Redirect)</label>
                                        </div>
                                    </div>
                                    <div className="col-12">
                                        <Button type="submit" variant="primary">{editingId ? 'Update App' : 'Create App'}</Button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div className="table-responsive">
                            <table className="table table-dark table-hover table-borderless align-middle bg-transparent mb-0">
                                <thead>
                                    <tr className="border-bottom border-white/20">
                                        <th scope="col" className="bg-transparent text-white/50">Name</th>
                                        <th scope="col" className="bg-transparent text-white/50 d-none d-md-table-cell">Details</th>
                                        <th scope="col" className="bg-transparent text-white/50 d-none d-sm-table-cell">Type</th>
                                        <th scope="col" className="bg-transparent text-white/50 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-4 bg-transparent text-white">Loading...</td>
                                        </tr>
                                    ) : apps.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-4 bg-transparent text-white">No apps found</td>
                                        </tr>
                                    ) : (
                                        apps.map((app) => (
                                            <tr key={app.id}>
                                                <td className="bg-transparent text-white fw-medium">
                                                    <div className="d-flex align-items-center gap-2">
                                                        {app.imageLink && (
                                                            <img src={app.imageLink} alt={app.name} className="rounded" width="32" height="32" style={{ objectFit: 'cover' }} />
                                                        )}
                                                        <div>
                                                            <div>{app.name}</div>
                                                            <div className="d-md-none small text-white/50 text-truncate" style={{ maxWidth: '150px' }}>{app.description}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="bg-transparent text-white/80 d-none d-md-table-cell">
                                                    <div className="small text-truncate" style={{ maxWidth: '200px' }}>{app.description}</div>
                                                    <div className="small text-white/40 text-truncate" style={{ maxWidth: '200px' }}>{app.appLink}</div>
                                                </td>
                                                <td className="bg-transparent d-none d-sm-table-cell">
                                                    <span className={`badge ${app.isNative ? 'bg-success' : 'bg-secondary'}`}>
                                                        {app.isNative ? 'Native' : 'External'}
                                                    </span>
                                                </td>
                                                <td className="bg-transparent text-end">
                                                    <div className="d-flex justify-content-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            className="btn-sm border-white/20 hover:bg-white/10"
                                                            onClick={() => startEdit(app)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="danger"
                                                            className="btn-sm"
                                                            onClick={() => handleDelete(app.id)}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>
        </ProtectedRoute>
    );
}
