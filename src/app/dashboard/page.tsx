// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState, useRef, useMemo } from "react"; // useRef not used, can be removed
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
// import { useIsMobile } from "@/hooks/use-mobile"; // Not strictly needed
import { ProfileContent } from "@/components/profile-content";
import { NotificationsContent } from "@/components/notifications-content";
import { useRouter } from 'next/navigation';
import { useNotifications } from "@/components/providers/notification-provider";
import { useToast } from "@/hooks/use-toast";
import { formatTimestampForDisplay } from '@/lib/date-utils';
import { TrackingDisplay } from '@/components/items/tracking-display';
import { PWAInstallButton } from "@/components/pwa-install-button";

function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isNotificationsSheetOpen, setIsNotificationsSheetOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMessageSheetOpen, setIsMessageSheetOpen] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<{ sellerId: string; itemId: string; itemTitle: string; itemImageUrl: string | null } | null>(null);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { unreadCount, markAllAsRead: markAllNotificationsAsRead } = useNotifications(); // Renamed to avoid conflict if local markAllAsRead exists

  const isAdminUser = useMemo(() => {
      return session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  }, [session]);

  const handleLogout = async () => {
      await signOut({ redirect: false });
      router.push('/');
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
          content: messageText.trim(),
          itemTitle: messageRecipient.itemTitle,
          itemImageUrl: messageRecipient.itemImageUrl
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }

      toast({
        title: "Message Sent",
        description: "Your message has been sent to the seller.",
        duration: 3000
      });
      setIsMessageSheetOpen(false);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to Send Message",
        description: error.message || "Please try again later.",
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoadingItems(true);
      setError(null);
      try {
        const currentUserId = session?.user?.id;
        const apiUrl = currentUserId ? `/api/items?userId=${currentUserId}` : '/api/items';
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
         let message = "Failed to fetch items.";
        if (err instanceof Error) {
          message = err.message;
        }
         setError(message);
         console.error("Error fetching items:", err);
      } finally {
        setIsLoadingItems(false);
      }
    };

    if (status === "authenticated" || status === "unauthenticated") {
        fetchItems();
    } else if (status === 'loading') {
      setIsLoadingItems(true);
    }
  }, [session?.user?.id, status]);

  const filteredItems = useMemo(() => {
      if (!searchTerm) return items;
      return items.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [items, searchTerm]);

  const handleOpenNotifications = () => {
      if (unreadCount > 0) markAllNotificationsAsRead();
      setIsNotificationsSheetOpen(true);
  };

  const handleOpenMessageSheet = (sellerId: string, itemId: string, itemTitle: string, itemImageUrl: string | null) => {
      setMessageRecipient({ sellerId, itemId, itemTitle, itemImageUrl });
      setMessageText("");
      setIsMessageSheetOpen(true);
  };

  const renderHeader = () => (
     <div className="flex justify-between items-center mb-6 border-b pb-4 h-16 px-4 md:px-6 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <Link href="/dashboard" className="text-xl md:text-2xl font-bold">Marketplace Dashboard</Link>
        <div className="flex items-center gap-1 md:gap-2">
            {session?.user && (
                <div className="flex items-center gap-1 md:hidden">
                    <Link href="/messages" passHref><Button variant="ghost" size="icon"><Icons.mail className="h-5 w-5" /></Button></Link>
                    <Button variant="ghost" size="icon" className="relative" onClick={handleOpenNotifications}>
                         <Icons.bell className="h-5 w-5" />
                         {unreadCount > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 justify-center rounded-full p-0.5 text-xs">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
                     </Button>
                     <Link href="/help-center" passHref><Button variant="ghost" size="icon" className="hover:bg-accent p-2"><Icons.helpCircle className="h-5 w-5" /></Button></Link>
                </div>
             )}
            <div className="hidden md:flex items-center gap-2">
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Link href="/dashboard/my-orders" passHref><Button variant="default" size="sm" className="bg-sky-500 hover:bg-sky-600 text-white transition-colors">My Orders</Button></Link>
                     </TooltipTrigger><TooltipContent><p>View your purchases</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Link href="/dashboard/my-earnings" passHref><Button variant="default" size="sm" className="bg-teal-500 hover:bg-teal-600 text-white transition-colors">My Earnings</Button></Link>
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
                        <Link href="/dashboard/my-listings" passHref><Button variant="default" size="default" className="bg-orange-500 hover:bg-orange-600 text-white transition-colors">My Listings</Button></Link>
                    </TooltipTrigger><TooltipContent><p>View My Listings</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Link href="/sell" passHref><Button size="default" className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"><Icons.plus className="mr-1 h-4 w-4" /> Sell</Button></Link>
                 </TooltipTrigger><TooltipContent><p>Sell an Item</p></TooltipContent></Tooltip></TooltipProvider>
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                        <Link href="/help-center" passHref><Button variant="ghost" size="icon" className="hover:bg-accent p-2"><Icons.helpCircle className="h-5 w-5" /></Button></Link>
                     </TooltipTrigger><TooltipContent><p>Help Center</p></TooltipContent></Tooltip></TooltipProvider>
                 )}
                 {session?.user && <div className="h-6 w-px bg-border mx-1"></div>}
                 {session?.user && (
                     <TooltipProvider><Tooltip><TooltipTrigger asChild>
                         <Sheet open={isProfileSheetOpen} onOpenChange={setIsProfileSheetOpen}>
                             <SheetTrigger asChild><Button variant="ghost" size="icon" className="hover:bg-accent"><Icons.user className="h-5 w-5" /></Button></SheetTrigger>
                             <SheetContent className="w-[90vw] max-w-[400px] sm:max-w-[540px] p-0 flex flex-col"><SheetHeader className="p-6 border-b sticky top-0 bg-background z-10"><SheetTitle>My Profile</SheetTitle><SheetDescription>View and manage your profile.</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-6"><ProfileContent /></div></SheetContent>
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
            <div className="md:hidden">
                <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
                    <SheetTrigger asChild><Button variant="ghost" size="icon"><Icons.menu className="h-6 w-6" /><span className="sr-only">Open Menu</span></Button></SheetTrigger>
                    <SheetContent side="right" className="w-[250px]"><SheetHeader className="border-b pb-4 mb-4"><SheetTitle>Menu</SheetTitle></SheetHeader><div className="flex flex-col gap-3">
                             {session?.user ? (
                                 <>
                                     <Link href="/dashboard" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Dashboard</Button></Link>
                                     <Link href="/sell" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Sell Item</Button></Link>
                                     <Link href="/dashboard/my-listings" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="default" className="w-full justify-start bg-orange-500 hover:bg-orange-600 text-white">My Listings</Button></Link>
                                     <Link href="/dashboard/my-orders" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="default" className="w-full justify-start bg-sky-500 hover:bg-sky-600 text-white">My Orders</Button></Link>
                                     <Link href="/dashboard/my-earnings" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="default" className="w-full justify-start bg-teal-500 hover:bg-teal-600 text-white">My Earnings</Button></Link>
                                     {isAdminUser && (<Link href="/admin" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600">Admin Panel</Button></Link>)}
                                     <Link href="/help-center" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Help Center</Button></Link>
                                     <Button variant="ghost" className="w-full justify-start" onClick={() => { setIsProfileSheetOpen(true); setIsMobileNavOpen(false); }}>Profile</Button>
                                     <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:text-red-700">Logout</Button>
                                 </>
                             ) : (
                                 <>
                                     <Link href="/auth" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Login</Button></Link>
                                     <Link href="/auth/register" passHref onClick={() => setIsMobileNavOpen(false)}><Button variant="ghost" className="w-full justify-start">Sign Up</Button></Link>
                                 </>
                             )}
                    </div></SheetContent>
                 </Sheet>
            </div>
        </div>

        <Sheet open={isNotificationsSheetOpen} onOpenChange={setIsNotificationsSheetOpen}>
            <SheetContent className="w-[90vw] max-w-[400px] sm:max-w-[500px] flex flex-col p-0">
                <SheetHeader className="p-4 border-b"><SheetTitle>Notifications</SheetTitle></SheetHeader>
                <div className="flex-1 overflow-y-auto p-2"><NotificationsContent /></div>
            </SheetContent>
        </Sheet>

        <Sheet open={isMessageSheetOpen} onOpenChange={setIsMessageSheetOpen}>
            <SheetContent className="w-[90vw] max-w-[400px] sm:max-w-[500px]">
                 <SheetHeader><SheetTitle>Send Message to Seller</SheetTitle><SheetDescription>Regarding item: {messageRecipient?.itemTitle || 'Item'}</SheetDescription></SheetHeader>
                 <div className="grid gap-4 py-4"><div className="grid gap-2"><Label htmlFor="message-text">Message</Label><Textarea id="message-text" placeholder="Type your message here..." value={messageText} onChange={(e) => setMessageText(e.target.value)} rows={4} disabled={isSendingMessage}/></div></div>
                 <SheetFooter><SheetClose asChild><Button type="button" variant="outline" disabled={isSendingMessage}>Cancel</Button></SheetClose><Button type="button" onClick={handleSendMessage} disabled={!messageText.trim() || isSendingMessage}>{isSendingMessage && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} Send Message</Button></SheetFooter>
            </SheetContent>
        </Sheet>
     </div>
  );

  const renderItemCard = (item: Item) => {
    const timeSinceListed = formatTimestampForDisplay(item.createdAt, 'Date unavailable');
    return (
        <Card key={item.id} className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow duration-200 ease-in-out h-full">
            <CardHeader className="p-0">
                <Link href={`/item/${item.id}`} className="block relative w-full aspect-[4/3]">
                    {item.mediaUrls && item.mediaUrls.length > 0 ? (
                        <img 
                            src={item.mediaUrls[0]} 
                            alt={item.title} 
                            className="absolute h-full w-full object-cover object-center" 
                        />
                    ) : (
                        <div className="absolute h-full w-full bg-secondary flex items-center justify-center text-muted-foreground">
                            No Image
                        </div>
                    )}
                </Link>
            </CardHeader>
            <CardContent className="flex-grow p-2 md:p-4 space-y-1">
                <Link href={`/item/${item.id}`} className="block">
                    <CardTitle className="line-clamp-2 text-sm md:text-base hover:underline">
                        {item.title}
                    </CardTitle>
                </Link>
                <CardDescription className="text-xs text-muted-foreground line-clamp-1">
                    {item.location}
                </CardDescription>
                <p className="pt-1 text-sm md:text-base font-semibold">
                    KES {item.price.toLocaleString()}
                </p>
                {item.quantity !== undefined && item.quantity > 1 && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                        {item.quantity} available
                    </p>
                )}
                <Badge 
                    variant={item.status === 'SOLD' ? 'destructive' : item.status === 'AVAILABLE' ? 'default' : 'secondary'} 
                    className="mt-1 text-xs"
                >
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Badge>
                <p className="text-xs text-muted-foreground pt-1">
                    Listed: {timeSinceListed}
                </p>
            </CardContent>
            <CardFooter className="p-2 md:p-4 flex flex-col gap-2">
                <Link href={`/item/${item.id}`} className="w-full">
                    <Button variant="outline" size="sm" className="w-full hover:bg-accent hover:text-accent-foreground transition-colors">
                        View Details
                    </Button>
                </Link>
                {session?.user && session.user.id !== item.sellerId ? (
                    <Button 
                        size="sm"
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-0 px-3" 
                        onClick={() => handleOpenMessageSheet(item.sellerId, item.id, item.title, item.mediaUrls?.[0] ?? null)}
                    >
                        <Icons.mail className="mr-1.5 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">Message Seller</span>
                    </Button>
                ) : !session?.user ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="sm" className="w-full px-3" disabled>
                                    <Icons.mail className="mr-1.5 h-4 w-4 flex-shrink-0" />
                                    <span className="truncate">Message Seller</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Log in to message the seller.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Button size="sm" className="w-full" disabled>Your Listing</Button>
                )}
            </CardFooter>
        </Card>
    );
  }

  const renderLoadingSkeletons = () => (
     Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="flex flex-col">
             <CardHeader className="p-0"><Skeleton className="aspect-square w-full rounded-b-none" /></CardHeader>
             <CardContent className="p-4 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-6 w-1/4" /><Skeleton className="h-6 w-1/4"/></CardContent>
             <CardFooter className="p-4 flex flex-col gap-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardFooter>
        </Card>
     ))
  );

  const PurchasedItems = ({ items }: { items: Array<{ id: string; status: string }> }) => {
    const itemsInTransit = items.filter(item => item.status === 'PAID_ESCROW');

    if (itemsInTransit.length === 0) {
      return null;
    }

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Items in Transit</h2>
        <div className="grid gap-6">
          {itemsInTransit.map(item => (
            <TrackingDisplay key={item.id} itemId={item.id} />
          ))}
        </div>
      </div>
    );
  };

  if ((status === "loading" && !session) || (status === "authenticated" && isLoadingItems && items.length === 0)) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="container mx-auto px-4 py-6 md:p-6">
                {renderHeader()}
                <div className="my-6"><Input placeholder="Search items by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm bg-card border-border"/></div>
                 <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{renderLoadingSkeletons()}</div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-6 md:p-6">
        {renderHeader()}
         <div className="my-6"><Input placeholder="Search items by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm bg-card border-border"/></div>
        {error && (<div className="text-center text-red-600 my-6"><p>Error loading items: {error}</p></div>)}
        {!error && !isLoadingItems && searchTerm && filteredItems.length === 0 && (<div className="text-center text-muted-foreground mt-10"><p>No items found matching "{searchTerm}".</p></div>)}
        {!error && !isLoadingItems && !searchTerm && items.length === 0 && (
          <div className="text-center text-muted-foreground mt-10">
             {session?.user ? (<p>No items from other sellers available yet. Start by listing your own!</p>) : (<p>No items listed yet. Log in or register to explore!</p>)}
            {!session?.user && (<div className="mt-4 space-x-4"><Link href="/auth" passHref><Button className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Login</Button></Link><Link href="/auth/register" passHref><Button variant="outline" className="hover:bg-accent hover:text-accent-foreground transition-colors">Register</Button></Link></div>)}
            {session?.user && (<Link href="/sell" passHref><Button variant="link" className="mt-2 hover:text-primary transition-colors">List an Item</Button></Link>)}
          </div>
         )}
          {!error && filteredItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
                {filteredItems.map(renderItemCard)}
            </div>
        )}
      </div>
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <PWAInstallButton />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
    return <DashboardContent />;
}