'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Grid, Section } from '@/components/layout/Primitives';
import { Typography } from '@/components/ui/Typography';
import { Users, AppWindow, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AdminDashboard() {
    return (
        <ProtectedRoute adminOnly>
            <DashboardLayout>
                <Section title="Admin Control Center" description="Overview of administrative tools and system management.">
                    <Grid cols={{ sm: 1, md: 2 }} gap="space-6">
                        {/* Users Management */}
                        <Card className="group hover:shadow-shadow-lg transition-premium border-border bg-background-surface">
                            <CardHeader>
                                <div className="p-space-3 w-fit rounded-radius-lg bg-primary/10 text-primary mb-space-2 group-hover:bg-primary group-hover:text-text-inverted transition-premium">
                                    <Users size={24} />
                                </div>
                                <CardTitle className="text-h3">Manage Users</CardTitle>
                                <CardDescription>
                                    View, create, edit, and delete user accounts. Manage user roles and activation status.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Link href="/admin/users" passHref>
                                    <Button variant="outline" className="w-full group/btn">
                                        Go to Users
                                        <ArrowRight className="ml-space-2 h-4 w-4 transition-premium group-hover/btn:translate-x-1" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>

                        {/* Apps Management */}
                        <Card className="group hover:shadow-shadow-lg transition-premium border-border bg-background-surface">
                            <CardHeader>
                                <div className="p-space-3 w-fit rounded-radius-lg bg-accent/10 text-accent mb-space-2 group-hover:bg-accent group-hover:text-text-inverted transition-premium">
                                    <AppWindow size={24} />
                                </div>
                                <CardTitle className="text-h3">Manage Apps</CardTitle>
                                <CardDescription>
                                    Add, update, and remove applications. Configure native vs external links for the dashboard.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Link href="/admin/my-apps" passHref>
                                    <Button variant="outline" className="w-full group/btn">
                                        Go to Apps
                                        <ArrowRight className="ml-space-2 h-4 w-4 transition-premium group-hover/btn:translate-x-1" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </Grid>
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}
