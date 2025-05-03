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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip components

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch items on component mount or when session status/user ID changes
  useEffect(() => {
    const fetchItems = async () => {
      setIsLoading(true);
      setError(null);

      // Get the current user's ID from the session
      const currentUserId = session?.user?.id; // Assuming user ID is stored in session.user.id

      // Construct the API URL, including the userId query parameter if available
      const apiUrl = currentUserId ? `/api/items?userId=${currentUserId}` : '/api/items';
      console.log(`Fetching items from: ${apiUrl}`); // Log the API URL

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setItems(data);
      } catch (err) {
         let message = "Failed to fetch items.";
          if (err instanceof Error) {
              message = err.message;
          }
         setError(message);
        console.error("Error fetching items:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch items if the session is loaded (not in "loading" status)
    if (status !== "loading") {
      fetchItems();
    }

  }, [session, status]); // Re-run when session or status changes

  // --- Placeholder Components / Sections ---
  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <div className="flex items-center gap-4">
            {/* Added View My Listings Button */}
            {session?.user && ( // Only show if user is logged in
                <Link href="/dashboard/my-listings" passHref>
                    <Button variant="outline">
                        View My Listings
                    </Button>
                </Link>
            )}
            <Link href="/sell" passHref>
                <Button>
                    <Icons.plus className="mr-2 h-4 w-4" /> Sell Item
                </Button>
            </Link>
             {/* Profile Icon linking to Profile Page */}
            <Link href="/dashboard/profile" passHref> {/* Wrapped Button in Link */}
                <Button variant="ghost" size="icon">
                     <Icons.user className="h-5 w-5" /> {/* Profile */}
                     <span className="sr-only">Profile</span>
                </Button>
            </Link>
            <Button variant="ghost" size="icon">
                 <Icons.inbox className="h-5 w-5" /> {/* Inbox */}
                 <span className="sr-only">Inbox</span>
            </Button>
            <Button variant="ghost" size="icon">
                 <Icons.bell className="h-5 w-5" /> {/* Notifications */}
                 <span className="sr-only">Notifications</span>
            </Button>
        </div>
     </div>
  );


  const renderItemCard = (item: Item) => (
    <Card key={item.id} className="flex flex-col">
      <CardHeader>
        {/* Basic image placeholder - use item.mediaUrls[0] when available */}
        {item.mediaUrls && item.mediaUrls.length > 0 ? (
           // Use Next.js Image component for optimization in a real app
           <img src={item.mediaUrls[0]} alt={item.title} className="aspect-video w-full rounded-md object-cover mb-4" />
        ) : (
           <div className="aspect-video w-full bg-secondary rounded-md mb-4 flex items-center justify-center text-muted-foreground">No Image</div>
        )}
        <CardTitle>{item.title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">Posted by: {item.sellerId}</CardDescription> {/* Display seller ID for verification */}
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
        {/* Add "Interested" button later */}
        {/* This button should ideally link to an item detail page */}
        <Button variant="outline" className="w-full">
             View Details
        </Button>

        {/* --- Message Seller Button with Conditional Rendering and Tooltip --- */}
        {session?.user ? (
            // User is logged in, show active message button
            <Link href={`/messages?sellerId=${item.sellerId}&itemId=${item.id}`} passHref>
                <Button className="w-full">
                    Message Seller
                </Button>
            </Link>
        ) : (
            // User is not logged in, show disabled button with tooltip
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button className="w-full" disabled>
                            Message Seller
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Log in to message the seller.</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )}
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
                 <Skeleton className="h-10 w-full" /> {/* View Details Button */}
                 <Skeleton className="h-10 w-full" /> {/* Message Seller Button */}
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
          <p>Error loading items: {error}</p>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="text-center text-muted-foreground">
           {/* Check if user is logged in to show a different message */}
           {session?.user ? (
              <p>No items from other sellers available yet.</p>
           ) : (
               <p>No items listed yet. Log in to see more.</p>
           )}
          {!session?.user && ( // Only show register link if not logged in
                         <Link href="/auth/register" passHref>
                            <Button variant="link" className="mt-2">Create an Account</Button>
                        </Link>
                    )}
                     {session?.user && ( // Only show sell link if logged in
                         <Link href="/sell" passHref>
                            <Button variant="link" className="mt-2">List an Item</Button>
                        </Link>
                     )}
                </div>
            )}

            {!error && items.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map(renderItemCard)}
                </div>
            )}
        </div>
    );
}
