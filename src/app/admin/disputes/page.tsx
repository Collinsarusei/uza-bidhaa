// src/app/admin/disputes/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
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
import type { Payment, Item, DisputeRecord, UserProfile } from '@/lib/types'; // Import DisputeRecord
import Link from 'next/link';

// Updated interface to reflect fetching DisputeRecords primarily
interface DisplayDispute extends DisputeRecord {
    paymentDetails?: Payment;
    itemDetails?: Item;
    filedByUser?: Partial<UserProfile>;
    otherPartyUser?: Partial<UserProfile>;
}

export default function AdminDisputesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [disputes, setDisputes] = useState<DisplayDispute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [processingDisputeId, setProcessingDisputeId] = useState<string | null>(null);
    const actionTypeRef = useRef<'release' | 'refund' | null>(null); // Using useRef for action type

    useEffect(() => {
        if (status === 'authenticated') {
            setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth?callbackUrl=/admin/disputes');
        }
    }, [status, router, session]);

    const fetchDisputes = useCallback(async () => {
        if (!isAuthorized) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            // This API endpoint should now return enriched DisputeRecord data
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
            const data: DisplayDispute[] = await response.json();
            setDisputes(data.filter(d => d.status === 'PENDING_ADMIN')); // Only show pending admin review
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load disputes.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        if (isAuthorized === true) {
            fetchDisputes();
        } else if (isAuthorized === false && status === 'authenticated') {
             setError("You are not authorized to view this page.");
             setIsLoading(false);
        }
    }, [isAuthorized, status, fetchDisputes]);


    const handleAdminAction = async (dispute: DisplayDispute, action: 'release' | 'refund') => {
        if (!dispute.paymentId) {
            toast({title: "Error", description: "Payment ID missing for this dispute.", variant: "destructive"});
            return;
        }
        setProcessingDisputeId(dispute.id);
        actionTypeRef.current = action;

        try {
            // These backend APIs should also update the DisputeRecord status
            const response = await fetch(`/api/admin/payments/${dispute.paymentId}/admin-${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disputeId: dispute.id }) // Send disputeId for backend to update
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Failed to ${action} payment.`);
            }
            toast({ title: "Success", description: `Payment ${action === 'release' ? 'released to seller' : 'refunded to buyer'}. Dispute record updated.` });
            fetchDisputes(); // Refresh data
        } catch (err) {
            const message = err instanceof Error ? err.message : `Could not ${action} payment.`;
            toast({ title: "Action Error", description: message, variant: "destructive" });
        } finally {
            setProcessingDisputeId(null);
            actionTypeRef.current = null;
        }
    };
    
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'PPpp');
        } catch {
            return 'Invalid Date String'; // More specific error
        }
    };

    if (status === 'loading' || isAuthorized === null) {
        return (
            <div className="container mx-auto p-6">
                <Skeleton className="h-8 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4 mb-6" />
                <Card><CardHeader><Skeleton className="h-6 w-1/3 mb-2" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
            </div>
        );
    }
    
    if (!isAuthorized) {
         return (
            <div className="container mx-auto p-6">
                 <Alert variant="destructive">
                     <Icons.alertTriangle className="h-4 w-4" />
                     <AlertTitle>Access Denied</AlertTitle>
                     <AlertDescription>You do not have permission to access this page.</AlertDescription>
                 </Alert>
            </div>
         );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <header>
                <h1 className="text-3xl font-bold">Dispute Management</h1>
                <p className="text-muted-foreground">
                    Review and resolve pending disputes between buyers and sellers.
                </p>
            </header>

            {isLoading && (
                <Card>
                    <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full" /></CardContent>
                </Card>
            )}

            {error && (
                <Alert variant="destructive">
                    <Icons.alertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Disputes</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!isLoading && !error && (
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Disputes</CardTitle>
                        <CardDescription>
                            Total: {disputes.length} dispute(s) requiring review.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {disputes.length === 0 ? (
                            <p className="text-muted-foreground">No disputes currently require admin review.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-[150px]">Item</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead className="min-w-[200px]">Description</TableHead>
                                            <TableHead>Filed By</TableHead>
                                            <TableHead>Other Party</TableHead>
                                            <TableHead>Disputed On</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {disputes.map((dispute) => (
                                            <TableRow key={dispute.id}>
                                                <TableCell className="font-medium">
                                                    {dispute.itemDetails?.title || dispute.itemId.substring(0,8)}
                                                    <Link href={`/item/${dispute.itemId}`} target="_blank" className="ml-1 text-xs text-blue-500 hover:underline"> <Icons.externalLink size={12}/> </Link>
                                                </TableCell>
                                                <TableCell>KES {dispute.paymentDetails?.amount.toLocaleString() || 'N/A'}</TableCell>
                                                <TableCell>{dispute.reason.replace(/_/g, ' ')}</TableCell>
                                                <TableCell className="text-xs max-w-xs truncate" title={dispute.description}>{dispute.description}</TableCell>
                                                <TableCell>{dispute.filedByUser?.name || dispute.filedByUserId.substring(0,8)}</TableCell>
                                                <TableCell>{dispute.otherPartyUser?.name || dispute.otherPartyUserId.substring(0,8)}</TableCell>
                                                <TableCell>{formatDate(dispute.createdAt)}</TableCell>
                                                <TableCell className="text-right space-x-2 whitespace-nowrap">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm"
                                                                disabled={processingDisputeId === dispute.id}
                                                            >
                                                                {processingDisputeId === dispute.id && actionTypeRef.current === 'release' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                Release Funds
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Release Funds to Seller?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    For dispute #{dispute.id.substring(0,6)} on item "{dispute.itemDetails?.title || 'N/A'}".<br/>
                                                                    This will transfer KES {dispute.paymentDetails?.amount.toLocaleString()} to {dispute.otherPartyUser?.name || 'seller'}'s balance. This action also resolves the dispute.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel disabled={processingDisputeId === dispute.id}>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleAdminAction(dispute, 'release')} disabled={processingDisputeId === dispute.id}>
                                                                    {processingDisputeId === dispute.id && actionTypeRef.current === 'release' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                                                                disabled={processingDisputeId === dispute.id}
                                                            >
                                                                {processingDisputeId === dispute.id && actionTypeRef.current === 'refund' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                Refund Buyer
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Refund Payment to Buyer?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    For dispute #{dispute.id.substring(0,6)} on item "{dispute.itemDetails?.title || 'N/A'}".<br/>
                                                                    This will mark KES {dispute.paymentDetails?.amount.toLocaleString()} as refunded to {dispute.filedByUser?.name || 'buyer'}. 
                                                                    The financial refund must be processed manually via the payment gateway. This action also resolves the dispute.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel disabled={processingDisputeId === dispute.id}>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleAdminAction(dispute, 'refund')} disabled={processingDisputeId === dispute.id} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                                                    {processingDisputeId === dispute.id && actionTypeRef.current === 'refund' ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                    Confirm Refund
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                    {/* Add button/link to view full dispute details page if needed */}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

