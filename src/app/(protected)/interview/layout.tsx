'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Compass, MonitorPlay, Layers, ArrowLeft } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', href: '/interview', icon: BookOpen },
    { name: 'Explore', href: '/interview/explore', icon: Compass },
    { name: 'Mock Interview', href: '/interview/mock', icon: MonitorPlay },
    { name: 'Flashcards', href: '/interview/flashcards', icon: Layers },
    { name: 'Manage', href: '/interview/manage', icon: Layers }, // You can use Settings icon here, but using Layers to avoid adding imports
  ];

  return (
    <ProtectedRoute>
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-200 dark:bg-gray-900/80 dark:border-gray-800 backdrop-blur-md">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4 md:gap-8">
              <div className="flex items-center gap-1 sm:gap-2">
                <Link href="/dashboard" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors" title="Back to Dashboard">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1 hidden sm:block"></div>
                <Link href="/interview" className="flex items-center gap-2 pl-1 sm:pl-0">
                  <div className="flex items-center justify-center w-8 h-8 text-white bg-blue-600 rounded-lg">
                    <MonitorPlay className="w-5 h-5" />
                  </div>
                  <span className="font-bold tracking-tight text-gray-900 dark:text-white hidden sm:block md:block">InterviewPrep</span>
                </Link>
              </div>
              
              <nav className="hidden space-x-1 md:flex">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8">
        {children}
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 z-40 w-full bg-white border-t border-gray-200 md:hidden dark:bg-gray-900 dark:border-gray-800 pb-safe">
        <div className="flex justify-around p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center p-2 rounded-lg ${
                  isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <item.icon className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
    </ProtectedRoute>
  );
}
