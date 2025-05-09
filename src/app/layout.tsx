import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import NextAuthSessionProvider from "@/components/providers/session-provider";
import { NotificationProvider } from "@/components/providers/notification-provider"; 
import { Footer } from "@/components/layout/footer"; // Import the Footer

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
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}>
        <NextAuthSessionProvider>
          <NotificationProvider>
            <div className="flex-grow"> {/* Main content wrapper */}
              {children} 
            </div>
            <Footer /> {/* Add Footer here */}
            <Toaster />
          </NotificationProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
