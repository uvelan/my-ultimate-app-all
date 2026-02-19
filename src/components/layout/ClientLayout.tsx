'use client';

import { usePathname } from 'next/navigation';


export default function ClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    // Check if the current path is the dashboard
    // We can extend this logic if other detailed pages need full screen
    const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/books');
    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register');

    if (isDashboard) {
        return <>{children}</>;
    }

    if (isAuthPage) {
        return (
            <main className="h-screen w-full flex items-center justify-center overflow-hidden">
                {children}
            </main>
        );
    }

    return (
        <main className="container py-4">
            {children}
        </main>
    );
}
