'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Item } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { Link } from 'lucide-react';

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const itemId = params?.itemId as string;

  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItemDetails = async () => {
      if (!itemId) {
        setError('Item ID not found.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        console.log(`Fetching details for item: ${itemId}`);
        const response = await fetch(`/api/items?itemId=${itemId}`);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
             throw new Error(errData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data || data.length === 0) {
           throw new Error('Item not found.');
        }
        console.log("Item data received:", data[0]);
        setItem(data[0]); 
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch item details.';
        setError(message);
        console.error("Error fetching item details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchItemDetails();
  }, [itemId]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <Skeleton className="h-10 w-1/4 mb-4" />
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
           <Skeleton className="aspect-square w-full rounded-lg" />
           <div className="space-y-4">
             <Skeleton className="h-8 w-3/4" />
             <Skeleton className="h-6 w-1/4" />
             <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/4" />
             <div className="space-y-2 pt-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
             </div>
             <Skeleton className="h-10 w-full mt-4" />
           </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl text-center text-red-600">
          <Button variant="outline" onClick={() => router.back()} className="mb-4">
             <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back
           </Button>
        <p>Error loading item: {error}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl text-center text-muted-foreground">
         <Button variant="outline" onClick={() => router.back()} className="mb-4">
             <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back
           </Button>
        <p>Item not found.</p>
      </div>
    );
  }

  const canMessageSeller = session?.user && session.user.id !== item.sellerId;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
       <Button variant="outline" onClick={() => router.back()} className="mb-4">
         <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back to Listings
       </Button>
       
      <div className="grid md:grid-cols-2 gap-6 lg:gap-12">
        <div>
           {item.mediaUrls && item.mediaUrls.length > 0 ? (
             <img 
               src={item.mediaUrls[0]} 
               alt={item.title} 
               className="aspect-square w-full rounded-lg object-cover border" 
              />
           ) : (
             <div className="aspect-square w-full bg-secondary rounded-lg flex items-center justify-center text-muted-foreground border">
               No Image Provided
             </div>
           )}
        </div>

        <div className="space-y-4">
           <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">{item.title}</h1>
           <p className="text-2xl lg:text-3xl font-semibold text-primary">KES {item.price.toLocaleString()}</p>
           <div className="flex items-center gap-2 text-muted-foreground">
               <Icons.mapPin className="h-4 w-4"/> 
               <span>{item.location}</span>
           </div>
           <div>
                <Badge 
                    variant={item.status === 'sold' ? 'destructive' : item.status === 'available' ? 'default' : 'secondary'}
                >
                    Status: {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Badge>
            </div>
            
            <div className="space-y-2 pt-4 border-t">
                <h3 className="font-semibold">Description</h3>
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">{item.description}</p>
            </div>

           <div className="space-y-2 pt-2">
                <h3 className="font-semibold">Options</h3>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Delivery Offered: {item.offersDelivery ? 'Yes' : 'No'}</li>
                    <li>Installments Accepted: {item.acceptsInstallments ? 'Yes' : 'No'}</li>
                    {item.discountPercentage && <li>Discount: {item.discountPercentage}%</li>}
                </ul>
            </div>

           {/* Action Button */} 
            <div className="pt-4">
               {session?.user?.id === item.sellerId ? (
                  <Button className="w-full" disabled>This is Your Listing</Button>
               ) : (
                  // FIX: Removed passHref from Button
                  <Link href={`/messages?sellerId=${item.sellerId}&itemId=${item.id}`} >
                     <Button className="w-full" disabled={!canMessageSeller}> 
                       <Icons.mail className="mr-2 h-4 w-4" /> 
                       {canMessageSeller ? 'Message Seller' : (session?.user ? 'Cannot message yourself' : 'Login to Message')}
                     </Button>
                  </Link>
               )}
            </div>
        </div>
      </div>
    </div>
  );
}
