'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AppCard from '@/components/ui/AppCard';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { Grid, Section } from '@/components/layout/Primitives';
import { Loader2 } from 'lucide-react';
import { Typography } from '@/components/ui/Typography';

interface MyApp {
    id: string;
    name: string;
    description: string;
    imageLink: string;
    appLink: string;
    isNative: boolean;
}

export default function DashboardPage() {
    const [apps, setApps] = useState<MyApp[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchApps = async () => {
            try {
                const res = await fetch('/api/my-apps');
                if (res.ok) {
                    const data = await res.json();
                    setApps(data);
                }
            } catch (error) {
                console.error('Failed to fetch apps', error);
                toast.error('Failed to load apps');
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, []);

    const handleAppClick = (app: MyApp) => {
        if (app.isNative) {
            window.location.href = app.appLink;
        } else {
            window.open(app.appLink, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <ProtectedRoute>
            <DashboardLayout>
                <Section className="pt-0 md:pt-0" title="Explore Apps" description="Discover and manage your connected accounts and services.">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-text-muted gap-space-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <Typography variant="small">Loading your apps...</Typography>
                        </div>
                    ) : apps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-text-muted">
                            <Typography variant="body">No apps found.</Typography>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-space-6 pb-space-8 w-full">
                            {apps.map((app) => (
                                <AppCard
                                    key={app.id}
                                    name={app.name}
                                    description={app.description}
                                    image={app.imageLink}
                                    onClick={() => handleAppClick(app)}
                                />
                            ))}
                        </div>
                    )}
                </Section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}

// Icons are now in DashboardLayout or unused here
