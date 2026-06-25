'use client';

import { usePathname } from 'next/navigation';


export default function ClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    // Check if the current path is the dashboard or full-screen app
    // We can extend this logic if other detailed pages need full screen
    const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/books') || pathname?.startsWith('/finance') || pathname?.startsWith('/novelscraper') || pathname?.startsWith('/interview') || pathname?.startsWith('/resume-builder');
    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/register');

    if (isDashboard) {
        return <>{children}</>;
    }

    if (isAuthPage) {
        return (
            <main className="h-screen w-full grid grid-cols-1 md:grid-cols-2 overflow-hidden bg-background relative">
                {/* Mobile Background */}
                <div className="absolute inset-0 z-0 md:hidden bg-no-repeat bg-cover bg-center opacity-20" style={{ backgroundImage: "url('/ekam-login-bg.png?v=2')" }} />

                {/* Ekam Branding Panel (Desktop) */}
                <div className="hidden md:flex flex-col justify-center bg-black relative overflow-hidden">
                    <div className="absolute inset-0 z-0 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/ekam-login-bg.png?v=2')" }} />
                </div>
                
                {/* Auth Form Panel */}
                <div className="flex flex-col justify-center items-center p-8 sm:p-12 md:p-16 lg:p-24 bg-transparent md:bg-surface relative overflow-y-auto z-10">
                    <div className="w-full max-w-md mx-auto relative z-10">
                        {children}
                    </div>
                    {/* Star Icon */}
                    <svg className="absolute bottom-8 right-8 text-[#a3a3a3] w-12 h-12 opacity-40 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C12 6.62742 17.3726 12 24 12C17.3726 12 12 17.3726 12 24C12 17.3726 6.62742 12 0 12C6.62742 12 12 6.62742 12 0Z" />
                    </svg>
                </div>
            </main>
        );
    }

    return (
        <main className="container py-4">
            {children}
        </main>
    );
}
