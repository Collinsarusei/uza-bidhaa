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
import { Item } from "@/lib/types"; // Assuming you have a type for Item
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { useSession } from "next-auth/react";
// We might need Tooltip here later for actions like 'edit' or 'delete'
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function MyListingsPage() {
  const { data: session, status } = useSession();
  const [myItems, setMyItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMyItems = async (userId: string) => {
      setIsLoading(true);
      setError(null);

      const apiUrl = `/api/items?sellerId=${userId}`; // Use sellerId to fetch user's own items
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

    // Fetch items only if the session is loaded and user ID is available
    if (status === "authenticated" && session?.user?.id) {
      fetchMyItems(session.user.id);
    } else if (status === "unauthenticated") {
        // Handle cases where the user is not logged in but somehow reached this page
        setError("You must be logged in to view your listings.");
        setIsLoading(false);
    }


  }, [session, status]); // Re-run when session or status changes

  // --- Placeholder Components / Sections ---
  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold">My Listings</h1>
        {/* Optionally add a button to go back to the main marketplace */}
         <Link href="/dashboard" passHref>
            <Button variant="outline">
                Back to Marketplace
            </Button>
        </Link>
     </div>
  );


    const renderMyItemCard = (item: Item) => (
    <Card key={item.id} className="flex flex-col">
      <CardHeader>
        {/* Basic image placeholder */}
        {item.mediaUrls && item.mediaUrls.length > 0 ? (
           <img src={item.mediaUrls[0]} alt={item.title} className="aspect-video w-full rounded-md object-cover mb-4" />
        ) : (
           <div className="aspect-video w-full bg-secondary rounded-md mb-4 flex items-center justify-center text-muted-foreground">No Image</div>
        )}
        <CardTitle>{item.title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">{item.location}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
         <p className="mb-2 text-lg font-semibold">KES {item.price.toLocaleString()}</p>
         <p className="text-sm text-muted-foreground truncate">{item.description}</p>
          {/* Display Status */}
          <Badge
            variant={item.status === 'sold' ? 'destructive' : item.status === 'pending' ? 'secondary' : 'default'}
            className="mt-2"
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Badge>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {/* --- Edit and Delete Buttons --- */}
        {/* Placeholder actions - implement actual logic later */}
        <Button variant="default" className="w-full" onClick={() => alert(`Edit item: ${item.title}`)}>
             Edit Listing
        </Button>
         <Button variant="destructive" className="w-full" onClick={() => alert(`Delete item: ${item.title}`)}>
             Delete Listing
        </Button>
      </CardFooter>
    </Card>
  );


  const renderLoadingSkeletons = () => (
     Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="flex flex-col">
             <CardHeader>
                  <Skeleton className="h-[125px] w-full rounded-md mb-4" />
                  <Skeleton className="h-5 w-3/4 mb-1" />
                  <Skeleton className="h-4 w-1/2" />
             </CardHeader>
             <CardContent>
                 <Skeleton className="h-6 w-1/4 mb-2" />
                 <Skeleton className="h-4 w-full mb-1" />
                 <Skeleton className="h-4 w-5/6" />
                 <Skeleton className="h-6 w-1/4 mt-2"/> {/* Badge Skeleton */}
             </CardContent>
             <CardFooter className="flex flex-col gap-2">
                 <Skeleton className="h-10 w-full" /> {/* Edit Button */}
                 <Skeleton className="h-10 w-full" /> {/* Delete Button */}
             </CardFooter>
        </Card>
     ))
  );

  // Render loading state while session is loading or items are loading
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
        <div className="text-center text-red-600">
          <p>Error loading your listings: {error}</p>
           {status === "unauthenticated" && (
               <Link href="/auth" passHref>
                   <Button variant="link" className="mt-2">Login or Register</Button>
               </Link>
           )}
        </div>
      )}

      {!error && myItems.length === 0 && (
        <div className="text-center text-muted-foreground">
           {status === "authenticated" ? (
               <>
                 <p>You haven't listed any items yet.</p>
                 <Link href="/sell" passHref>
                    <Button variant="link" className="mt-2">List Your First Item</Button>
                 </Link>
               </>
           ) : (
                <p>Please log in to view your listings.</p>
           )}
        </div>
      )}

      {!error && myItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {myItems.map(renderMyItemCard)}
        </div>
      )}
    </div>
  );
}
