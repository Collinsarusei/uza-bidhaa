'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Payment, Item } from '@/lib/types'; 
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import Link from 'next/link';

interface SellerTransactionForDispute extends Payment {
    itemDetails?: Partial<Pick<Item, 'title' | 'mediaUrls'> >;
}

const sellerDisputeReasons = [
    { value: "payment_not_released_buyer_confirmed", label: "Buyer confirmed receipt, funds not in earnings" },
    { value: "payment_not_released_delivery_proof", label: "Item delivered (have proof), funds not released" },
    { value: "other_seller", label: "Other payment issue (Please specify below)" },
];

function FileSellerDisputeForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status: authStatus } = useSession();

  const [transactions, setTransactions] = useState<SellerTransactionForDispute[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>(""); // Payment ID
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(true);

  useEffect(() => {
    const fetchSellerTransactions = async () => {
      if (authStatus !== 'authenticated' || !session?.user?.id) {
        setIsFetchingTransactions(false);
        return;
      }
      setIsFetchingTransactions(true);
      try {
        const response = await fetch(`/api/user/sales-for-dispute`); // Updated API endpoint
        if (!response.ok) throw new Error('Failed to fetch your transactions eligible for dispute.');
        const data: SellerTransactionForDispute[] = await response.json();
        setTransactions(data || []);
      } catch (error) {
        console.error("Error fetching seller transactions for dispute:", error);
        toast({ title: "Error Fetching Transactions", description: (error as Error).message, variant: "destructive" });
      } finally {
        setIsFetchingTransactions(false);
      }
    };
    fetchSellerTransactions();
  }, [authStatus, session?.user?.id, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransactionId || !reason || !description) {
      toast({ title: "Missing Fields", description: "Please select a transaction, a reason, and provide a description.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const selectedTransaction = transactions.find(t => t.id === selectedTransactionId);
    if (!selectedTransaction) {
        toast({ title: "Error", description: "Selected transaction not found.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

    try {
      const response = await fetch('/api/disputes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            paymentId: selectedTransactionId, 
            itemId: selectedTransaction.itemId, 
            reason, 
            description, 
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to file dispute.');
      }
      toast({ title: "Dispute Submitted", description: "Your dispute regarding payment has been submitted." });
      router.push('/dashboard/my-earnings'); 
    } catch (error) {
      console.error("Dispute submission error:", error);
      toast({ title: "Submission Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (authStatus === 'loading' || isFetchingTransactions) {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.replace('/auth?callbackUrl=/dispute/file-seller');
    return null;
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-slate-100 dark:bg-slate-900 py-8 md:py-12 px-4">
      <Card className="w-full max-w-xl shadow-xl dark:bg-slate-800">
        <CardHeader>
          <div className="flex items-center space-x-3 mb-2">
            <Icons.dollarSign className="h-7 w-7 text-green-500" />
            <CardTitle className="text-2xl font-semibold">Report an Issue with a Payment</CardTitle>
          </div>
          <CardDescription>Use this form if you believe funds for a completed sale have not been correctly released to your earnings.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="transaction-select">Select the Transaction <span className="text-red-500">*</span></Label>
              {transactions.length > 0 ? (
                <Select value={selectedTransactionId} onValueChange={setSelectedTransactionId} required disabled={isLoading || isFetchingTransactions}>
                    <SelectTrigger id="transaction-select" className="w-full"><SelectValue placeholder="Choose a transaction..." /></SelectTrigger>
                    <SelectContent>
                        {transactions.map((transaction) => (
                            <SelectItem key={transaction.id} value={transaction.id}>
                                Payment #{transaction.id.substring(0,6)} - Item: {transaction.itemDetails?.title || transaction.itemTitle || 'N/A'} (KES {transaction.amount})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                    {isFetchingTransactions ? 'Loading your transactions...' : 'No transactions currently eligible for this type of dispute were found. This is typically for payments held by the platform after a sale.'}
                </p>
              )}
            </div>

            {selectedTransactionId && (
                <>
                    <div className="grid gap-2">
                    <Label htmlFor="reason-select">Reason for Dispute <span className="text-red-500">*</span></Label>
                    <Select value={reason} onValueChange={setReason} required disabled={isLoading}>
                        <SelectTrigger id="reason-select" className="w-full"><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                        <SelectContent>
                            {sellerDisputeReasons.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    </div>
                    <div className="grid gap-2">
                    <Label htmlFor="description">Detailed Explanation <span className="text-red-500">*</span></Label>
                    <Textarea 
                        id="description" 
                        placeholder="Please provide all relevant details: confirmation from buyer (if any), delivery proof references, expected release date, etc." 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        required 
                        disabled={isLoading} 
                        rows={7} 
                    />
                    <p className="text-xs text-muted-foreground">You may be contacted for evidence later if needed.</p>
                    </div>
                </>
            )}
          </CardContent>
          {selectedTransactionId && (
            <CardFooter className="border-t pt-6">
                <Button type="submit" className="w-full" disabled={isLoading || !selectedTransactionId || !reason || !description}>
                    {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Payment Dispute
                </Button>
            </CardFooter>
          )}
        </form>
        <div className="p-6 border-t text-center">
            <Link href="/help-center">
                <Button variant="outline" size="sm">
                    <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back to Help Center
                </Button>
            </Link>
        </div>
      </Card>
    </div>
  );
}

export default function FileSellerDisputePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><Icons.spinner className="h-10 w-10 animate-spin text-primary" /></div>}>
            <FileSellerDisputeForm />
        </Suspense>
    );
}
