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
import { useSession, signOut } from "next-auth/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileContent } from "@/components/profile-content";
import { NotificationsContent } from "@/components/notifications-content";
import { useRouter } from 'next/navigation';
// Import ONLY the hook now, not the provider
import { useNotifications } from "@/components/providers/notification-provider"; 

// Keep DashboardContent as the main component that uses the hook
function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isNotificationsSheetOpen, setIsNotificationsSheetOpen] = useState(false);
  // Use the hook - it will find the provider from the RootLayout
  const { unreadCount, markAllAsRead } = useNotifications();

  const handleLogout = async () => {
      await signOut({ redirect: false }); 
      router.push('/'); 
  };

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoadingItems(true);
      setError(null);
      const currentUserId = session?.user?.id;
      // Fetch items excluding the user's own (this logic might need adjustment)
      const apiUrl = currentUserId ? `/api/items?userId=${currentUserId}` : '/api/items'; 
      console.log(`Fetching items from: ${apiUrl}`);
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setItems(data); 
      } catch (err) {
         let message = "Failed to fetch items.";
          if (err instanceof Error) { message = err.message; }
         setError(message);
        console.error("Error fetching items:", err);
      } finally {
        setIsLoadingItems(false);
      }
    };

    if (status === "authenticated") { // Only fetch if authenticated
      fetchItems();
    } else if (status === 'unauthenticated') {
        setIsLoadingItems(false); // Stop loading if not logged in
        setItems([]); // Clear items if logged out
    }
  }, [session?.user?.id, status]); // Depend on userId and status

  const handleOpenNotifications = () => {
      if (unreadCount > 0) {
          console.log("Opening notifications - marking as read...");
          markAllAsRead(); 
      }
      if (isMobile) {
          router.push('/notifications');
      } else {
          setIsNotificationsSheetOpen(true);
      }
  };

  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <div className="flex items-center gap-1 md:gap-2"> 
            {/* My Listings Button */} 
            {session?.user && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Link href="/dashboard/my-listings" passHref>
                                 <Button variant="outline" size={isMobile ? "sm" : "default"}>My Listings</Button>
                             </Link>
                        </TooltipTrigger>
                        <TooltipContent><p>View My Listings</p></TooltipContent>
                    </Tooltip>
                 </TooltipProvider>
            )}
            {/* Sell Button */} 
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link href="/sell" passHref>
                            <Button size={isMobile ? "sm" : "default"}>
                                <Icons.plus className="mr-1 h-4 w-4" /> Sell
                            </Button>
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent><p>Sell an Item</p></TooltipContent>
                </Tooltip>
             </TooltipProvider>

             {/* Profile Button/Sheet */} 
             {session?.user && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {isMobile ? (
                                <Link href="/profile" passHref>
                                    <Button variant="ghost" size="icon"><Icons.user className="h-5 w-5" /></Button>
                                </Link>
                            ) : (
                                <Sheet open={isProfileSheetOpen} onOpenChange={setIsProfileSheetOpen}>
                                    <SheetTrigger asChild>
                                        <Button variant="ghost" size="icon"><Icons.user className="h-5 w-5" /></Button>
                                    </SheetTrigger>
                                    <SheetContent className="w-[400px] sm:w-[540px] p-0"><SheetHeader className="p-6 border-b"><SheetTitle>My Profile</SheetTitle><SheetDescription>View your profile details.</SheetDescription></SheetHeader><div className="overflow-y-auto p-6"><ProfileContent /></div></SheetContent>
                                </Sheet>
                            )}
                        </TooltipTrigger>
                        <TooltipContent><p>Profile</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
             )}

             {/* Messages Button */} 
             {session?.user && (
                 <TooltipProvider>
                     <Tooltip>
                         <TooltipTrigger asChild>
                            <Link href="/messages" passHref>
                                <Button variant="ghost" size="icon"><Icons.mail className="h-5 w-5" /></Button>
                            </Link>
                         </TooltipTrigger>
                         <TooltipContent><p>Messages</p></TooltipContent>
                     </Tooltip>
                 </TooltipProvider>
             )}

            {/* Notifications Button/Sheet with Badge */} 
             {session?.user && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="relative" 
                                onClick={handleOpenNotifications}
                            >
                                <Icons.bell className="h-5 w-5" />
                                {unreadCount > 0 && (
                                    <Badge 
                                        variant="destructive"
                                        className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0.5 text-xs"
                                    >
                                        {unreadCount > 9 ? '9+' : unreadCount} 
                                    </Badge>
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Notifications</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
             )}
             {/* Desktop Sheet for Notifications */} 
            {!isMobile && (
                <Sheet open={isNotificationsSheetOpen} onOpenChange={setIsNotificationsSheetOpen}>
                     <SheetContent className="w-[400px] sm:w-[500px] flex flex-col p-0">
                         <SheetHeader className="p-4 border-b"><SheetTitle>Notifications</SheetTitle></SheetHeader>
                         <div className="flex-1 overflow-y-auto p-2"><NotificationsContent /></div>
                    </SheetContent>
                </Sheet>
            )}

             {/* Logout Button */} 
             {session?.user && (
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={handleLogout}>
                                <Icons.logOut className="h-5 w-5" />
                                <span className="sr-only">Logout</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Logout</p></TooltipContent>
                    </Tooltip>
                 </TooltipProvider>
             )}
             {/* Login/Register Buttons if not logged in */} 
             {!session?.user && status !== 'loading' && (
                 <>
                     <Link href="/auth" passHref><Button variant="outline" size={isMobile ? "sm" : "default"}>Login</Button></Link>
                     <Link href="/auth/register" passHref><Button size={isMobile ? "sm" : "default"}>Register</Button></Link>
                 </>
             )}
        </div>
     </div>
  );

  const renderItemCard = (item: Item) => (
    <Card key={item.id} className="flex flex-col">
      <CardHeader>
        {item.mediaUrls && item.mediaUrls.length > 0 ? (
           <img src={item.mediaUrls[0]} alt={item.title} className="aspect-video w-full rounded-md object-cover mb-4" />
        ) : (
           <div className="aspect-video w-full bg-secondary rounded-md mb-4 flex items-center justify-center text-muted-foreground">No Image</div>
        )}
        <CardTitle>{item.title}</CardTitle>
        {/* <CardDescription className="text-sm text-muted-foreground">Posted by: {item.sellerId}</CardDescription> */}
        <CardDescription className="text-sm text-muted-foreground">{item.location}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
         <p className="mb-2 text-lg font-semibold">KES {item.price.toLocaleString()}</p>
         <p className="text-sm text-muted-foreground truncate">{item.description}</p>
          <Badge
            variant={item.status === 'sold' ? 'destructive' : item.status === 'pending' ? 'secondary' : 'default'}
            className="mt-2"
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Badge>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button variant="outline" className="w-full">
             View Details
        </Button>
        {session?.user && session.user.id !== item.sellerId ? (
            <Link href={`/messages?sellerId=${item.sellerId}&itemId=${item.id}`} passHref>
                <Button className="w-full">
                    Message Seller
                </Button>
            </Link>
        ) : !session?.user ? (
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
        ) : ( // User is logged in but is the seller
             <Button className="w-full" disabled>
                Your Listing
             </Button>
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
                 <Skeleton className="h-6 w-1/4 mt-2"/>
             </CardContent>
             <CardFooter className="flex flex-col gap-2">
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
             </CardFooter>
        </Card>
     ))
  );

  // Show loading skeletons if session is loading OR items are loading
  if (status === "loading" || (status === "authenticated" && isLoadingItems)) {
    return (
        <div className="container mx-auto p-4 md:p-6">
            {renderHeader()} {/* Render header even while loading */}
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
        <div className="text-center text-red-600 my-6">
          <p>Error loading items: {error}</p>
        </div>
      )}

      {!error && items.length === 0 && status !== 'loading' && (
        <div className="text-center text-muted-foreground mt-10">
           {session?.user ? (
              <p>No items from other sellers available yet.</p>
           ) : (
               <p>No items listed yet. Explore or log in!</p>
           )}
          {!session?.user && (
              <div className="mt-4 space-x-4">
                 <Link href="/auth" passHref><Button>Login</Button></Link>
                 <Link href="/auth/register" passHref><Button variant="outline">Register</Button></Link>
             </div>
          )}
          {session?.user && (
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

// Default export is just the content component now
// Provider is handled in RootLayout
export default function DashboardPage() {
    return <DashboardContent />;
}
