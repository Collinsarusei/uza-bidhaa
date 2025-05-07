// src/app/admin/disputes/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Payment, Item } from '@/lib/types';

interface DisputedPayment extends Payment {
    itemDetails?: Partial<Item>;
    buyerName?: string;
    sellerName?: string;
}

export default function AdminDisputesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [payments, setPayments] = useState<DisputedPayment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [processingPaymentId, setProcessingPaymentId] = useState<string | null>(null);

    useEffect(() => {
        if (status === 'authenticated') {
            setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth');
        }
    }, [status, router, session]);

    const fetchDisputedPayments = useCallback(async () => {
        if (!isAuthorized) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/disputes');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                 if (response.status === 401 || response.status === 403) {
                     setIsAuthorized(false);
                     setError("You are not authorized to view this page.");
                     return;
                 }
                throw new Error(errData.message || `Failed to fetch disputes: ${response.status}`);
            }
            const data = await response.json();
            setPayments(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load disputed payments.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        if (isAuthorized === true) {
            fetchDisputedPayments();
        } else if (isAuthorized === false && status === 'authenticated') {
             setError("You are not authorized to view this page.");
             setIsLoading(false);
        }
    }, [isAuthorized, status, fetchDisputedPayments]);


    const handleAdminAction = async (paymentId: string, action: 'release' | 'refund') => {
        setProcessingPaymentId(paymentId);
        try {
            const response = await fetch(`/api/admin/payments/${paymentId}/admin-${action}`, {
                method: 'POST',
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Failed to ${action} payment.`);
            }
            toast({ title: "Success", description: `Payment ${action === 'release' ? 'released to seller' : 'refunded to buyer'}.` });
            // Refresh data
            fetchDisputedPayments();
        } catch (err) {
            const message = err instanceof Error ? err.message : `Could not ${action} payment.`;
            toast({ title: "Action Error", description: message, variant: "destructive" });
        } finally {
            setProcessingPaymentId(null);
        }
    };
    
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'PPpp');
        } catch {
            return 'Invalid Date';
        }
    };


    if (status === 'loading' || isAuthorized === null) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4 mb-4" />
                <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
            </div>
        );
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

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dispute Management</h1>
            <p className="text-muted-foreground">
                Review payments that are disputed or overdue for buyer confirmation (older than 7 days).
            </p>

            {isLoading && (
                <Card>
                    <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full" /></CardContent>
                </Card>
            )}

            {error && (
                <Alert variant="destructive">
                    <Icons.alertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!isLoading && !error && (
                <Card>
                    <CardHeader>
                        <CardTitle>Payments Requiring Review</CardTitle>
                        <CardDescription>
                            Total: {payments.length} payment(s)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {payments.length === 0 ? (
                            <p className="text-muted-foreground">No payments currently require admin review.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Amount (KES)</TableHead>
                                        <TableHead>Buyer</TableHead>
                                        <TableHead>Seller</TableHead>
                                        <TableHead>Paid On</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {payments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell className="font-medium">
                                                {payment.itemDetails?.title || payment.itemId.substring(0,8)}
                                                {payment.isDisputed && <Badge variant="destructive" className="ml-2">Disputed</Badge>}
                                            </TableCell>
                                            <TableCell>{payment.amount.toLocaleString()}</TableCell>
                                            <TableCell>{payment.buyerName || payment.buyerId.substring(0,8)}</TableCell>
                                            <TableCell>{payment.sellerName || payment.sellerId.substring(0,8)}</TableCell>
                                            <TableCell>{formatDate(payment.createdAt)}</TableCell>
                                            <TableCell><Badge variant={payment.status === 'disputed' ? 'destructive' : 'secondary'}>{payment.status.replace(/_/g, ' ')}</Badge></TableCell>
                                            <TableCell className="space-x-2">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm"
                                                            disabled={processingPaymentId === payment.id}
                                                        >
                                                            {processingPaymentId === payment.id && actionType.current === 'release' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            Release
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Release Funds to Seller?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will transfer KES {payment.amount.toLocaleString()} to {payment.sellerName || `seller ${payment.sellerId.substring(0,8)}`}'s balance for item "{payment.itemDetails?.title || payment.itemId.substring(0,8)}". This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={processingPaymentId === payment.id}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => {actionType.current = 'release'; handleAdminAction(payment.id, 'release')}} disabled={processingPaymentId === payment.id}>
                                                                {processingPaymentId === payment.id && actionType.current === 'release' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                Confirm Release
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>

                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            variant="destructive" 
                                                            size="sm"
                                                            disabled={processingPaymentId === payment.id}
                                                        >
                                                             {processingPaymentId === payment.id && actionType.current === 'refund' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            Refund
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Refund Payment to Buyer?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will mark KES {payment.amount.toLocaleString()} for item "{payment.itemDetails?.title || payment.itemId.substring(0,8)}" as refunded to {payment.buyerName || `buyer ${payment.buyerId.substring(0,8)}`}.
                                                                You will need to manually process the financial refund via Paystack dashboard. This database action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={processingPaymentId === payment.id}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => {actionType.current = 'refund'; handleAdminAction(payment.id, 'refund')}} disabled={processingPaymentId === payment.id} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                                {processingPaymentId === payment.id && actionType.current === 'refund' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                Confirm Refund
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// Helper ref to manage action type for spinner display in AlertDialog
// This is a bit of a workaround for conditional spinner in a shared component instance.
// In a more complex scenario, consider separate state or component composition.
const actionType = { current: null as 'release' | 'refund' | null };
