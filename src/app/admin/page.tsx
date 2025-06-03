'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons'; // Assuming Icons is correctly set up
import React from 'react';
import { ArrowRight } from 'lucide-react'; // Using lucide-react for a common icon

// Define the type for admin sections for better type safety
interface AdminSection {
    href: string;
    label: string;
    description: string;
    icon: React.ReactNode; // Use ReactNode for flexibility
}

const adminSections: AdminSection[] = [
    {
        href: '/admin/fee-rules',
        label: 'Fee Settings',
        description: "Configure platform transaction fee percentages.",
        icon: <Icons.settings className="h-6 w-6" />
    },
    {
        href: '/admin/platform-fees',
        label: 'Platform Earnings',
        description: "View accumulated platform earnings and financial summaries.",
        icon: <Icons.circleDollarSign className="h-6 w-6" />
    },
    {
        href: '/admin/disputes',
        label: 'Dispute Management',
        description: "Review and manage user disputes and order issues.",
        icon: <Icons.shieldAlert className="h-6 w-6" /> // Keep existing icon
    },
    {
        href: '/admin/users',
        label: 'User Management',
        description: "View, manage, and monitor platform users.", // Added monitor
        icon: <Icons.users className="h-6 w-6" /> // Keep existing icon
    },
    // Example of adding more sections cleanly
    // {
    //     href: '/admin/items',
    //     label: 'Item Management',
    //     description: "Review and manage listings on the platform.",
    //     icon: <Icons.package className="h-6 w-6" /> // Example: Package icon
    // },
    // {
    //     href: '/admin/reports',
    //     label: 'Platform Reports',
    //     description: 'Generate and view platform activity reports.',
    //     icon: <Icons.lineChart className="h-6 w-6" /> // Example: Chart icon
    // },
];

export default function AdminDashboardPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
                <p className="mt-2 text-base md:text-lg text-muted-foreground">
                    Manage platform settings, users, finances, and operations.
                </p>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {adminSections.map((section) => (
                    <Link href={section.href} key={section.href} passHref legacyBehavior>
                        <a className="group block rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 ease-in-out hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:border-gray-700 dark:hover:bg-gray-800/50">
                            <Card className="flex h-full flex-col border-0 bg-transparent p-0 shadow-none group-hover:bg-transparent">
                                <CardHeader className="flex flex-row items-start justify-between space-x-4 p-4 md:p-5">
                                    <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20">
                                         {section.icon}
                                    </div>
                                     <ArrowRight className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                                </CardHeader>
                                <CardContent className="flex flex-grow flex-col px-4 md:px-5 pb-4 md:pb-5 pt-0">
                                     <CardTitle className="mb-1 text-base md:text-lg font-semibold tracking-tight group-hover:text-primary">
                                        {section.label}
                                    </CardTitle>
                                    <CardDescription className="text-xs md:text-sm text-muted-foreground">
                                        {section.description}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </a>
                    </Link>
                ))}
            </div>
        </div>
    );
}