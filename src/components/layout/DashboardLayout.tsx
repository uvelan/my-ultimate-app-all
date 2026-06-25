'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const pathname = usePathname();
    const isDashboard = pathname === '/dashboard';

    return (
        <div className="flex h-screen bg-background text-text-primary font-sans overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                isMobileOpen={isMobileOpen}
                closeMobile={() => setIsMobileOpen(false)}
                toggleCollapse={() => setIsCollapsed(!isCollapsed)}
            />

            {/* Main Content Wrapper */}
            <main className={cn(
                "flex-1 flex flex-col h-full min-w-0 transition-all duration-premium",
                isCollapsed ? "md:ml-20" : "md:ml-64"
            )}>
                {/* Fixed Header Portion (Google Stitch Contextual Topbar) */}
                <div className={cn(
                    "sticky top-0 z-30 flex-none px-space-4 py-space-2 md:px-space-8 md:py-space-2 bg-background border-b border-border transition-all duration-base ease-stitch",
                    "md:border-none" // Stitched look hides border on desktop when scrolled top, but let's keep it clean
                )}>
                    <div className="flex items-center gap-space-4">
                        <button
                            onClick={() => setIsMobileOpen(true)}
                            className="md:hidden p-space-2 text-text-secondary hover:bg-background-muted rounded-radius-md transition-premium"
                        >
                            <Menu className="h-6 w-6" />
                        </button>

                        <div className="flex-1">
                            {isDashboard && <Header />}
                        </div>
                        <div className="flex items-center">
                            <ThemeToggle />
                        </div>
                    </div>
                </div>

                {/* Scrollable Content Portion */}
                <div className="flex-1 overflow-y-auto p-space-4 pt-0 md:p-space-8 md:pt-0 no-scrollbar">
                    {children}
                </div>
            </main>
        </div>
    );
}
