'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Card } from '@/components/ui/components';
import Link from 'next/link';

export default function AdminDashboard() {
    return (
        <ProtectedRoute adminOnly>
            <div className="row justify-content-center">
                <div className="col-12">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <h1 className="h2 text-white mb-0">Admin Dashboard</h1>
                        <Link href="/dashboard" className="btn btn-outline-light btn-sm border-white/20 hover:bg-white/10">
                            Back to Dashboard
                        </Link>
                    </div>

                    <div className="row g-4">
                        <div className="col-md-6 col-lg-4">
                            <Card className="h-100 hover:bg-white/5 transition-colors cursor-pointer border-white/10">
                                <Link href="/admin/users" className="text-decoration-none text-white d-flex flex-column h-100 p-2">
                                    <h3 className="h4 mb-3">Manage Users</h3>
                                    <p className="text-white/70 mb-4">View, create, edit, and delete user accounts. Manage user roles and activation status.</p>
                                    <div className="mt-auto">
                                        <span className="btn btn-outline-light btn-sm">Go to Users &rarr;</span>
                                    </div>
                                </Link>
                            </Card>
                        </div>

                        <div className="col-md-6 col-lg-4">
                            <Card className="h-100 hover:bg-white/5 transition-colors cursor-pointer border-white/10">
                                <Link href="/admin/my-apps" className="text-decoration-none text-white d-flex flex-column h-100 p-2">
                                    <h3 className="h4 mb-3">Manage Apps</h3>
                                    <p className="text-white/70 mb-4">Add, update, and remove applications. Configure native vs external links for the dashboard.</p>
                                    <div className="mt-auto">
                                        <span className="btn btn-outline-light btn-sm">Go to Apps &rarr;</span>
                                    </div>
                                </Link>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
