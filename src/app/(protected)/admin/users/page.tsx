'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Section } from '@/components/layout/Primitives';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Typography } from '@/components/ui/Typography';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { UserPlus, Trash2, Shield, UserX, UserCheck, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'USER' | 'ADMIN' | 'SUPERUSER';
    isActive: boolean;
    createdAt: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'USER' as const, isActive: true });
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
                setShowCreateModal(false);
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
            <DashboardLayout>
                <Section 
                    title="User Management" 
                    description="Administrate user accounts, roles, and system access levels."
                >
                    <div className="flex justify-between items-center mb-space-6">
                        <Link href="/admin">
                            <Button variant="ghost" size="sm" className="gap-space-2 text-text-muted hover:text-text-primary">
                                <ArrowLeft size={16} /> Back to Admin
                            </Button>
                        </Link>
                        {user?.role === 'SUPERUSER' && (
                            <Button onClick={() => setShowCreateModal(true)} className="gap-space-2">
                                <UserPlus size={18} /> Create New User
                            </Button>
                        )}
                    </div>

                    <Card className="border-none bg-background-surface shadow-shadow-sm">
                        <CardContent className="p-0 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center gap-space-3 text-text-muted">
                                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                    <Typography variant="small">Loading users...</Typography>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : users.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-64 text-center">
                                                <Typography variant="body" className="text-text-muted">No users found</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        users.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <Typography variant="small" className="font-semibold text-text-primary">{u.name}</Typography>
                                                        <Typography variant="caption" className="text-text-muted">{u.email}</Typography>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={u.role === 'SUPERUSER' ? 'primary' : u.role === 'ADMIN' ? 'error' : 'secondary'}>
                                                        {u.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={u.isActive ? 'success' : 'warning'}>
                                                        {u.isActive ? 'Active' : 'Disabled'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" className="text-text-muted">
                                                        {new Date(u.createdAt).toLocaleDateString(undefined, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        })}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-space-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => toggleStatus(u)}
                                                            disabled={u.id === user?.id}
                                                            title={u.isActive ? 'Deactivate' : 'Activate'}
                                                            className={u.isActive ? 'text-warning hover:text-warning hover:bg-warning/10' : 'text-success hover:text-success hover:bg-success/10'}
                                                        >
                                                            {u.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => toggleRole(u)}
                                                            disabled={u.id === user?.id || (user?.role !== 'SUPERUSER' && u.role === 'SUPERUSER')}
                                                            title={u.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}
                                                            className="text-primary hover:bg-primary/10"
                                                        >
                                                            <Shield size={16} />
                                                        </Button>
                                                        {user?.role === 'SUPERUSER' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => deleteUser(u.id)}
                                                                disabled={u.id === user?.id}
                                                                title="Delete User"
                                                                className="text-error hover:text-error hover:bg-error/10"
                                                            >
                                                                <Trash2 size={16} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Create User Modal */}
                    <Modal
                        isOpen={showCreateModal}
                        onClose={() => setShowCreateModal(false)}
                        title="Create New User"
                        description="Add a new member to the system and assign their initial role."
                    >
                        <form onSubmit={handleCreateUser} className="space-y-space-4 pt-space-4">
                            <Input
                                label="Full Name"
                                placeholder="Enter user's name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                            <Input
                                label="Email Address"
                                type="email"
                                placeholder="email@example.com"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                            <Input
                                label="Initial Password"
                                type="password"
                                placeholder="Min 6 characters"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                required
                                minLength={6}
                            />
                            <div className="space-y-space-2">
                                <label className="text-small font-medium text-text-primary">System Role</label>
                                <select
                                    className="w-full h-11 bg-background-muted border-none rounded-radius-md px-space-4 text-small focus:ring-2 focus:ring-primary/20 transition-premium"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                                >
                                    <option value="USER">User</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="SUPERUSER">Superuser</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-space-3 pt-space-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 transition-premium"
                                    checked={formData.isActive}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                />
                                <label htmlFor="isActive" className="text-small font-medium text-text-primary cursor-pointer select-none">
                                    Account automatically active
                                </label>
                            </div>
                            <div className="flex gap-space-3 pt-space-6 border-t border-border mt-space-6">
                                <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowCreateModal(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" className="flex-1">
                                    Create User
                                </Button>
                            </div>
                        </form>
                    </Modal>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
