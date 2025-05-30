import { Inter } from 'next/font/google';
import NextAuthSessionProvider from '@/components/providers/session-provider';
import { NotificationProvider } from '@/components/providers/notification-provider';
import { Footer } from '@/components/layout/footer';
import { Toaster } from '@/components/ui/toaster';
import { registerServiceWorker } from '@/lib/register-sw';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata = {
  title: 'Uza Bidhaa - Kenyan Marketplace',
  description: 'Buy and sell items in Kenya',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (typeof window !== 'undefined') {
    registerServiceWorker();
  }

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/images/web-app-manifest-192x192.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col">
        <NextAuthSessionProvider>
          <NotificationProvider>
            <main className="flex-1">
              {children}
            </main>
            <Footer />
            <Toaster />
          </NotificationProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
