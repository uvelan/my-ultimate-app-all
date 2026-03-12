import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { Typography } from '@/components/ui/Typography';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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
        <header className="flex justify-between items-center mb-space-2 pt-space-2 relative gap-space-4">
            <div className="flex-1">
                <Typography variant="h1" className="text-text-primary hidden sm:block">
                    Dashboard
                </Typography>
            </div>
            
            <div className="flex items-center gap-space-4">
                {/* Notification Bell */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={cn(
                            "relative p-space-2 text-text-secondary hover:bg-background-muted rounded-radius-full transition-premium",
                            showNotifications && "bg-background-muted text-text-primary"
                        )}
                    >
                        <Bell className="h-5 w-5" />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-background-surface animate-pulse"></span>
                    </button>

                    {/* Dropdown Menu */}
                    {showNotifications && (
                        <div className="absolute right-0 mt-space-3 w-80 bg-background-surface rounded-radius-lg shadow-shadow-xl border border-border z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-premium">
                            <div className="p-space-4 border-b border-border flex justify-between items-center">
                                <Typography variant="small" className="font-semibold">Notifications</Typography>
                                <Badge variant="success">3 New</Badge>
                            </div>
                            <div className="max-h-96 overflow-y-auto no-scrollbar">
                                {MOCK_NOTIFICATIONS.map((notif) => (
                                    <div key={notif.id} className={cn(
                                        "p-space-4 hover:bg-background-muted transition-premium cursor-pointer border-b border-border last:border-0",
                                        !notif.read && "bg-primary/5"
                                    )}>
                                        <Typography variant="small" className="leading-snug mb-space-1 text-text-primary">{notif.text}</Typography>
                                        <Typography variant="caption" className="text-text-muted">{notif.time}</Typography>
                                    </div>
                                ))}
                            </div>
                            <div className="p-space-3 text-center border-t border-border">
                                <button className="text-caption font-semibold text-primary hover:underline">Mark all as read</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* User Profile Dropdown */}
                <div className="relative" ref={profileDropdownRef}>
                    <div
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="flex items-center gap-space-3 cursor-pointer hover:bg-background-muted p-space-1 pr-space-2 rounded-radius-full transition-premium"
                    >
                        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 shadow-shadow-sm flex items-center justify-center text-primary font-bold text-small">
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex items-center gap-space-2">
                            <Typography variant="small" className="font-medium text-text-secondary hidden md:block">
                                {user?.name || 'User'}
                            </Typography>
                            <ChevronDown className={cn("h-4 w-4 text-text-muted transition-premium", showProfileMenu && "rotate-180")} />
                        </div>
                    </div>

                    {/* Profile Menu */}
                    {showProfileMenu && (
                        <div className="absolute right-0 mt-space-3 w-48 bg-background-surface rounded-radius-lg shadow-shadow-xl border border-border z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-premium">
                            <div className="p-space-2">
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-space-3 px-space-4 py-space-2 text-small text-text-secondary hover:bg-error/5 hover:text-error rounded-radius-md transition-premium text-left"
                                >
                                    <LogOut className="h-4 w-4" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
