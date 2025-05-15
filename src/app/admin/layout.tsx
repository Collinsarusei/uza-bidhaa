// src/app/admin/layout.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import React from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();

  const isAdminUser = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

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
    { href: '/admin/fees', label: 'Fee % Setting', icon: <Icons.settings /> }, 
    { href: '/admin/platform-fees', label: 'Platform Fees Log', icon: <Icons.circleDollarSign /> }, 
    { href: '/admin/withdraw-platform-fees', label: 'Withdraw Fees', icon: <Icons.send /> },
    { href: '/admin/disputes', label: 'Dispute Management', icon: <Icons.shieldAlert /> },
    { href: '/admin/users', label: 'User Management', icon: <Icons.users /> },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-muted/50 p-4 border-r flex flex-col">
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
                 <Icons.layoutGrid className="mr-2 h-4 w-4" /> {/* Corrected Icon */}
                 Back to Marketplace
             </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 bg-background">
        {children}
      </main>
    </div>
  );
}
