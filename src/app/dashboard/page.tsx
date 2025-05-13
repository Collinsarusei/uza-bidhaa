'use client';

import { useEffect, useState, useRef, useMemo } from "react";
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
    SheetFooter,
    SheetClose
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileContent } from "@/components/profile-content";
import { NotificationsContent } from "@/components/notifications-content";
import { useRouter } from 'next/navigation';
import { useNotifications } from "@/components/providers/notification-provider"; 
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from 'date-fns'; // Import for relative time

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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMessageSheetOpen, setIsMessageSheetOpen] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<{ sellerId: string; itemId: string; itemTitle: string; itemImageUrl: string | null } | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { unreadCount, markAllAsRead } = useNotifications();

  const isAdminUser = useMemo(() => {
      return session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  }, [session]);


  const handleLogout = async () => {
      await signOut({ redirect: false }); 
      router.push('/'); 
  };

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoadingItems(true);
      setError(null);
      const currentUserId = session?.user?.id;
      const apiUrl = currentUserId ? `/api/items?userId=${currentUserId}` : '/api/items'; 
      console.log(`Fetching items from: ${apiUrl}`);
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setItems(data || []);
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

  const filteredItems = useMemo(() => {
      if (!searchTerm) {
          return items;
      }
      return items.filter(item => 
          item.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [items, searchTerm]);

  const handleOpenNotifications = () => {
      if (unreadCount > 0) {
          // Call context markAllAsRead which calls the API
          contextMarkAllAsRead(); 
      }
      setIsNotificationsSheetOpen(true);
  };

  const handleOpenMessageSheet = (sellerId: string, itemId: string, itemTitle: string, itemImageUrl: string | null) => {
      setMessageRecipient({ sellerId, itemId, itemTitle, itemImageUrl });
      setMessageText(""); 
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
          setIsMessageSheetOpen(false); 
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

  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4 h-16 px-4 md:px-6 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <Link href="/dashboard" className="text-xl md:text-2xl font-bold">Marketplace Dashboard</Link>
        
        <div className="flex items-center gap-1 md:gap-2">
            {session?.user && (
                <div className="flex items-center gap-1 md:hidden"> 
                    <Link href="/messages" passHref>
                       <Button variant="ghost" size="icon"><Icons.mail className="h-5 w-5" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="relative" onClick={handleOpenNotifications}>
                         <Icons.bell className="h-5 w-5" />
                         {unreadCount > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0.5 text-xs">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
                     </Button>
                </div>
             )}

            <div className="hidden md:flex items-center gap-1"> 
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Link href="/dashboard/my-orders" passHref><Button variant="link" size="sm" className="hover:text-primary transition-colors">My Orders</Button></Link>
                     </TooltipTrigger><TooltipContent><p>View your purchases</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Link href="/dashboard/my-earnings" passHref><Button variant="link" size="sm" className="hover:text-primary transition-colors">My Earnings</Button></Link>
                     </TooltipTrigger><TooltipContent><p>View your seller earnings</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                {isAdminUser && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Link href="/admin" passHref><Button variant="link" size="sm" className="text-red-500 hover:text-red-600 transition-colors">Admin Panel</Button></Link>
                    </TooltipTrigger><TooltipContent><p>Access Admin Panel</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                 {session?.user && <div className="h-6 w-px bg-border mx-2"></div>}
                
                 {session?.user && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Link href="/dashboard/my-listings" passHref><Button variant="outline" size="default" className="hover:bg-accent hover:text-accent-foreground transition-colors">My Listings</Button></Link>
                    </TooltipTrigger><TooltipContent><p>View My Listings</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Link href="/sell" passHref><Button size="default" className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Icons.plus className="mr-1 h-4 w-4" /> Sell</Button></Link>
                 </TooltipTrigger><TooltipContent><p>Sell an Item</p></TooltipContent></Tooltip></TooltipProvider>

                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Sheet open={isProfileSheetOpen} onOpenChange={setIsProfileSheetOpen}>
                             <SheetTrigger asChild><Button variant="ghost" size="icon" className="hover:bg-accent"><Icons.user className="h-5 w-5" /></Button></SheetTrigger>
                             <SheetContent className="w-[400px] sm:w-[540px] p-0 flex flex-col">
                                <SheetHeader className="p-6 border-b sticky top-0 bg-background z-10"><SheetTitle>My Profile</SheetTitle><SheetDescription>View and manage your profile.</SheetDescription></SheetHeader>
                                <div className="flex-1 overflow-y-auto p-6"><ProfileContent /></div>
                             </SheetContent>
                         </Sheet>
                     </TooltipTrigger><TooltipContent><p>Profile</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Link href="/messages" passHref><Button variant="ghost" size="icon" className="hover:bg-accent"><Icons.mail className="h-5 w-5" /></Button></Link>
                     </TooltipTrigger><TooltipContent><p>Messages</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && (
                    <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative hover:bg-accent" onClick={handleOpenNotifications}>
                            <Icons.bell className="h-5 w-5" />
                            {unreadCount > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0.5 text-xs">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
                        </Button>
                     </TooltipTrigger><TooltipContent><p>Notifications</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-accent hover:text-destructive"><Icons.logOut className="h-5 w-5" /><span className="sr-only">Logout</span></Button>
                     </TooltipTrigger><TooltipContent><p>Logout</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {!session?.user && status !== 'loading' && (
                     <div className="space-x-2">
                         <Link href="/auth" passHref><Button variant="outline" className="hover:bg-accent hover:text-accent-foreground transition-colors">Login</Button></Link>
                         <Link href="/auth/register" passHref><Button className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Register</Button></Link>
                     </div>
                 )}
            </div>
            
            {/* Mobile Nav Trigger (same as before) */}
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
                                     <Link href="/dashboard/my-orders" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">My Orders</Button></Link>
                                     <Link href="/dashboard/my-earnings" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">My Earnings</Button></Link>
                                     {isAdminUser && (
                                        <Link href="/admin" passHref onClick={() => setIsMobileNavOpen(false)}>
                                            <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600">Admin Panel</Button>
                                        </Link>
                                     )}
                                     <Link href="/profile" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Profile</Button></Link>
                                     <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:text-red-700">Logout</Button>
                                 </>
                             ) : (
                                 <>
                                     <Link href="/auth" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Login</Button></Link>
                                     <Link href="/auth/register" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Sign Up</Button></Link>
                                 </>
                             )}
                         </div>
                    </SheetContent>
                 </Sheet>
            </div>
        </div>

        {!isMobile && (
            <Sheet open={isNotificationsSheetOpen} onOpenChange={setIsNotificationsSheetOpen}>
                 <SheetContent className="w-[400px] sm:w-[500px] flex flex-col p-0">
                     <SheetHeader className="p-4 border-b"><SheetTitle>Notifications</SheetTitle></SheetHeader>
                     <div className="flex-1 overflow-y-auto p-2"><NotificationsContent /></div>
                </SheetContent>
            </Sheet>
        )}

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

  const renderItemCard = (item: Item) => {
    let timeSinceListed = 'Date unavailable';
    if (item.createdAt) {
        try {
            timeSinceListed = formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true });
        } catch (e) {
            console.warn("Error formatting time since listed for item:", item.id, e);
        }
    }
    return (
        <Card key={item.id} className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-200 ease-in-out">
        <CardHeader className="p-0">
            <Link href={`/item/${item.id}`} passHref className="block">
                {item.mediaUrls && item.mediaUrls.length > 0 ? (
                <img src={item.mediaUrls[0]} alt={item.title} className="aspect-video w-full object-cover" />
                ) : (
                <div className="aspect-video w-full bg-secondary flex items-center justify-center text-muted-foreground">No Image</div>
                )}
            </Link>
        </CardHeader>
        <CardContent className="flex-grow p-4 space-y-1">
            <Link href={`/item/${item.id}`} passHref><CardTitle className="text-lg hover:underline">{item.title}</CardTitle></Link>
            <CardDescription className="text-sm text-muted-foreground">{item.location}</CardDescription>
            <p className="pt-1 text-lg font-semibold">KES {item.price.toLocaleString()}</p>
            <Badge
                variant={item.status === 'sold' ? 'destructive' : item.status === 'available' ? 'default' : 'secondary'}
                className="mt-1"
            >
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Badge>
            <p className="text-xs text-muted-foreground pt-1">Listed: {timeSinceListed}</p> {/* Display time since listed */}
        </CardContent>
        <CardFooter className="p-4 flex flex-col gap-2">
            <Link href={`/item/${item.id}`} passHref className="w-full">
                <Button variant="outline" className="w-full hover:bg-accent hover:text-accent-foreground transition-colors">View Details</Button>
            </Link>
            {session?.user && session.user.id !== item.sellerId ? (
                <Button 
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-0" 
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
  }

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="container mx-auto p-4 md:p-6">
                {renderHeader()} 
                <div className="mb-4">
                    <Input 
                        placeholder="Search items by name..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-sm bg-card border-border"
                    />
                </div>
                 <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {renderLoadingSkeletons()}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto p-4 md:p-6">
        {renderHeader()}
         <div className="mb-4">
              <Input 
                  placeholder="Search items by name..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm bg-card border-border"
              />
          </div>
        {error && (
          <div className="text-center text-red-600 my-6">
            <p>Error loading items: {error}</p>
          </div>
        )}
        {!error && !isLoadingItems && searchTerm && filteredItems.length === 0 && (
           <div className="text-center text-muted-foreground mt-10">
                <p>No items found matching "{searchTerm}".</p>
           </div>
        )}
        {!error && !isLoadingItems && !searchTerm && items.length === 0 && (
          <div className="text-center text-muted-foreground mt-10">
             {session?.user ? (
                <p>No items from other sellers available yet. Start by listing your own!</p>
             ) : (
                 <p>No items listed yet. Log in or register to explore!</p>
             )}
            {!session?.user && (
                <div className="mt-4 space-x-4">
                   <Link href="/auth" passHref><Button className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Login</Button></Link>
                   <Link href="/auth/register" passHref><Button variant="outline" className="hover:bg-accent hover:text-accent-foreground transition-colors">Register</Button></Link>
               </div>
            )}
            {session?.user && (
               <Link href="/sell" passHref>
                  <Button variant="link" className="mt-2 hover:text-primary transition-colors">List an Item</Button>
              </Link>
            )}
          </div>
         )}
          {!error && filteredItems.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredItems.map(renderItemCard)}
              </div>
          )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
    return <DashboardContent />;
}
