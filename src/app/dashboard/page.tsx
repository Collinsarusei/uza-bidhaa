'use client';

import { useEffect, useState, useRef } from "react"; // Added useRef
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
    SheetFooter, // Import SheetFooter
    SheetClose // Import SheetClose
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea"; // Import Textarea
import { Label } from "@/components/ui/label"; // Import Label
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileContent } from "@/components/profile-content";
import { NotificationsContent } from "@/components/notifications-content";
import { useRouter } from 'next/navigation';
import { useNotifications } from "@/components/providers/notification-provider"; 
import { useToast } from "@/hooks/use-toast"; // Import useToast

// --- Main Content Component --- 
function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isNotificationsSheetOpen, setIsNotificationsSheetOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false); // State for mobile nav drawer
  const [isMessageSheetOpen, setIsMessageSheetOpen] = useState(false); // State for message drawer
  const [messageRecipient, setMessageRecipient] = useState<{ sellerId: string; itemId: string; itemTitle: string; itemImageUrl: string | null } | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);

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
      // Fetch items *excluding* the user's own
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

    if (status === "authenticated") { 
      fetchItems();
    } else if (status === 'unauthenticated') {
        setIsLoadingItems(false);
        setItems([]);
    }
  }, [session?.user?.id, status]); 

  const handleOpenNotifications = () => {
      if (unreadCount > 0) {
          markAllAsRead(); 
      }
      if (isMobile) {
          router.push('/notifications');
      } else {
          setIsNotificationsSheetOpen(true);
      }
  };

  // --- Message Seller Handlers ---
  const handleOpenMessageSheet = (sellerId: string, itemId: string, itemTitle: string, itemImageUrl: string | null) => {
      setMessageRecipient({ sellerId, itemId, itemTitle, itemImageUrl });
      setMessageText(""); // Clear previous message
      setIsMessageSheetOpen(true);
  };

  const handleSendMessage = async () => {
      if (!messageRecipient || !messageText.trim() || !session?.user?.id) return;

      setIsSendingMessage(true);
      try {
          const response = await fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  recipientId: messageRecipient.sellerId,
                  itemId: messageRecipient.itemId,
                  itemTitle: messageRecipient.itemTitle,
                  itemImageUrl: messageRecipient.itemImageUrl,
                  text: messageText.trim(),
              }),
          });
          const result = await response.json();
          if (!response.ok) {
              throw new Error(result.message || 'Failed to send message');
          }
          toast({ title: "Message Sent", description: "Your message has been sent to the seller." });
          setIsMessageSheetOpen(false); // Close sheet on success
          setMessageText("");
          setMessageRecipient(null);
      } catch (err) {
           const message = err instanceof Error ? err.message : 'Failed to send message.';
           console.error("Error sending message from sheet:", err);
           toast({ title: "Send Error", description: message, variant: "destructive" });
      } finally {
          setIsSendingMessage(false);
      }
  };

  // --- Render Header --- 
  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4">
        <Link href="/dashboard" className="text-2xl md:text-3xl font-bold">Marketplace</Link>
        
        {/* --- Desktop Icons --- */} 
        <div className="hidden md:flex items-center gap-1"> 
            {session?.user && (
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                     <Link href="/dashboard/my-listings" passHref><Button variant="outline" size="default">My Listings</Button></Link>
                 </TooltipTrigger><TooltipContent><p>View My Listings</p></TooltipContent></Tooltip></TooltipProvider>
            )}
             <TooltipProvider><Tooltip><TooltipTrigger asChild>
                 <Link href="/sell" passHref><Button size="default"><Icons.plus className="mr-1 h-4 w-4" /> Sell</Button></Link>
             </TooltipTrigger><TooltipContent><p>Sell an Item</p></TooltipContent></Tooltip></TooltipProvider>

             {session?.user && (
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                     <Sheet open={isProfileSheetOpen} onOpenChange={setIsProfileSheetOpen}>
                         <SheetTrigger asChild><Button variant="ghost" size="icon"><Icons.user className="h-5 w-5" /></Button></SheetTrigger>
                         <SheetContent className="w-[400px] sm:w-[540px] p-0"><SheetHeader className="p-6 border-b"><SheetTitle>My Profile</SheetTitle><SheetDescription>View profile.</SheetDescription></SheetHeader><div className="overflow-y-auto p-6"><ProfileContent /></div></SheetContent>
                     </Sheet>
                 </TooltipTrigger><TooltipContent><p>Profile</p></TooltipContent></Tooltip></TooltipProvider>
             )}
             {session?.user && (
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                     <Link href="/messages" passHref><Button variant="ghost" size="icon"><Icons.mail className="h-5 w-5" /></Button></Link>
                 </TooltipTrigger><TooltipContent><p>Messages</p></TooltipContent></Tooltip></TooltipProvider>
             )}
            {session?.user && (
                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative" onClick={handleOpenNotifications}>
                        <Icons.bell className="h-5 w-5" />
                        {unreadCount > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0.5 text-xs">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
                    </Button>
                 </TooltipTrigger><TooltipContent><p>Notifications</p></TooltipContent></Tooltip></TooltipProvider>
            )}
             {session?.user && (
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleLogout}><Icons.logOut className="h-5 w-5" /><span className="sr-only">Logout</span></Button>
                 </TooltipTrigger><TooltipContent><p>Logout</p></TooltipContent></Tooltip></TooltipProvider>
             )}
             {!session?.user && status !== 'loading' && (
                 <div className="space-x-2">
                     <Link href="/auth" passHref><Button variant="outline">Login</Button></Link>
                     <Link href="/auth/register" passHref><Button>Register</Button></Link>
                 </div>
             )}
        </div>
        
        {/* --- Mobile Nav Trigger (Hamburger Menu) --- */} 
        <div className="md:hidden">
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                 <SheetTrigger asChild>
                     <Button variant="ghost" size="icon">
                        <Icons.menu className="h-6 w-6" /> 
                        <span className="sr-only">Open Menu</span>
                     </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[250px]">
                     <SheetHeader className="border-b pb-4 mb-4">
                         <SheetTitle>Menu</SheetTitle>
                     </SheetHeader>
                     <div className="flex flex-col gap-3">
                         {session?.user ? (
                             <>
                                 <Link href="/dashboard" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Dashboard</Button></Link>
                                 <Link href="/sell" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Sell Item</Button></Link>
                                 <Link href="/dashboard/my-listings" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">My Listings</Button></Link>
                                 <Link href="/messages" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Messages</Button></Link>
                                 <Link href="/notifications" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Notifications {unreadCount > 0 && <Badge variant="destructive" className="ml-auto">{unreadCount}</Badge>}</Button></Link>
                                 <Link href="/profile" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Profile</Button></Link>
                                 <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:text-red-700">Logout</Button>
                             </>
                         ) : (
                             <>
                                 <Link href="/auth" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Login</Button></Link>
                                 <Link href="/auth/register" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Register</Button></Link>
                             </>
                         )}
                     </div>
                </SheetContent>
             </Sheet>
        </div>

        {/* Desktop Sheet for Notifications (Hidden but controlled by state) */} 
        {!isMobile && (
            <Sheet open={isNotificationsSheetOpen} onOpenChange={setIsNotificationsSheetOpen}>
                 <SheetContent className="w-[400px] sm:w-[500px] flex flex-col p-0">
                     <SheetHeader className="p-4 border-b"><SheetTitle>Notifications</SheetTitle></SheetHeader>
                     <div className="flex-1 overflow-y-auto p-2"><NotificationsContent /></div>
                </SheetContent>
            </Sheet>
        )}

        {/* Message Seller Sheet (used by item cards) */} 
         <Sheet open={isMessageSheetOpen} onOpenChange={setIsMessageSheetOpen}>
             <SheetContent>
                 <SheetHeader>
                     <SheetTitle>Send Message to Seller</SheetTitle>
                     <SheetDescription>Regarding item: {messageRecipient?.itemTitle || 'Item'}</SheetDescription>
                 </SheetHeader>
                 <div className="grid gap-4 py-4">
                     <div className="grid gap-2">
                         <Label htmlFor="message-text">Message</Label>
                         <Textarea 
                            id="message-text"
                            placeholder="Type your message here..."
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows={4}
                            disabled={isSendingMessage}
                         />
                     </div>
                 </div>
                 <SheetFooter>
                    <SheetClose asChild>
                         <Button type="button" variant="outline" disabled={isSendingMessage}>Cancel</Button>
                     </SheetClose>
                     <Button type="button" onClick={handleSendMessage} disabled={!messageText.trim() || isSendingMessage}>
                         {isSendingMessage && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} 
                         Send Message
                     </Button>
                 </SheetFooter>
             </SheetContent>
         </Sheet>
     </div>
  );

  const renderItemCard = (item: Item) => (
    <Card key={item.id} className="flex flex-col overflow-hidden"> {/* Added overflow-hidden */} 
      <CardHeader className="p-0"> {/* Remove padding */} 
        {/* Link wrapping the image and title */} 
        <Link href={`/item/${item.id}`} passHref className="block">
             {item.mediaUrls && item.mediaUrls.length > 0 ? (
               <img src={item.mediaUrls[0]} alt={item.title} className="aspect-video w-full object-cover" />
             ) : (
               <div className="aspect-video w-full bg-secondary flex items-center justify-center text-muted-foreground">No Image</div>
             )}
         </Link>
      </CardHeader>
      <CardContent className="flex-grow p-4 space-y-1"> {/* Add padding back */} 
         <Link href={`/item/${item.id}`} passHref><CardTitle className="text-lg hover:underline">{item.title}</CardTitle></Link>
         <CardDescription className="text-sm text-muted-foreground">{item.location}</CardDescription>
         <p className="pt-1 text-lg font-semibold">KES {item.price.toLocaleString()}</p>
          <Badge
            variant={item.status === 'sold' ? 'destructive' : item.status === 'available' ? 'default' : 'secondary'} // Adjusted variants
            className="mt-1"
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Badge>
      </CardContent>
      <CardFooter className="p-4 flex flex-col gap-2"> {/* Add padding back */} 
        {/* FIX: Link View Details button */} 
         <Link href={`/item/${item.id}`} passHref className="w-full">
             <Button variant="outline" className="w-full">View Details</Button>
         </Link>
        {session?.user && session.user.id !== item.sellerId ? (
             // FIX: Use onClick to open message sheet
             <Button 
                 className="w-full" 
                 onClick={() => handleOpenMessageSheet(item.sellerId, item.id, item.title, item.mediaUrls?.[0] ?? null)}
             >
                 <Icons.mail className="mr-2 h-4 w-4" /> Message Seller
             </Button>
        ) : !session?.user ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button className="w-full" disabled> <Icons.mail className="mr-2 h-4 w-4" /> Message Seller</Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Log in to message the seller.</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
             <Button className="w-full" disabled>Your Listing</Button>
        )}
      </CardFooter>
    </Card>
  );

  const renderLoadingSkeletons = () => (
     Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="flex flex-col">
             <CardHeader>
                  <Skeleton className="aspect-video w-full rounded-b-none" />
             </CardHeader>
             <CardContent className="p-4 space-y-2">
                 <Skeleton className="h-5 w-3/4" />
                 <Skeleton className="h-4 w-1/2" />
                 <Skeleton className="h-6 w-1/4" />
                 <Skeleton className="h-6 w-1/4"/>
             </CardContent>
             <CardFooter className="p-4 flex flex-col gap-2">
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
             </CardFooter>
        </Card>
     ))
  );

  if (status === "loading" || (status === "authenticated" && isLoadingItems)) {
    return (
        <div className="container mx-auto p-4 md:p-6">
            {renderHeader()} 
            {/* FIX: Adjust grid columns for mobile/tablet */}
             <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
             // FIX: Adjust grid columns for mobile/tablet
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map(renderItemCard)}
            </div>
        )}
    </div>
  );
}

export default function DashboardPage() {
    // Provider is now in RootLayout, just render the content
    return <DashboardContent />;
}
