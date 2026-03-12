import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ 
    subsets: ['latin'],
    variable: '--font-body',
});

const outfit = Outfit({ 
    subsets: ['latin'],
    variable: '--font-display',
});

export const metadata: Metadata = {
    title: 'My Complete Apps',
    description: 'Secure End-to-End Authentication',
};

import ClientLayout from '@/components/layout/ClientLayout';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${outfit.variable} font-sans antialiased bg-background text-text-primary`}>
                <ClientLayout>
                    {children}
                </ClientLayout>
                <Toaster position="top-right" />
            </body>
        </html>
    );
}
