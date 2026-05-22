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

import { ThemeProvider } from '@/components/ThemeProvider';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.variable} ${outfit.variable} font-sans antialiased bg-background text-text-primary`}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    <ClientLayout>
                        {children}
                    </ClientLayout>
                    <Toaster position="top-right" />
                </ThemeProvider>
            </body>
        </html>
    );
}
