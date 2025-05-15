'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const disputeReasons = {
    buyer: [
        { value: "item_not_received", label: "Item Not Received" },
        { value: "item_not_as_described", label: "Item Not as Described (Significant Difference)" },
        { value: "item_damaged_or_defective", label: "Item Damaged or Defective" },
        { value: "unauthorized_transaction", label: "Unauthorized Transaction (Suspected Fraud)" },
        { value: "other", label: "Other (Please specify)" },
    ],
    seller: [
        { value: "payment_not_released", label: "Payment Not Released After Delivery/Agreement" },
        { value: "buyer_false_claim", label: "Buyer Made a False Claim" },
        { value: "return_fraud", label: "Suspected Return Fraud" },
        { value: "other", label: "Other (Please specify)" },
    ],
};

function FileDisputeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: session, status: authStatus } = useSession();

  const paymentId = searchParams.get('paymentId');
  const itemId = searchParams.get('itemId');

  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<Payment | null>(null);
  const [itemDetails, setItemDetails] = useState<Item | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(true);
  const [userRole, setUserRole] = useState<'buyer' | 'seller' | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!paymentId || !itemId || authStatus !== 'authenticated') {
        setIsFetchingDetails(false);
        if (authStatus === 'authenticated') {
            toast({ title: "Missing Information", description: "Payment ID or Item ID is missing.", variant: "destructive" });
            router.push("/dashboard/my-orders"); // Or a more general error page
        }
        return;
      }
      setIsFetchingDetails(true);
      try {
        // TODO: API endpoints to fetch specific payment and item details might be needed
        // For now, let's assume they might come from a general details endpoint or user context
        // This is a placeholder - you'll need to implement actual fetching
        const paymentResponse = await fetch(`/api/payments/${paymentId}`); // Example endpoint
        if (!paymentResponse.ok) throw new Error('Failed to fetch payment details');
        const paymentData = await paymentResponse.json();
        setPaymentDetails(paymentData);

        const itemResponse = await fetch(`/api/items?itemId=${itemId}`); // Existing endpoint
        if (!itemResponse.ok) throw new Error('Failed to fetch item details');
        const itemDataArray = await itemResponse.json();
        if (itemDataArray && itemDataArray.length > 0) {
            setItemDetails(itemDataArray[0]);
        } else {
            throw new Error('Item details not found');
        }

        // Determine user role in this transaction
        if (session?.user?.id === paymentData.buyerId) {
            setUserRole('buyer');
        } else if (session?.user?.id === paymentData.sellerId) {
            setUserRole('seller');
        } else {
            throw new Error('You are not a party to this transaction.');
        }

      } catch (error) {
        console.error("Error fetching dispute details:", error);
        toast({ title: "Error Fetching Details", description: (error as Error).message, variant: "destructive" });
        // router.push("/dashboard"); // Redirect if details can't be fetched
      } finally {
        setIsFetchingDetails(false);
      }
    };
    fetchDetails();
  }, [paymentId, itemId, authStatus, session?.user?.id, router, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !description) {
      toast({ title: "Missing Fields", description: "Please select a reason and provide a description.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/disputes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            paymentId, 
            itemId, 
            reason, 
            description, 
            // filedByUserId will be taken from session on the backend
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to file dispute.');
      }
      toast({ title: "Dispute Filed", description: "Your dispute has been submitted and will be reviewed." });
      router.push(userRole === 'buyer' ? '/dashboard/my-orders' : '/dashboard/my-earnings'); // Navigate back
    } catch (error) {
      console.error("Dispute submission error:", error);
      toast({ title: "Submission Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (authStatus === 'loading' || isFetchingDetails) {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.replace('/auth?callbackUrl=/dispute/file'); // Redirect to login
    return null;
  }

  if (!paymentId || !itemId || !paymentDetails || !itemDetails || !userRole) {
    return (
        <div className="container mx-auto p-4 md:p-6 text-center">
            <p className="mb-4">Could not load dispute information. Please ensure you have a valid link.</p>
            <Link href="/dashboard">
                <Button variant="outline">Go to Dashboard</Button>
            </Link>
        </div>
    );
  }
  
  const relevantReasons = userRole === 'buyer' ? disputeReasons.buyer : disputeReasons.seller;

  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <Card className="w-full max-w-xl shadow-lg dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">File a Dispute</CardTitle>
          <CardDescription>For order #{paymentId?.substring(0,8)} regarding item "{itemDetails.title}".</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-5">
            <div className="grid gap-1.5">
                <Label htmlFor="item-title">Item</Label>
                <p id="item-title" className="text-sm text-muted-foreground">{itemDetails.title} (KES {paymentDetails.amount.toLocaleString()})</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reason-select">Reason for Dispute <span className="text-red-500">*</span></Label>
              <Select value={reason} onValueChange={setReason} required disabled={isLoading}>
                  <SelectTrigger id="reason-select" className="w-full"><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                  <SelectContent>
                      {relevantReasons.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">Detailed Explanation <span className="text-red-500">*</span></Label>
              <Textarea 
                id="description" 
                placeholder="Please provide all relevant details, dates, and any evidence you have..." 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                required 
                disabled={isLoading} 
                rows={6} 
              />
            </div>
            {/* TODO: Add file upload for evidence later if needed */}
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button type="submit" className="w-full" disabled={isLoading || !paymentId || !itemId}>
                 {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                 Submit Dispute
             </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// It's good practice to wrap the page content with Suspense if it uses useSearchParams
export default function FileDisputePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><Icons.spinner className="h-10 w-10 animate-spin text-primary" /></div>}>
            <FileDisputeForm />
        </Suspense>
    );
}
