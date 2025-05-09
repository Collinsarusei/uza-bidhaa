'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Earning, UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EarningsData {
    earnings: Earning[];
    availableBalance: number;
    profile: Partial<UserProfile>;
}

const MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND = 100; // KES 100, align with backend

export default function MyEarningsPage() {
    const { data: session, status } = useSession();
    const { toast } = useToast();
    const [earningsData, setEarningsData] = useState<EarningsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawalInputAmount, setWithdrawalInputAmount] = useState<string>("");
    const [dialogError, setDialogError] = useState<string | null>(null);


    useEffect(() => {
        const fetchEarnings = async () => {
            if (status !== 'authenticated' || !session?.user?.id) {
                setIsLoading(false);
                return; 
            }
            setIsLoading(true);
            setError(null);
            try {
                console.log("MyEarnings: Fetching earnings...");
                const response = await fetch(`/api/user/earnings`); 
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || `HTTP error! status: ${response.status}`);
                }
                const data: EarningsData = await response.json();
                console.log(`MyEarnings: Fetched ${data.earnings?.length ?? 0} earning records, Balance: ${data.availableBalance}`);
                setEarningsData(data);
                // Set initial withdrawal amount to full balance if available, or empty
                setWithdrawalInputAmount(data.availableBalance > 0 ? data.availableBalance.toString() : "");
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to fetch your earnings.';
                setError(message);
                console.error("Error fetching earnings:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchEarnings();
    }, [status, session?.user?.id]);

    const handleWithdraw = async () => {
        setDialogError(null); // Clear previous dialog errors
        if (!earningsData || earningsData.availableBalance <= 0) {
            toast({ title: "No Funds", description: "No available balance to withdraw.", variant: "destructive" });
            return;
        }
        if (!earningsData.profile.mpesaPhoneNumber) {
             toast({ title: "M-Pesa Number Missing", description: "Please add your M-Pesa payout number in your profile first.", variant: "destructive" });
             return;
        }

        const amountToWithdraw = parseFloat(withdrawalInputAmount);

        if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
            setDialogError("Please enter a valid positive amount to withdraw.");
            return;
        }
        if (amountToWithdraw < MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND) {
            setDialogError(`Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND}.`);
            return;
        }
        if (amountToWithdraw > earningsData.availableBalance) {
            setDialogError("Withdrawal amount cannot exceed your available balance.");
            return;
        }

        setIsWithdrawing(true);
        try {
            console.log(`MyEarnings: Initiating withdrawal of KES ${amountToWithdraw}...`);
            const response = await fetch('/api/payouts/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amountToWithdraw }) // Send the specific amount
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Failed to initiate withdrawal.');
            }
            console.log(`MyEarnings: Withdrawal initiated successfully for KES ${amountToWithdraw}.`);
            toast({ title: "Withdrawal Initiated", description: `KES ${amountToWithdraw.toLocaleString()} is being sent to your M-Pesa. It may take a few moments.` });
            
            // Update local state optimistically
            setEarningsData(prev => prev ? ({ 
                ...prev, 
                availableBalance: prev.availableBalance - amountToWithdraw, 
                // Note: Updating individual earnings status to 'withdrawal_pending' would be more complex here
                // as we don't know which earnings comprise the withdrawn amount. 
                // A full refetch or more granular backend response might be needed for perfect accuracy.
            }) : null);
            setWithdrawalInputAmount( (earningsData.availableBalance - amountToWithdraw) > 0 ? (earningsData.availableBalance - amountToWithdraw).toString() : "")
            // Close dialog - find a better way if DialogClose isn't directly usable here
            document.getElementById('close-withdraw-dialog')?.click(); 

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initiate withdrawal.';
            console.error("Withdrawal Error:", err);
            // Show error in dialog or as toast
            setDialogError(message);
            // toast({ title: "Withdrawal Error", description: message, variant: "destructive" });
        } finally {
            setIsWithdrawing(false);
        }
    };

    const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return 'N/A';
        try { return format(new Date(dateString), 'PP'); } 
        catch { return 'Invalid Date'; }
    };

    const renderEarningRow = (earning: Earning) => (
        <div key={earning.id} className="flex justify-between items-center py-3 border-b last:border-b-0">
            <div>
                <p className="font-medium">KES {earning.amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">From Item ID: {earning.relatedItemId.substring(0,8)}...</p>
                <p className="text-xs text-muted-foreground">Date Available: {formatDate(earning.createdAt)}</p>
            </div>
            <Badge variant={earning.status === 'available' ? 'secondary' : earning.status === 'withdrawn' ? 'outline' : 'secondary'}>
                {earning.status.replace(/_/g, ' ')}
            </Badge>
        </div>
    );

    const renderSkeleton = () => (
        <>
         <Card className="mb-6">
                <CardHeader>
                    <Skeleton className="h-5 w-28 mb-1" />
                    <Skeleton className="h-8 w-40" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-48" />
                </CardContent>
         </Card>
         <Card>
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent className="space-y-4">
                 {Array.from({ length: 3 }).map((_, i) => (
                     <div key={i} className="flex justify-between items-center py-3 border-b last:border-b-0">
                        <div className="space-y-1.5">
                            <Skeleton className="h-5 w-20" />
                            <Skeleton className="h-3 w-32" />
                             <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                 ))}
            </CardContent>
         </Card>
        </>
    );

    if (status === 'loading') {
      return <div className="container mx-auto p-4 md:p-6">{renderSkeleton()}</div>;
    }
    if (status === 'unauthenticated') {
       return <div className="container mx-auto p-4 md:p-6 text-center">Please log in to view your earnings.</div>;
    }

    return (
        <div className="container mx-auto p-4 md:p-6">
            <h1 className="text-2xl font-semibold mb-6">My Earnings</h1>
            {isLoading && renderSkeleton()}
            {!isLoading && error && (
                <Alert variant="destructive" className="mb-6">
                    <Icons.alertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Earnings</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {!isLoading && !error && earningsData && (
                 <>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardDescription>Available Balance</CardDescription>
                            <CardTitle className="text-3xl">KES {earningsData.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
                        </CardHeader>
                         <CardContent>
                             <Dialog onOpenChange={(open) => { if(!open) setDialogError(null); }}>
                                 <DialogTrigger asChild>
                                      <Button 
                                        disabled={earningsData.availableBalance < MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND || isWithdrawing || !earningsData.profile.mpesaPhoneNumber}
                                      >
                                          {isWithdrawing && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> }
                                          <Icons.circleDollarSign className={`mr-2 h-4 w-4 ${isWithdrawing ? 'hidden' : ''}`} />
                                          Withdraw Funds
                                      </Button>
                                 </DialogTrigger>
                                 <DialogContent>
                                     <DialogHeader>
                                         <DialogTitle>Withdraw Funds</DialogTitle>
                                         <DialogDescription className="pt-2">
                                             Enter amount to withdraw to M-Pesa: {earningsData.profile.mpesaPhoneNumber || '[Not Set]'}.
                                             {!earningsData.profile.mpesaPhoneNumber && <p className='text-destructive text-sm pt-1'> Please set your M-Pesa number in your profile first.</p>}
                                             <p className="text-sm text-muted-foreground pt-1">Available: KES {earningsData.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                         </DialogDescription>
                                     </DialogHeader>
                                     <div className="grid gap-4 py-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="withdrawalAmount">Amount (KES)</Label>
                                            <Input 
                                                id="withdrawalAmount"
                                                type="number"
                                                value={withdrawalInputAmount}
                                                onChange={(e) => setWithdrawalInputAmount(e.target.value)}
                                                placeholder={`Min ${MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND}, Max ${earningsData.availableBalance}`}
                                                min={MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND.toString()}
                                                max={earningsData.availableBalance.toString()}
                                                step="0.01"
                                                disabled={isWithdrawing || !earningsData.profile.mpesaPhoneNumber}
                                            />
                                        </div>
                                        {dialogError && (
                                            <Alert variant="destructive" className="mt-2">
                                                <Icons.alertTriangle className="h-4 w-4" />
                                                <AlertDescription>{dialogError}</AlertDescription>
                                            </Alert>
                                        )}
                                     </div>
                                     <DialogFooter>
                                         <DialogClose asChild id="close-withdraw-dialog">
                                             <Button type="button" variant="secondary" disabled={isWithdrawing}>Cancel</Button>
                                         </DialogClose>
                                         <Button 
                                             type="button" 
                                             onClick={handleWithdraw} 
                                             disabled={isWithdrawing || !earningsData.profile.mpesaPhoneNumber || earningsData.availableBalance < MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND}
                                         >
                                            {isWithdrawing && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                                             Confirm Withdrawal
                                         </Button>
                                     </DialogFooter>
                                 </DialogContent>
                             </Dialog>
                            {!earningsData.profile.mpesaPhoneNumber && (
                                <p className="text-sm text-destructive mt-2">Please set your M-Pesa number in your profile to enable withdrawals.</p>
                             )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Earnings History</CardTitle>
                            <CardDescription>Record of funds made available to your balance.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {earningsData.earnings.length === 0 && (
                                <p className="text-sm text-muted-foreground">No earnings recorded yet.</p>
                             )}
                             {earningsData.earnings.length > 0 && (
                                 <div className="space-y-1">
                                     {earningsData.earnings.map(renderEarningRow)}
                                 </div>
                             )}
                        </CardContent>
                    </Card>
                 </>
            )}
            
        </div>
    );
}
