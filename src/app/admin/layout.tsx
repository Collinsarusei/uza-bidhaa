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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();

  // Placeholder for admin check. Replace with actual role verification.
  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  useEffect(() => {
    if (status === 'loading') return; // Don't do anything while loading
    if (status === 'unauthenticated' || !isAdmin) {
      router.replace('/dashboard'); // Or your login page
    }
  }, [status, isAdmin, router]);

  if (status === 'loading' || (status === 'authenticated' && !isAdmin)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Icons.spinner className="h-10 w-10 animate-spin" />
      </div>
    );
  }
   if (!isAdmin && status === 'authenticated') {
     return (
        <div className="flex h-screen items-center justify-center">
             <p>Access Denied. Redirecting...</p>
        </div>
     );
   }


  const navItems = [
    { href: '/admin/fees', label: 'Fee Management', icon: <Icons.circleDollarSign /> },
    // Add more admin navigation items here
    // { href: '/admin/users', label: 'User Management', icon: <Icons.user /> },
    // { href: '/admin/reports', label: 'Reports', icon: <Icons.file /> },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-muted/50 p-4 border-r flex flex-col">
        <div className="mb-6">
          <Link href="/dashboard" className="text-lg font-semibold flex items-center gap-2">
            <Icons.arrowLeft className="h-5 w-5" />
            Back to Site
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
                    {item.icon && React.cloneElement(item.icon, { className: "mr-2 h-4 w-4" })}
                    {item.label}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto">
             <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
                 <Icons.home className="mr-2 h-4 w-4" />
                 Main Dashboard
             </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 bg-background">
        {children}
      </main>
    </div>
  );
}
