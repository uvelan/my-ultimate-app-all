'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    return (
        <div className="flex h-screen bg-[#EAE9E4] font-sans overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                isMobileOpen={isMobileOpen}
                closeMobile={() => setIsMobileOpen(false)}
                toggleCollapse={() => setIsCollapsed(!isCollapsed)}
            />

            {/* Main Content Wrapper */}
            <main className={`flex-1 flex flex-col h-full transition-all duration-300 ${isCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>

                {/* Fixed Header Portion */}
                <div className="flex-none p-4 md:p-8 pb-0">
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => setIsMobileOpen(true)}
                            className="md:hidden p-2 text-gray-600 hover:bg-white/50 rounded-lg"
                        >
                            <MenuIcon />
                        </button>

                        <div className="flex-1">
                            <Header />
                        </div>
                    </div>
                </div>

                {/* Scrollable Content Portion */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-0">
                    {children}
                </div>
            </main>
        </div>
    );
}

function MenuIcon() {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
}
