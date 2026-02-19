import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

// Mock Notifications
const MOCK_NOTIFICATIONS = [
    { id: 1, text: 'New login from Chrome on Windows', time: '2 min ago', read: false },
    { id: 2, text: 'Your password was changed successfully', time: '1 hour ago', read: false },
    { id: 3, text: 'Welcome to the new dashboard!', time: '1 day ago', read: true },
];

export default function Header() {
    const { user, logout } = useAuth();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const profileDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
                setShowProfileMenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="flex justify-between items-center mb-2 pt-2 relative gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800">My Complete Apps</h1>
            </div>
            {/* User Profile & Notifications */}
            <div className="flex items-center gap-4">
                {/* User Profile Dropdown */}
                <div className="relative" ref={profileDropdownRef}>
                    <div
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                        <div className="w-10 h-10 rounded-full bg-yellow-200 overflow-hidden border-2 border-white shadow-sm flex items-center justify-center text-[#1D3430] font-bold">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700 text-sm hidden sm:block">{user?.name || 'User'}</span>
                            <ChevronDownIcon />
                        </div>
                    </div>

                    {/* Profile Menu */}
                    {showProfileMenu && (
                        <div className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-2">
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors text-left"
                                >
                                    <LogoutIcon />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notification Bell */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors ${showNotifications ? 'bg-gray-100 text-gray-900' : ''}`}
                    >
                        <BellIcon />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                    </button>

                    {/* Dropdown Menu */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-gray-50 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-800">Notifications</h3>
                                <span className="text-xs text-[#1D3430] bg-green-50 px-2 py-1 rounded-full font-medium">3 New</span>
                            </div>
                            <div className="max-h-96 overflow-y-auto">
                                {MOCK_NOTIFICATIONS.map((notif) => (
                                    <div key={notif.id} className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0 ${!notif.read ? 'bg-blue-50/30' : ''}`}>
                                        <p className="text-sm text-gray-700 leading-snug mb-1">{notif.text}</p>
                                        <p className="text-xs text-gray-400">{notif.time}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 text-center border-t border-gray-50">
                                <button className="text-xs font-semibold text-[#1D3430] hover:underline">Mark all as read</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

// Icons
function ChevronDownIcon() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
}

function SearchIcon() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
}

function BellIcon() {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-gray-800"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>;
}

function LogoutIcon() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;
}
