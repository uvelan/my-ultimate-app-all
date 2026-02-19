import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'My Complete Apps',
    description: 'Secure End-to-End Authentication',
};

import ClientLayout from '@/components/layout/ClientLayout';

// ... (Metadata export)

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <ClientLayout>
                    {children}
                </ClientLayout>
                <Toaster position="top-right" />
            </body>
        </html>
    );
}
