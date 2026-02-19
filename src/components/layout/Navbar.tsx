'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';

export default function Navbar() {
    const { user, logout } = useAuth();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <nav className="navbar navbar-expand-lg navbar-dark bg-transparent mb-4">
            <div className="container">
                <Link href="/" className="navbar-brand fw-bold">
                    AuthSystem
                </Link>
                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#navbarNav"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="navbarNav">
                    <ul className="navbar-nav ms-auto align-items-center">
                        {user ? (
                            <>
                                <li className="nav-item">
                                    <span className="nav-link text-white">Welcome, {user.name}</span>
                                </li>
                                {user.role === 'ADMIN' && (
                                    <li className="nav-item">
                                        <Link href="/admin" className="nav-link text-white">
                                            Admin
                                        </Link>
                                    </li>
                                )}
                                <li className="nav-item">
                                    <Link href="/dashboard" className="nav-link text-white">
                                        Dashboard
                                    </Link>
                                </li>
                                <li className="nav-item ms-2">
                                    <button onClick={logout} className="btn btn-outline-light btn-sm">
                                        Logout
                                    </button>
                                </li>
                            </>
                        ) : (
                            <>
                                <li className="nav-item">
                                    <Link href="/login" className="nav-link text-white">
                                        Login
                                    </Link>
                                </li>
                                <li className="nav-item ms-2">
                                    <Link href="/register" className="btn btn-light btn-sm fw-bold">
                                        Register
                                    </Link>
                                </li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
        </nav>
    );
}
