'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Payment, Item } from '@/lib/types'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRouter } from 'next/navigation';

interface OrderDisplayItem extends Payment {
    itemDetails?: Partial<Item>; 
}

export default function MyOrdersPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (status !== 'authenticated' || !session?.user?.id) {
          setIsLoading(false);
          return; 
      }
      setIsLoading(true);
      setError(null);
      try {
        console.log("MyOrders: Fetching orders...");
        const response = await fetch(`/api/user/orders`); 
        if (!response.ok) {
             const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP error! status: ${response.status}`);
        }
        const data: OrderDisplayItem[] = await response.json();
        console.log(`MyOrders: Fetched ${data.length} orders.`);
        setOrders(data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch your orders.';
        setError(message);
        console.error("Error fetching orders:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [status, session?.user?.id]);

  const handleConfirmReceipt = async (paymentId: string) => {
      if (!paymentId) return;
      setConfirmingPaymentId(paymentId);
      try {
           console.log(`MyOrders: Confirming receipt for payment ${paymentId}...`);
           const response = await fetch('/api/payment/confirm-receipt', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ paymentId })
           });
           const result = await response.json();
           if (!response.ok) {
               throw new Error(result.message || 'Failed to confirm receipt.');
           }
           console.log(`MyOrders: Receipt confirmed for ${paymentId}.`);
           toast({ title: "Success", description: "Payment released to seller." });
           setOrders(prevOrders => 
               prevOrders.map(order => 
                    order.id === paymentId ? { ...order, status: 'released_to_seller_balance' } : order
               )
           );
      } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to confirm receipt.';
            console.error("Confirm Receipt Error:", err);
            toast({ title: "Error", description: message, variant: "destructive" });
      } finally {
            setConfirmingPaymentId(null); 
      }
  };

  const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return 'N/A';
        try { return format(new Date(dateString), 'PP'); } 
        catch { return 'Invalid Date'; }
    };

  const renderOrderCard = (order: OrderDisplayItem) => {
    const canConfirm = order.status === 'paid_to_platform';
    const isConfirming = confirmingPaymentId === order.id;

    return (
        <Card key={order.id} className="mb-4 overflow-hidden">
            <CardHeader className="bg-muted/50 p-4 border-b">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <div>
                        <CardTitle className="text-lg">Order #{order.id.substring(0, 8)}</CardTitle>
                        <CardDescription>Placed on: {formatDate(order.createdAt)}</CardDescription>
                    </div>
                    <Badge 
                        variant={ 
                            order.status === 'released_to_seller_balance' ? 'secondary' : 
                            order.status === 'paid_to_platform' ? 'secondary' : 
                            order.status === 'disputed' ? 'destructive' : 'outline'
                        }
                    >
                        Status: {order.status.replace(/_/g, ' ')}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start">
                {order.itemDetails?.mediaUrls?.[0] ? (
                    <img 
                        src={order.itemDetails.mediaUrls[0]}
                        alt={order.itemDetails.title || 'Item image'}
                        className="w-24 h-24 object-cover rounded-md border flex-shrink-0" 
                    />
                ) : (
                    <div className="w-24 h-24 bg-secondary rounded-md flex items-center justify-center text-muted-foreground text-xs flex-shrink-0">
                         No Image
                    </div>
                )}
                <div className="flex-grow mt-2 sm:mt-0">
                     <Link href={`/item/${order.itemId}`} className="hover:underline">
                         <h3 className="font-semibold">{order.itemDetails?.title || 'Item Details Unavailable'}</h3>
                     </Link>
                     <p className="text-sm text-muted-foreground">Seller ID: {order.sellerId.substring(0, 8)}...</p>
                     <p className="text-lg font-medium mt-1">KES {order.amount.toLocaleString()}</p>
                 </div>
            </CardContent>
            {canConfirm && (
                 <CardFooter className="p-4 bg-muted/50 border-t flex flex-col sm:flex-row sm:justify-end gap-2">
                    {canConfirm && (
                        <Button 
                            className="w-full sm:w-auto"
                            onClick={() => handleConfirmReceipt(order.id)}
                            disabled={isConfirming}
                            size="sm"
                        >
                            {isConfirming && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Receipt
                        </Button>
                    )}
                 </CardFooter>
            )}
        </Card>
    );
  };

  const renderSkeleton = () => (
       Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="mb-4 overflow-hidden">
                <CardHeader className="bg-muted/50 p-4 border-b">
                     <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                         <div>
                            <Skeleton className="h-6 w-32 mb-1" />
                            <Skeleton className="h-4 w-24" />
                         </div>
                         <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                </CardHeader>
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start">
                    <Skeleton className="w-24 h-24 rounded-md flex-shrink-0" />
                    <div className="flex-grow space-y-2 mt-2 sm:mt-0">
                        <Skeleton className="h-5 w-3/4" />
                         <Skeleton className="h-4 w-1/2" />
                         <Skeleton className="h-6 w-1/4 mt-1" />
                     </div>
                </CardContent>
                 <CardFooter className="p-4 bg-muted/50 border-t">
                    <Skeleton className="h-10 w-full sm:w-32 ml-auto" /> 
                 </CardFooter>
            </Card>
       ))
  );

  if (status === 'loading') {
      return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold">My Orders</h1>
                <Link href="/dashboard" passHref>
                    <Button variant="outline">
                        <Icons.arrowLeft className="mr-2 h-4 w-4" />
                        Back to Marketplace
                    </Button>
                </Link>
            </div>
            {renderSkeleton()}
        </div>
      );
  }
  if (status === 'unauthenticated') {
       return <div className="container mx-auto p-4 md:p-6 text-center">Please log in to view your orders.</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold">My Orders</h1>
            <Link href="/dashboard" passHref>
                <Button variant="outline">
                    <Icons.arrowLeft className="mr-2 h-4 w-4" />
                    Back to Marketplace
                </Button>
            </Link>
        </div>
      {isLoading && renderSkeleton()}
      {!isLoading && error && (
          <Alert variant="destructive">
              <Icons.alertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
      )}
      {!isLoading && !error && orders.length === 0 && (
          <p className="text-center text-muted-foreground mt-10">You haven't placed any orders yet.</p>
      )}
      {!isLoading && !error && orders.length > 0 && (
          <div>
              {orders.map(renderOrderCard)}
          </div>
      )}
    </div>
  );
}
