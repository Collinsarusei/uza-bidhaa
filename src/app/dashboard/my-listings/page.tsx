'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Item } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { useSession } from "next-auth/react";

export default function MyListingsPage() {
  const { data: session, status } = useSession();
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMyItems = async (userId: string) => {
      setIsLoading(true);
      setError(null);

      const apiUrl = `/api/items?sellerId=${userId}`; 
      console.log(`Fetching my items from: ${apiUrl}`);

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setMyItems(data);
      } catch (err) {
         let message = "Failed to fetch your listings.";
          if (err instanceof Error) {
              message = err.message;
          }
         setError(message);
        console.error("Error fetching my items:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (status === "authenticated" && session?.user?.id) {
      fetchMyItems(session.user.id);
    } else if (status === "unauthenticated") {
        setError("You must be logged in to view your listings.");
        setIsLoading(false);
    }
  }, [session, status]); 

  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold">My Listings</h1>
         <Link href="/dashboard" passHref>
            <Button variant="default" className="bg-orange-500 hover:bg-orange-600 text-white">
                <Icons.arrowLeft className="mr-2 h-4 w-4" />
                Back to Marketplace
            </Button>
        </Link>
     </div>
  );

  const renderMyItemCard = (item: Item) => (
    <Card key={item.id} className="flex flex-col overflow-hidden">
      <CardHeader className="p-0">
        <div className="block relative w-full aspect-[4/3]"> 
          {item.mediaUrls && item.mediaUrls.length > 0 ? (
            <img 
              src={item.mediaUrls[0]} 
              alt={item.title} 
              className="absolute h-full w-full object-cover rounded-t-md" 
            />
          ) : (
            <div className="absolute h-full w-full bg-secondary rounded-t-md flex items-center justify-center text-muted-foreground">No Image</div>
          )}
        </div>
        <div className="p-2 md:p-4">
          <CardTitle className="text-sm md:text-base">{item.title}</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">{item.location}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-2 md:p-4 pt-0">
        <p className="mb-2 text-sm md:text-base font-semibold">KES {item.price.toLocaleString()}</p>
        {item.quantity !== undefined && <p className="text-xs text-muted-foreground">Quantity: {item.quantity}</p>}
        <Badge
          variant={item.status === 'SOLD' ? 'destructive' : item.status === 'PENDING_PAYMENT' || item.status === 'PAID_ESCROW' ? 'secondary' : 'default'}
          className="mt-2 text-xs"
        >
          {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace(/_/g, ' ')}
        </Badge>
      </CardContent>
      <CardFooter className="p-2 md:p-4 flex flex-col gap-2 border-t">
        <Button variant="outline" size="sm" className="w-full" onClick={() => alert(`View item: ${item.title}`)}>
          <Icons.eye className="mr-2 h-4 w-4"/> View Listing
        </Button>
        <Button variant="default" size="sm" className="w-full" onClick={() => alert(`Edit item: ${item.title}`)}>
          <Icons.edit className="mr-2 h-4 w-4"/> Edit Listing
        </Button>
      </CardFooter>
    </Card>
  );

  const renderLoadingSkeletons = () => (
     Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} className="flex flex-col overflow-hidden">
             <CardHeader className="p-0">
                  <Skeleton className="aspect-square w-full rounded-t-md" />
                  <div className="p-4">
                    <Skeleton className="h-5 w-3/4 mb-1" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
             </CardHeader>
             <CardContent className="p-4 pt-0">
                 <Skeleton className="h-6 w-1/4 mb-2" />
                 <Skeleton className="h-4 w-1/3 mb-2"/> 
                 <Skeleton className="h-6 w-1/4"/> 
             </CardContent>
             <CardFooter className="p-4 flex flex-col gap-2 border-t">
                 <Skeleton className="h-10 w-full" /> 
                 <Skeleton className="h-10 w-full" /> 
             </CardFooter>
        </Card>
     ))
  );

  if (status === "loading" || isLoading) {
    return (
        <div className="container mx-auto p-4 md:p-6">
            {renderHeader()}
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {renderLoadingSkeletons()}
            </div>
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      {renderHeader()}

      {error && (
        <div className="text-center text-red-600 my-4">
          <p className="font-semibold">Error loading your listings:</p>
          <p className="text-sm">{error}</p>
           {status === "unauthenticated" && (
               <Link href="/auth" passHref>
                   <Button variant="link" className="mt-2">Login or Register</Button>
               </Link>
           )}
        </div>
      )}

      {!error && myItems.length === 0 && (
        <div className="text-center text-muted-foreground mt-10">
           {status === "authenticated" ? (
               <>
                 <Icons.archive className="mx-auto h-12 w-12 text-gray-400 mb-3"/> {/* Corrected Icon */}
                 <p className="font-semibold">You haven't listed any items yet.</p>
                 <p className="text-sm">Ready to start selling? List your first item now!</p>
                 <Link href="/sell" passHref>
                    <Button className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Icons.plusCircle className="mr-2 h-4 w-4"/> List Your First Item
                    </Button>
                 </Link>
               </>
           ) : (
                <p>Please log in to view your listings.</p>
           )}
        </div>
      )}

      {!error && myItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
          {myItems.map(renderMyItemCard)}
        </div>
      )}
    </div>
  );
}
