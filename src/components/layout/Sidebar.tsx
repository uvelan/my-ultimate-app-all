'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

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
        { name: 'Discover', href: '/dashboard', icon: <HomeIcon /> },
        ...(user?.role === 'ADMIN' ? [
            { name: 'Admin Panel', href: '/admin', icon: <SettingsIcon /> }
        ] : []),
        { name: 'Category', href: '#category', icon: <GridIcon /> },
        { name: 'My Library', href: '#library', icon: <LibraryIcon /> },
        { name: 'Download', href: '#download', icon: <DownloadIcon /> },
        { name: 'Favorite', href: '#favorite', icon: <HeartIcon /> },
    ];

    const bottomItems = [
        { name: 'Setting', href: '#setting', icon: <SettingsIcon /> },
        { name: 'Help', href: '#help', icon: <HelpIcon /> },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={closeMobile}
                />
            )}

            <aside
                className={`
                    fixed left-0 top-0 h-screen bg-white shadow-sm z-50 flex flex-col transition-all duration-300
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                    ${isCollapsed ? 'w-20' : 'w-64'}
                `}
            >
                <div className={`p-8 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    <Link href="/dashboard" className="flex items-center gap-2 text-2xl font-bold tracking-wider text-gray-800 no-underline hover:text-gray-900 truncate">
                        {isCollapsed ? <div className="text-[#1D3430] mx-auto"><GridIcon /></div> : 'My Complete Apps'}
                    </Link>
                    {!isCollapsed && (
                        <button
                            onClick={toggleCollapse}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors hidden md:block"
                        >
                            <ChevronLeftIcon />
                        </button>
                    )}
                </div>

                {/* Collapsed state toggle button (centered) */}
                {isCollapsed && (
                    <div className="flex justify-center mb-2 hidden md:flex">
                        <button
                            onClick={toggleCollapse}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ChevronRightIcon />
                        </button>
                    </div>
                )}

                <nav className="flex-1 px-4 overflow-y-auto no-scrollbar">
                    {!isCollapsed && (
                        <div className="text-xs font-bold text-gray-400 px-4 mb-4 uppercase tracking-wider fade-in">
                            Menu
                        </div>
                    )}

                    <ul className="space-y-1">
                        {menuItems.map((item) => (
                            <li key={item.name}>
                                <Link
                                    href={item.href}
                                    title={isCollapsed ? item.name : ''}
                                    onClick={closeMobile}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${pathname === item.href
                                        ? 'bg-[#1D3430] text-white shadow-md'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-[#1D3430]'
                                        } ${isCollapsed ? 'justify-center' : ''}`}
                                >
                                    <span className={pathname === item.href ? 'text-white' : 'text-gray-400 group-hover:text-[#1D3430]'}>
                                        {item.icon}
                                    </span>
                                    {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {!isCollapsed && <hr className="my-6 border-gray-100" />}
                    {isCollapsed && <div className="my-6" />}

                    <ul className="space-y-1">
                        {bottomItems.map((item) => (
                            <li key={item.name}>
                                <Link
                                    href={item.href}
                                    title={isCollapsed ? item.name : ''}
                                    onClick={closeMobile}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-[#1D3430] transition-all ${isCollapsed ? 'justify-center' : ''}`}
                                >
                                    <span className="text-gray-400 group-hover:text-[#1D3430]">{item.icon}</span>
                                    {!isCollapsed && <span className="font-medium whitespace-nowrap">{item.name}</span>}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <button
                                onClick={logout}
                                title={isCollapsed ? "Log out" : ''}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all text-left ${isCollapsed ? 'justify-center' : ''}`}
                            >
                                <span className="text-gray-400 group-hover:text-red-600">
                                    <LogoutIcon />
                                </span>
                                {!isCollapsed && <span className="font-medium whitespace-nowrap">Log out</span>}
                            </button>
                        </li>
                    </ul>
                </nav>
            </aside>
        </>
    );
}

// Icons
function ChevronLeftIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
}

function ChevronRightIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;
}

function HomeIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
}

function GridIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;
}

function LibraryIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>;
}

function DownloadIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>;
}

function HeartIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
}

function SettingsIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
}

function HelpIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;
}

function LogoutIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;
}
