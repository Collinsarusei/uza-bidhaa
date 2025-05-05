import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import NextAuthSessionProvider from "@/components/providers/session-provider";
import { NotificationProvider } from "@/components/providers/notification-provider"; // Import NotificationProvider

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Uza Bidhaa marketplace',
  description: 'Your one-stop online marketplace',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextAuthSessionProvider>
          {/* Wrap children with NotificationProvider inside SessionProvider */}
          <NotificationProvider>
            {children} 
            <Toaster />
          </NotificationProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
