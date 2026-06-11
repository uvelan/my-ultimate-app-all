'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { 
    Home, 
    LayoutGrid, 
    Library, 
    Download, 
    Heart, 
    Settings, 
    HelpCircle, 
    LogOut, 
    ChevronLeft, 
    ChevronRight,
    ShieldCheck,
    FileText
} from 'lucide-react';
import { Typography } from '@/components/ui/Typography';

export default function Sidebar({
    isCollapsed,
    isMobileOpen,
    closeMobile,
    toggleCollapse
}: {
    isCollapsed: boolean;
    isMobileOpen: boolean;
    closeMobile: () => void;
    toggleCollapse: () => void;
}) {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const menuItems = [
        { name: 'Discover', href: '/dashboard', icon: Home },
        ...(['ADMIN', 'SUPERUSER'].includes(user?.role as string) ? [
            { name: 'Admin Panel', href: '/admin', icon: ShieldCheck }
        ] : []),
        { name: 'Category', href: '#category', icon: LayoutGrid },
        { name: 'My Library', href: '#library', icon: Library },
        { name: 'Download', href: '#download', icon: Download },
        { name: 'Favorite', href: '#favorite', icon: Heart },
    ];

    const bottomItems = [
        { name: 'Settings', href: '/settings', icon: Settings },
        { name: 'Help', href: '#help', icon: HelpCircle },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-text-primary/40 backdrop-blur-sm z-40 md:hidden transition-premium"
                    onClick={closeMobile}
                />
            )}

            <aside
                className={cn(
                    "fixed left-0 top-0 h-screen bg-secondary border-r border-border/50 z-50 flex flex-col transition-all duration-base ease-stitch shadow-shadow-lg md:shadow-none",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
                    isCollapsed ? "w-20" : "w-64"
                )}
            >
                <div className={cn(
                    "p-space-6 flex items-center mb-space-2",
                    isCollapsed ? "justify-center" : "justify-between"
                )}>
                    {!isCollapsed && (
                        <Typography variant="h3" className="font-bold tracking-tight text-primary">
                            Ekam
                        </Typography>
                    )}
                    <button
                        onClick={toggleCollapse}
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="p-space-2 text-text-muted hover:text-text-primary hover:bg-background-muted rounded-radius-md transition-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                    </button>
                </div>

                <nav aria-label="Main navigation" className="flex-1 px-space-4 overflow-y-auto no-scrollbar">
                    {!isCollapsed && (
                        <Typography variant="caption" className="font-bold text-text-muted px-space-4 mb-space-4 uppercase tracking-widest text-[10px]">
                            Main Menu
                        </Typography>
                    )}

                    <ul className="space-y-space-1">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        title={isCollapsed ? item.name : ''}
                                        onClick={closeMobile}
                                        aria-current={isActive ? "page" : undefined}
                                        className={cn(
                                            "flex items-center gap-space-3 px-space-4 py-space-3 rounded-radius-lg transition-premium group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                            isActive
                                                ? "bg-primary text-text-primary shadow-shadow-glow"
                                                : "text-text-secondary hover:bg-secondary-hover hover:text-text-primary"
                                        )}
                                    >
                                        <Icon className={cn(
                                            "h-5 w-5 shrink-0 transition-premium",
                                            isActive ? "text-text-primary" : "text-text-muted group-hover:text-primary"
                                        )} />
                                        {!isCollapsed && (
                                            <span className="font-medium whitespace-nowrap">{item.name}</span>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="my-space-6 border-t border-border" />

                    <ul className="space-y-space-1 pb-space-6">
                        {bottomItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <li key={item.name}>
                                    <Link
                                        href={item.href}
                                        title={isCollapsed ? item.name : ''}
                                        onClick={closeMobile}
                                        className="flex items-center gap-space-3 px-space-4 py-space-3 rounded-radius-lg text-text-secondary hover:bg-secondary-hover hover:text-text-primary transition-premium group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                        <Icon className="h-5 w-5 shrink-0 text-text-muted group-hover:text-text-primary" />
                                        {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                        <li>
                            <button
                                onClick={logout}
                                title={isCollapsed ? "Log out" : ''}
                                aria-label="Log out of your account"
                                className="w-full flex items-center gap-space-3 px-space-4 py-space-3 rounded-radius-lg text-text-secondary hover:bg-error/10 hover:text-error transition-premium group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                <LogOut className="h-5 w-5 shrink-0 text-text-muted group-hover:text-error" />
                                {!isCollapsed && <span className="font-medium whitespace-nowrap">Log out</span>}
                            </button>
                        </li>
                    </ul>
                </nav>
            </aside>
        </>
    );
}
