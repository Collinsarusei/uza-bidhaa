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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

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
    const [selectedFee, setSelectedFee] = useState<PlatformFeeRecord | null>(null);

    useEffect(() => {
        // Basic admin authorization check
        if (status === 'authenticated') {
             setIsAuthorized((session?.user as any)?.role === 'ADMIN');
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
            const response = await fetch('/api/admin/platform-fees', {
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
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

    const formatDate = (dateString: string | Date | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
            return format(date, 'PPpp');
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

    const handleViewFee = (fee: PlatformFeeRecord) => {
        setSelectedFee(fee);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
            <header>
                <h1 className="text-2xl md:text-3xl font-bold">Platform Fees</h1>
                <p className="text-sm md:text-base text-muted-foreground">
                    View and manage platform fees from transactions.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Platform Fees Summary</CardTitle>
                    <CardDescription>
                        Total Fees: KES {feesData?.totalBalance?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {feesData?.records?.length === 0 ? (
                        <p className="text-muted-foreground">No platform fees to display.</p>
                    ) : (
                        <div className="overflow-x-auto -mx-4 md:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="whitespace-nowrap">Order ID</TableHead>
                                            <TableHead className="whitespace-nowrap">Amount</TableHead>
                                            <TableHead className="hidden md:table-cell">Description</TableHead>
                                            <TableHead className="whitespace-nowrap">Date</TableHead>
                                            <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {feesData?.records.map((fee) => (
                                            <TableRow key={fee.id}>
                                                <TableCell className="whitespace-nowrap">
                                                    {fee.relatedPaymentId}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    KES {fee.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <div className="max-w-[200px] truncate">
                                                        Platform fee from sale
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {formatDate(fee.createdAt)}
                                                </TableCell>
                                                <TableCell className="text-right whitespace-nowrap">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleViewFee(fee)}
                                                    >
                                                        <Icons.eye className="h-4 w-4" />
                                                        <span className="sr-only">View</span>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Fee Dialog */}
            <Dialog open={!!selectedFee} onOpenChange={() => setSelectedFee(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Fee Details</DialogTitle>
                    </DialogHeader>
                    {selectedFee && (
                        <div className="space-y-4">
                            <div>
                                <Label>Payment ID</Label>
                                <p className="text-sm">{selectedFee.relatedPaymentId}</p>
                            </div>
                            <div>
                                <Label>Amount</Label>
                                <p className="text-sm">
                                    KES {selectedFee.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </p>
                            </div>
                            <div>
                                <Label>Description</Label>
                                <p className="text-sm whitespace-pre-wrap">Platform fee from sale</p>
                            </div>
                            <div>
                                <Label>Date</Label>
                                <p className="text-sm">{formatDate(selectedFee.createdAt)}</p>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedFee(null)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
