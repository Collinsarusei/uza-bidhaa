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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Updated interface to reflect fetching DisputeRecords primarily
interface DisplayDispute {
  id: string;
  orderId: string;
  paymentId: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  description: string;
  status: 'PENDING' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  filedByUserId: string;
  otherPartyUserId: string;
  filedByUser?: {
    name: string;
    email: string;
  };
  otherPartyUser?: {
    name: string;
    email: string;
  };
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
    const [selectedDispute, setSelectedDispute] = useState<DisplayDispute | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (status === 'authenticated') {
            setIsAuthorized((session?.user as any)?.role === 'ADMIN');
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth?callbackUrl=/admin/disputes');
        }
    }, [status, router, session]);

    const fetchDisputes = async () => {
      try {
        const response = await fetch('/api/admin/disputes', {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch disputes');
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error('Invalid response format from server');
        }
        setDisputes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load disputes');
        setDisputes([]); // Set empty array on error
      } finally {
        setIsLoading(false);
      }
    };

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
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
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

    const handleViewDispute = (dispute: DisplayDispute) => {
        setSelectedDispute(dispute);
    };

    const handleResolveDispute = async (disputeId: string) => {
        setIsUpdating(true);
        try {
            await handleAdminAction(disputes.find(d => d.id === disputeId) as DisplayDispute, 'release');
            setSelectedDispute(null);
        } catch (err) {
            toast({ title: "Error", description: err instanceof Error ? err.message : 'Failed to resolve dispute', variant: "destructive" });
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusBadgeVariant = (status: DisplayDispute['status']) => {
        switch (status) {
            case 'PENDING':
                return 'secondary';
            case 'RESOLVED':
                return 'default';
            case 'CLOSED':
                return 'outline';
            default:
                return 'secondary';
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
        <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
            <header>
                <h1 className="text-2xl md:text-3xl font-bold">Dispute Management</h1>
                <p className="text-sm md:text-base text-muted-foreground">
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
                        <CardTitle>Active Disputes</CardTitle>
                        <CardDescription>
                            Total: {disputes.length} dispute(s)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {disputes.length === 0 ? (
                            <p className="text-muted-foreground">No active disputes to display.</p>
                        ) : (
                            <div className="overflow-x-auto -mx-4 md:mx-0">
                                <div className="inline-block min-w-full align-middle">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Order ID</TableHead>
                                                <TableHead className="whitespace-nowrap">Item</TableHead>
                                                <TableHead className="hidden md:table-cell">Description</TableHead>
                                                <TableHead className="whitespace-nowrap">Status</TableHead>
                                                <TableHead className="whitespace-nowrap">Created</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {disputes.map((dispute) => (
                                                <TableRow key={dispute.id}>
                                                    <TableCell className="whitespace-nowrap">
                                                        {dispute.orderId}
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            {dispute.itemImageUrl && (
                                                                <img
                                                                    src={dispute.itemImageUrl}
                                                                    alt={dispute.itemTitle}
                                                                    className="h-8 w-8 rounded-md object-cover"
                                                                />
                                                            )}
                                                            <span className="truncate max-w-[120px]">
                                                                {dispute.itemTitle}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <div className="max-w-[200px] truncate">
                                                            {dispute.description}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge variant={getStatusBadgeVariant(dispute.status)}>
                                                            {dispute.status.toLowerCase().replace('_', ' ')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {formatDate(dispute.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleViewDispute(dispute)}
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
            )}

            {/* Dispute Dialog */}
            <Dialog open={!!selectedDispute} onOpenChange={() => setSelectedDispute(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Dispute Details</DialogTitle>
                    </DialogHeader>
                    {selectedDispute && (
                        <div className="space-y-4">
                            <div>
                                <Label>Order ID</Label>
                                <p className="text-sm">{selectedDispute.orderId}</p>
                            </div>
                            <div>
                                <Label>Item</Label>
                                <div className="flex items-center gap-2">
                                    {selectedDispute.itemImageUrl && (
                                        <img
                                            src={selectedDispute.itemImageUrl}
                                            alt={selectedDispute.itemTitle}
                                            className="h-12 w-12 rounded-md object-cover"
                                        />
                                    )}
                                    <p className="text-sm">{selectedDispute.itemTitle}</p>
                                </div>
                            </div>
                            <div>
                                <Label>Description</Label>
                                <p className="text-sm whitespace-pre-wrap">{selectedDispute.description}</p>
                            </div>
                            <div>
                                <Label>Status</Label>
                                <Badge variant={getStatusBadgeVariant(selectedDispute.status)}>
                                    {selectedDispute.status.toLowerCase().replace('_', ' ')}
                                </Badge>
                            </div>
                            <div>
                                <Label>Created</Label>
                                <p className="text-sm">{formatDate(selectedDispute.createdAt)}</p>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedDispute(null)}
                                >
                                    Close
                                </Button>
                                {selectedDispute.status === 'PENDING' && (
                                    <Button
                                        onClick={() => handleResolveDispute(selectedDispute.id)}
                                        disabled={isUpdating}
                                    >
                                        {isUpdating ? (
                                            <>
                                                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                                Resolving...
                                            </>
                                        ) : (
                                            <>
                                                <Icons.check className="mr-2 h-4 w-4" />
                                                Resolve Dispute
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

