import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider, ThemeInitScript } from '@/contexts/ThemeContext';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Toolbit Admin — Control Panel',
  description: 'Professional admin dashboard for Toolbit AI — manage tools, content, submissions and more.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full">
        {/*
          Theme detection: runs before React hydration to prevent flash of wrong theme.
          Using a Client Component with useServerInsertedHTML to safely inject the script
          into the head during server rendering without triggering React 19's script warnings.
        */}
        <ThemeInitScript />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

