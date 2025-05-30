'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Earning, UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, type ButtonProps, buttonVariants } from '@/components/ui/button';
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
import { cn } from "@/lib/utils";

interface EarningsData {
    earnings: Earning[];
    availableBalance: number;
    profile: Partial<UserProfile>;
}

const MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND = 100; // KES 100 minimum withdrawal

export default function MyEarningsPage() {
    const { data: session, status } = useSession();
    const { toast } = useToast();
    const [earningsData, setEarningsData] = useState<EarningsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [withdrawalAmount, setWithdrawalAmount] = useState<string>('');

    useEffect(() => {
        const fetchEarnings = async () => {
            if (!session?.user?.id) return;
            
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/user/earnings?userId=${session.user.id}`);
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || `HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setEarningsData(data);
            } catch (err) {
                let message = "Failed to fetch earnings.";
                if (err instanceof Error) {
                    message = err.message;
                }
                setError(message);
                console.error("Error fetching earnings:", err);
            } finally {
                setIsLoading(false);
            }
        };

        if (status === "authenticated") {
        fetchEarnings();
        }
    }, [session?.user?.id, status]);

    const handleWithdraw = async () => {
        if (!earningsData || !session?.user?.id) return;

        const amount = parseFloat(withdrawalAmount);
        if (isNaN(amount) || amount < MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND || amount > earningsData.availableBalance) {
            setDialogError(`Please enter a valid amount between KES ${MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND} and ${earningsData.availableBalance}`);
            return;
        }

        setIsWithdrawing(true);
        setDialogError(null);
        try {
            const response = await fetch('/api/earnings/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: session.user.id,
                    amount,
                    mpesaPhoneNumber: earningsData.profile.mpesaPhoneNumber
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to process withdrawal');
            }

            const result = await response.json();
            toast({
                title: "Withdrawal Initiated",
                description: "Your withdrawal request has been submitted successfully.",
                duration: 5000
            });

            // Refresh earnings data
            const updatedResponse = await fetch(`/api/user/earnings?userId=${session.user.id}`);
            if (updatedResponse.ok) {
                const updatedData = await updatedResponse.json();
                setEarningsData(updatedData);
            }
        } catch (error: any) {
            console.error('Withdrawal error:', error);
            setDialogError(error.message || 'Failed to process withdrawal. Please try again.');
        } finally {
            setIsWithdrawing(false);
        }
    };

    const formatDate = (date: string) => {
        try {
            return format(new Date(date), 'MMM d, yyyy');
        } catch (err) {
            return 'Invalid date';
        }
    };

    const renderEarningRow = (earning: Earning) => (
        <div key={earning.id} className="flex justify-between items-center py-3 border-b last:border-b-0 dark:border-slate-700">
            <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">KES {earning.amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground dark:text-slate-400">From Item ID: {earning.relatedItemId.substring(0,8)}...</p>
                <p className="text-xs text-muted-foreground dark:text-slate-400">Date Available: {earning.createdAt ? formatDate(earning.createdAt) : 'N/A'}</p>
            </div>
            <Badge className={cn(
                "dark:text-gray-300 dark:border-gray-600",
                earning.status === 'AVAILABLE' ? 'bg-secondary text-secondary-foreground' :
                earning.status === 'WITHDRAWN' ? 'text-foreground' :
                'bg-primary text-primary-foreground'
            )}>
                {earning.status.replace(/_/g, ' ')}
            </Badge>
        </div>
    );

    const renderSkeleton = () => (
        <>
         <Card className="mb-6 dark:bg-slate-800 dark:border-slate-700">
                <CardHeader>
                    <Skeleton className="h-5 w-28 mb-1 bg-slate-200 dark:bg-slate-700" />
                    <Skeleton className="h-8 w-40 bg-slate-200 dark:bg-slate-700" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-10 w-48 bg-slate-200 dark:bg-slate-700" />
                </CardContent>
         </Card>
         <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader><Skeleton className="h-6 w-40 bg-slate-200 dark:bg-slate-700" /></CardHeader>
            <CardContent className="space-y-4">
                 {Array.from({ length: 3 }).map((_, i) => (
                     <div key={i} className="flex justify-between items-center py-3 border-b last:border-b-0 dark:border-slate-700">
                        <div className="space-y-1.5">
                            <Skeleton className="h-5 w-20 bg-slate-200 dark:bg-slate-700" />
                            <Skeleton className="h-3 w-32 bg-slate-200 dark:bg-slate-700" />
                             <Skeleton className="h-3 w-24 bg-slate-200 dark:bg-slate-700" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                 ))}
            </CardContent>
         </Card>
        </>
    );

    if (status === 'loading') {
      return <div className="container mx-auto p-4 md:p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">{renderSkeleton()}</div>;
    }
    if (status === 'unauthenticated') {
       return <div className="container mx-auto p-4 md:p-6 text-center bg-slate-50 dark:bg-slate-900 min-h-screen">Please log in to view your earnings.</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 md:py-8">
            <div className="container mx-auto px-4">
                <h1 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-200">My Earnings</h1>
                {isLoading && renderSkeleton()}
                {!isLoading && error && (
                    <Alert variant="destructive" className="mb-6 bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700">
                        <Icons.alertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <AlertTitle className="text-red-700 dark:text-red-300">Error Loading Earnings</AlertTitle>
                        <AlertDescription className="text-red-600 dark:text-red-400">{error}</AlertDescription>
                    </Alert>
                )}
                {!isLoading && !error && earningsData && (
                    <>
                        <Card className="mb-6 shadow-md dark:bg-slate-800 dark:border-slate-700">
                            <CardHeader>
                                <CardDescription className="text-muted-foreground dark:text-slate-400">Available Balance</CardDescription>
                                <CardTitle className="text-3xl text-gray-800 dark:text-gray-200">KES {earningsData.availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Dialog onOpenChange={(open: boolean) => { if(!open) setDialogError(null); }}>
                                    <DialogTrigger asChild>
                                        <Button 
                                            className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-70"
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
                                            <DialogDescription>
                                                Enter the amount you want to withdraw to your M-Pesa account.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="grid gap-4 py-4">
                                            {dialogError && (
                                                <Alert variant="destructive" className="bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700">
                                                    <Icons.alertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                                    <AlertDescription className="text-red-600 dark:text-red-400">{dialogError}</AlertDescription>
                                                </Alert>
                                            )}
                                            <div className="grid gap-2">
                                                <Label htmlFor="amount">Amount (KES)</Label>
                                                <Input
                                                    id="amount"
                                                    type="number"
                                                    min={MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND}
                                                    max={earningsData.availableBalance}
                                                    value={withdrawalAmount}
                                                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                                                    disabled={isWithdrawing}
                                                />
                                                <p className="text-sm text-muted-foreground">
                                                    Minimum withdrawal: KES {MINIMUM_WITHDRAWAL_AMOUNT_FRONTEND}
                                                </p>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <DialogClose asChild>
                                                <button className={buttonVariants({ variant: "outline" })} disabled={isWithdrawing}>Cancel</button>
                                            </DialogClose>
                                            <Button 
                                                onClick={handleWithdraw} 
                                                disabled={isWithdrawing || !withdrawalAmount}
                                            >
                                                {isWithdrawing ? (
                                                    <>
                                                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                                        Processing...
                                                    </>
                                                ) : (
                                                    'Withdraw'
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </CardContent>
                        </Card>

                        <Card className="shadow-md dark:bg-slate-800 dark:border-slate-700">
                            <CardHeader>
                                <CardTitle className="text-xl text-gray-800 dark:text-gray-200">Transaction History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {earningsData.earnings.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-4">No transactions yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {earningsData.earnings.map(renderEarningRow)}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
}
