'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AppCard from '@/components/ui/AppCard';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

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
    const router = useRouter();

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
            router.push(app.appLink);
        } else {
            window.open(app.appLink, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <ProtectedRoute>
            <DashboardLayout>
                {/* Hero / Discovery Section */}
                <section>
                    {loading ? (
                        <div className="flex justify-center items-center h-64 text-gray-500">
                            Loading your apps...
                        </div>
                    ) : apps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <p className="mb-4">No apps found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8">
                            {apps.map((app) => (
                                <div key={app.id} onClick={() => handleAppClick(app)} className="cursor-pointer">
                                    <AppCard
                                        name={app.name}
                                        description={app.description}
                                        image={app.imageLink}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </DashboardLayout>
        </ProtectedRoute>
    );
}

// Icons are now in DashboardLayout or unused here
