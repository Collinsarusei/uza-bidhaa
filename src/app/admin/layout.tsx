// src/app/admin/layout.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import React from 'react';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdminUser = (session?.user as any)?.role === 'ADMIN';

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated' || !isAdminUser) {
      router.replace('/dashboard'); 
    }
  }, [status, isAdminUser, router]);

  if (status === 'loading' || (status === 'authenticated' && !isAdminUser)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.spinner className="h-10 w-10 animate-spin" />
      </div>
    );
  }
   if (!isAdminUser && status === 'authenticated') {
     return (
        <div className="flex h-screen items-center justify-center">
             <p>Access Denied. Redirecting...</p>
        </div>
     );
   }

  const navItems = [
    { href: '/admin', label: 'Dashboard', icon: <Icons.layoutGrid /> },
    { href: '/admin/fee-rules', label: 'Fee % Setting', icon: <Icons.settings /> }, 
    { href: '/admin/platform-fees', label: 'Platform Fees Log', icon: <Icons.circleDollarSign /> }, 
    { href: '/admin/withdraw-platform-fees', label: 'Withdraw Fees', icon: <Icons.send /> },
    { href: '/admin/disputes', label: 'Dispute Management', icon: <Icons.shieldAlert /> },
    { href: '/admin/users', label: 'User Management', icon: <Icons.users /> },
    { href: '/admin/contact-messages', label: 'Contact Messages', icon: <Icons.messageSquare /> },
  ];

  const NavContent = () => (
    <>
      <div className="mb-6">
        <Link href="/dashboard" className="text-lg font-semibold flex items-center gap-2 text-primary hover:underline">
          <Icons.arrowLeft className="h-5 w-5" />
          Back to Main Site
        </Link>
      </div>
      <nav className="flex-grow">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} passHref>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={cn(
                    "w-full justify-start",
                    pathname === item.href && "font-semibold"
                  )}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.icon && React.cloneElement(item.icon as React.ReactElement, { className: "mr-2 h-4 w-4" })}
                  {item.label}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto">
        <Button 
          variant="default" 
          className="w-full bg-orange-500 hover:bg-orange-600 text-white" 
          onClick={() => router.push('/dashboard')}
        >
          <Icons.layoutGrid className="mr-2 h-4 w-4" />
          Back to Marketplace
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile Menu */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden">
              <Icons.menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-4">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-muted/50 p-4 border-r flex-col">
        <NavContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6 bg-background">
        <div className="lg:hidden h-16" /> {/* Spacer for mobile header */}
        {children}
      </main>
    </div>
  );
}
