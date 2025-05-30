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

enum PaymentStatus {
  INITIATED = 'INITIATED',
  SUCCESSFUL_ESCROW = 'SUCCESSFUL_ESCROW',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  RELEASED_TO_SELLER = 'RELEASED_TO_SELLER',
  REFUNDED_TO_BUYER = 'REFUNDED_TO_BUYER',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED'
}

interface OrderDisplayItem extends Omit<Payment, 'status'> {
    status: PaymentStatus;
    itemDetails?: Partial<Item>; 
}

export default function MyOrdersPage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!session?.user?.id) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/user/orders?userId=${session.user.id}`);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setOrders(data);
      } catch (err) {
        let message = "Failed to fetch orders.";
        if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        console.error("Error fetching orders:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (status === "authenticated") {
    fetchOrders();
    }
  }, [session?.user?.id, status]);

  const handleConfirmReceipt = async (orderId: string) => {
      try {
      const response = await fetch(`/api/orders/${orderId}/confirm`, {
               method: 'POST',
        headers: { 'Content-Type': 'application/json' }
           });

           if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to confirm receipt');
           }

      // Update the order status locally
           setOrders(prevOrders => 
               prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, status: PaymentStatus.RELEASED_TO_SELLER }
            : order
               )
           );

      toast({
        title: "Receipt Confirmed",
        description: "Thank you for confirming your receipt.",
        duration: 3000
      });
    } catch (error: any) {
      console.error('Error confirming receipt:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to confirm receipt. Please try again.",
        variant: "destructive",
        duration: 5000
      });
    }
  };

  const handleDisputeOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to initiate dispute');
      }

      // Update the order status locally
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId 
            ? { ...order, status: PaymentStatus.DISPUTED }
            : order
        )
      );

      toast({
        title: "Dispute Initiated",
        description: "Our team will review your dispute and contact you soon.",
        duration: 5000
      });
    } catch (error: any) {
      console.error('Error initiating dispute:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to initiate dispute. Please try again.",
        variant: "destructive",
        duration: 5000
      });
    }
    };

  const getStatusVariant = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.RELEASED_TO_SELLER:
        return 'default';
      case PaymentStatus.DISPUTED:
        return 'destructive';
      case PaymentStatus.PENDING_CONFIRMATION:
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const renderOrderCard = (order: OrderDisplayItem) => {
    const item = order.itemDetails;
    if (!item) return null;

    return (
      <Card key={order.id} className="overflow-hidden">
        <CardHeader className="p-2 md:p-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm md:text-base">Order #{order.id.substring(0, 8)}</CardTitle>
            <Badge variant={getStatusVariant(order.status)} className="text-xs">
              {order.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            {order.createdAt ? format(new Date(order.createdAt), 'PPp') : 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 md:p-4 flex flex-col sm:flex-row gap-2 md:gap-4 items-start">
          {item.mediaUrls && item.mediaUrls.length > 0 ? (
            <img 
              src={item.mediaUrls[0]} 
              alt={item.title} 
              className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-md flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 md:w-24 md:h-24 bg-secondary rounded-md flex items-center justify-center text-muted-foreground flex-shrink-0">
              No Image
            </div>
          )}
          <div className="flex-grow space-y-1">
            <h3 className="font-medium text-sm md:text-base">{item.title}</h3>
            <p className="text-xs md:text-sm text-muted-foreground">KES {order.amount.toLocaleString()}</p>
            <p className="text-xs md:text-sm text-muted-foreground">Seller: {item.seller?.name || 'Unknown'}</p>
          </div>
        </CardContent>
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
    return (
      <div className="container mx-auto p-4 md:p-6 text-center">
        Please log in to view your orders.
      </div>
    );
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
        <p className="text-center text-muted-foreground mt-10">
          You haven't placed any orders yet.
        </p>
      )}
      {!isLoading && !error && orders.length > 0 && (
          <div>
              {orders.map(renderOrderCard)}
          </div>
      )}
    </div>
  );
}
