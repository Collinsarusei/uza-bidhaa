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
import { Payment, Item, OrderDisplayItem } from '@/lib/types'; 
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import Link from 'next/link';

const buyerDisputeReasons = [
    { value: "item_not_received", label: "I haven't received my item" },
    { value: "item_not_as_described", label: "Item is significantly not as described" },
    { value: "item_damaged_or_defective", label: "Item arrived damaged or is defective" },
    { value: "other_buyer", label: "Other (Please specify below)" },
];

function FileBuyerDisputeForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status: authStatus } = useSession();

  const [orders, setOrders] = useState<OrderDisplayItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(""); // Payment ID
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOrders, setIsFetchingOrders] = useState(true);

  useEffect(() => {
    const fetchBuyerOrders = async () => {
      if (authStatus !== 'authenticated') {
        setIsFetchingOrders(false);
        return;
      }
      setIsFetchingOrders(true);
      try {
        const response = await fetch(`/api/user/orders`); 
        if (!response.ok) throw new Error('Failed to fetch your orders.');
        const data: OrderDisplayItem[] = await response.json();
        const disputableOrders = data.filter(order => 
            order.status === 'SUCCESSFUL_ESCROW' || 
            order.status === 'RELEASED_TO_SELLER' || 
            order.status === 'DISPUTED' 
        );
        setOrders(disputableOrders || []);
      } catch (error) {
        console.error("Error fetching buyer orders:", error);
        toast({ title: "Error Fetching Orders", description: (error as Error).message, variant: "destructive" });
      } finally {
        setIsFetchingOrders(false);
      }
    };
    fetchBuyerOrders();
  }, [authStatus, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || !reason || !description) {
      toast({ title: "Missing Fields", description: "Please select an order, a reason, and provide a description.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    const selectedOrder = orders.find(o => o.id === selectedOrderId);
    if (!selectedOrder) {
        toast({ title: "Error", description: "Selected order not found.", variant: "destructive" });
        setIsLoading(false);
        return;
    }

    try {
      const response = await fetch('/api/disputes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            paymentId: selectedOrderId, 
            itemId: selectedOrder.itemId, 
            reason, 
            description, 
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to file dispute.');
      }
      toast({ title: "Dispute Submitted", description: "Your dispute has been submitted and will be reviewed shortly." });
      router.push('/dashboard/my-orders');
    } catch (error) {
      console.error("Dispute submission error:", error);
      toast({ title: "Submission Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (authStatus === 'loading' || isFetchingOrders) {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
        </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.replace('/auth?callbackUrl=/dispute/file-buyer');
    return null;
  }

  return (
    <div className="flex justify-center items-start min-h-screen bg-slate-100 dark:bg-slate-900 py-8 md:py-12 px-4">
      <Card className="w-full max-w-xl shadow-xl dark:bg-slate-800">
        <CardHeader>
          <div className="flex items-center space-x-3 mb-2">
            <Icons.package className="h-7 w-7 text-primary" /> {/* Corrected Icon */}
            <CardTitle className="text-2xl font-semibold">Report an Issue with Your Purchase</CardTitle>
          </div>
          <CardDescription>Describe the problem you encountered with an item you bought.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="order-select">Select the Order <span className="text-red-500">*</span></Label>
              {orders.length > 0 ? (
                <Select value={selectedOrderId} onValueChange={setSelectedOrderId} required disabled={isLoading || isFetchingOrders}>
                    <SelectTrigger id="order-select" className="w-full"><SelectValue placeholder="Choose an order..." /></SelectTrigger>
                    <SelectContent>
                        {orders.map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                                Order #{order.id.substring(0,6)} - {order.itemDetails?.title || order.itemTitle || 'Item'} (KES {order.amount})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                    {isFetchingOrders ? 'Loading your orders...' : 'No orders eligible for dispute found. Disputes can typically be filed for items paid to the platform or recently delivered.'}
                </p>
              )}
            </div>

            {selectedOrderId && (
                <>
                    <div className="grid gap-2">
                    <Label htmlFor="reason-select">Reason for Dispute <span className="text-red-500">*</span></Label>
                    <Select value={reason} onValueChange={setReason} required disabled={isLoading}>
                        <SelectTrigger id="reason-select" className="w-full"><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                        <SelectContent>
                            {buyerDisputeReasons.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    </div>
                    <div className="grid gap-2">
                    <Label htmlFor="description">Detailed Explanation <span className="text-red-500">*</span></Label>
                    <Textarea 
                        id="description" 
                        placeholder="Please provide all relevant details: what happened, dates, differences from description, etc. Be as specific as possible." 
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
          {selectedOrderId && (
            <CardFooter className="border-t pt-6">
                <Button type="submit" className="w-full" disabled={isLoading || !selectedOrderId || !reason || !description}>
                    {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Dispute
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

export default function FileBuyerDisputePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><Icons.spinner className="h-10 w-10 animate-spin text-primary" /></div>}>
            <FileBuyerDisputeForm />
        </Suspense>
    );
}
