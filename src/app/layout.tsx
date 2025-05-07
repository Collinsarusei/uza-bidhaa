import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import NextAuthSessionProvider from "@/components/providers/session-provider";
import { NotificationProvider } from "@/components/providers/notification-provider"; 
// import { AdminFeesProvider } from "@/components/providers/admin-fees-provider"; // Example for future admin context

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
          <NotificationProvider>
            {/* <AdminFeesProvider> Example for future context */}
              {children} 
            {/* </AdminFeesProvider> */}
            <Toaster />
          </NotificationProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
