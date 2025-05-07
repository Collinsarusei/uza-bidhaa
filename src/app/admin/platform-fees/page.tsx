// src/app/admin/platform-fees/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from 'date-fns';
import type { PlatformFeeRecord } from '@/lib/types';
import Link from 'next/link';

interface PlatformFeesData {
    totalBalance: number;
    records: PlatformFeeRecord[];
}

export default function AdminPlatformFeesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [feesData, setFeesData] = useState<PlatformFeesData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

    useEffect(() => {
        // Basic admin authorization check
        if (status === 'authenticated') {
             setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth');
        }
    }, [status, router, session]);

    const fetchPlatformFees = useCallback(async () => {
        if (!isAuthorized) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/platform-fees');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                 if (response.status === 401 || response.status === 403) {
                     setIsAuthorized(false);
                     setError("You are not authorized to view this page.");
                     return;
                 }
                throw new Error(errData.message || `Failed to fetch platform fees: ${response.status}`);
            }
            const data = await response.json();
            setFeesData(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load platform fee data.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        if (isAuthorized === true) {
            fetchPlatformFees();
        } else if (isAuthorized === false && status === 'authenticated') {
            setError("You are not authorized to view this page.");
            setIsLoading(false);
        }
    }, [isAuthorized, status, fetchPlatformFees]);

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'PPpp');
        } catch {
            return 'Invalid Date';
        }
    };

    // Skeleton Loader Component
    const renderSkeleton = () => (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                     <Skeleton className="h-5 w-28 mb-1" />
                     <Skeleton className="h-8 w-40" />
                </CardHeader>
                <CardContent>
                    {/* Maybe a skeleton for a button if there's an action */}
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent><Skeleton className="h-40 w-full" /></CardContent>
             </Card>
        </div>
    );

    // Authorization / Loading States
    if (status === 'loading' || isAuthorized === null) {
        return <div className="container mx-auto p-4 md:p-6">{renderSkeleton()}</div>;
    }
    if (!isAuthorized) {
         return (
             <Alert variant="destructive">
                 <Icons.alertTriangle className="h-4 w-4" />
                 <AlertTitle>Access Denied</AlertTitle>
                 <AlertDescription>You do not have permission to access this page.</AlertDescription>
             </Alert>
         );
    }
    if (isLoading) {
         return <div className="container mx-auto p-4 md:p-6">{renderSkeleton()}</div>;
    }
    if (error) {
        return (
            <Alert variant="destructive">
                <Icons.alertTriangle className="h-4 w-4" />
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Platform Fees</h1>
            <p className="text-muted-foreground">
                Overview of fees collected from successful transactions.
            </p>

            {/* Total Balance Card */}
            <Card>
                <CardHeader>
                    <CardDescription>Total Accumulated Fees</CardDescription>
                    <CardTitle className="text-3xl">
                        KES {feesData?.totalBalance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        This balance represents the total fees collected by the platform.
                    </p>
                    {/* Add withdrawal button/logic here if needed in the future */}
                    {/* <Button disabled>Initiate Fee Withdrawal (Coming Soon)</Button> */}
                </CardContent>
            </Card>

            {/* Fee History Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Fee Collection History</CardTitle>
                    <CardDescription>
                        Individual fee records from completed sales. Total Records: {feesData?.records?.length ?? 0}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {feesData?.records?.length === 0 ? (
                        <p className="text-muted-foreground">No fee records found.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Amount (KES)</TableHead>
                                    <TableHead>Related Item</TableHead>
                                    <TableHead>Related Payment</TableHead>
                                    <TableHead>Seller</TableHead>
                                    <TableHead>Collected On</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {feesData?.records.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell className="font-medium">
                                            {record.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell>
                                             {/* Optional: Link to item if needed */}
                                             <Link href={`/item/${record.relatedItemId}`} className="hover:underline" target="_blank" rel="noopener noreferrer">
                                                 {record.relatedItemId.substring(0, 8)}...
                                             </Link>
                                        </TableCell>
                                        <TableCell>
                                            {/* Optional: Link to payment/dispute page if needed */}
                                            {record.relatedPaymentId.substring(0, 8)}...
                                        </TableCell>
                                        <TableCell>{record.sellerId.substring(0, 8)}...</TableCell>
                                        <TableCell>{formatDate(record.createdAt)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
```