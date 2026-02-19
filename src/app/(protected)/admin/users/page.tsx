'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Card, Button } from '@/components/ui/components';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN';
    isActive: boolean;
    createdAt: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'USER', isActive: true });
    const { user } = useAuth();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (error) {
            toast.error('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    const deleteUser = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('User deleted');
                setUsers(users.filter(u => u.id !== id));
            } else {
                toast.error('Failed to delete user');
            }
        } catch (error) {
            toast.error('Error deleting user');
        }
    };

    const toggleRole = async (u: User) => {
        const newRole = u.role === 'ADMIN' ? 'USER' : 'ADMIN';
        if (!confirm(`Change role to ${newRole}?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${u.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            if (res.ok) {
                toast.success('Role updated');
                setUsers(users.map(user => user.id === u.id ? { ...user, role: newRole } : user));
            } else {
                toast.error('Failed to update role');
            }
        } catch (error) {
            toast.error('Error updating role');
        }
    };

    const toggleStatus = async (u: User) => {
        const newStatus = !u.isActive;
        const action = newStatus ? 'Activate' : 'Deactivate';
        if (!confirm(`${action} user?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${u.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newStatus }),
            });
            if (res.ok) {
                toast.success(`User ${action}d`);
                setUsers(users.map(user => user.id === u.id ? { ...user, isActive: newStatus } : user));
            } else {
                toast.error(`Failed to ${action.toLowerCase()} user`);
            }
        } catch (error) {
            toast.error(`Error ${action.toLowerCase()}ing user`);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                const data = await res.json();
                toast.success('User created successfully');
                setUsers([...users, data.user]);
                setShowCreateForm(false);
                setFormData({ name: '', email: '', password: '', role: 'USER', isActive: true });
            } else {
                const data = await res.json();
                toast.error(data.error || 'Failed to create user');
            }
        } catch (error) {
            toast.error('Error creating user');
        }
    };

    return (
        <ProtectedRoute adminOnly>
            <div className="row justify-content-center">
                <div className="col-12">
                    <Card className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <div>
                                <h1 className="h2 text-white mb-0">Manage Users</h1>
                                <span className="badge bg-info text-dark">Admin</span>
                            </div>
                            <div className="d-flex gap-2">
                                <Link href="/admin" className="btn btn-outline-light btn-sm border-white/20 hover:bg-white/10">
                                    Back to Admin
                                </Link>
                                <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                                    {showCreateForm ? 'Cancel' : 'Create User'}
                                </Button>
                            </div>
                        </div>

                        {showCreateForm && (
                            <div className="bg-white/5 p-4 rounded mb-4 border border-white/10">
                                <h3 className="h5 text-white mb-3">Create New User</h3>
                                <form onSubmit={handleCreateUser} className="row g-3">
                                    <div className="col-md-6">
                                        <input
                                            type="text"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="Name"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <input
                                            type="email"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="Email"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <input
                                            type="password"
                                            className="form-control bg-dark border-white/20 text-white"
                                            placeholder="Password"
                                            value={formData.password}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <select
                                            className="form-select bg-dark border-white/20 text-white"
                                            value={formData.role}
                                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="USER">User</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                    <div className="col-md-3 d-flex align-items-center">
                                        <div className="form-check form-switch">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="isActive"
                                                checked={formData.isActive}
                                                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                            />
                                            <label className="form-check-label text-white" htmlFor="isActive">Active</label>
                                        </div>
                                    </div>
                                    <div className="col-12">
                                        <Button type="submit" variant="primary">Create User</Button>
                                    </div>
                                </form>
                            </div>
                        )}

                        <div className="table-responsive">
                            <table className="table table-dark table-hover table-borderless align-middle bg-transparent mb-0">
                                <thead>
                                    <tr className="border-bottom border-white/20">
                                        <th scope="col" className="bg-transparent text-white/50">Name</th>
                                        <th scope="col" className="bg-transparent text-white/50">Email</th>
                                        <th scope="col" className="bg-transparent text-white/50">Role</th>
                                        <th scope="col" className="bg-transparent text-white/50">Status</th>
                                        <th scope="col" className="bg-transparent text-white/50">Joined</th>
                                        <th scope="col" className="bg-transparent text-white/50 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-4 bg-transparent text-white">
                                                <div className="spinner-border spinner-border-sm me-2" role="status" />
                                                Loading users...
                                            </td>
                                        </tr>
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-4 bg-transparent text-white">No users found</td>
                                        </tr>
                                    ) : (
                                        users.map((u) => (
                                            <tr key={u.id}>
                                                <td className="bg-transparent text-white fw-medium">{u.name}</td>
                                                <td className="bg-transparent text-white/80">{u.email}</td>
                                                <td className="bg-transparent">
                                                    <span className={`badge ${u.role === 'ADMIN' ? 'bg-danger' : 'bg-success'}`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="bg-transparent">
                                                    <span className={`badge ${u.isActive ? 'bg-success' : 'bg-warning text-dark'}`}>
                                                        {u.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="bg-transparent text-white/60">
                                                    {new Date(u.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="bg-transparent text-end">
                                                    <Button
                                                        variant="outline"
                                                        className={`btn-sm me-2 border-white/20 hover:bg-white/10 ${u.isActive ? 'text-warning' : 'text-success'}`}
                                                        onClick={() => toggleStatus(u)}
                                                        disabled={u.id === user?.id}
                                                    >
                                                        {u.isActive ? 'Deactivate' : 'Activate'}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="btn-sm me-2 text-white border-white/20 hover:bg-white/10"
                                                        onClick={() => toggleRole(u)}
                                                        disabled={u.id === user?.id}
                                                    >
                                                        {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
                                                    </Button>
                                                    <Button
                                                        variant="danger"
                                                        className="btn-sm"
                                                        onClick={() => deleteUser(u.id)}
                                                        disabled={u.id === user?.id}
                                                    >
                                                        Delete
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>
        </ProtectedRoute>
    );
}
