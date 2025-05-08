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
import { useToast } from "@/hooks/use-toast";

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();
  const itemId = params?.itemId as string;

  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMessageSheetOpen, setIsMessageSheetOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false); // State for payment button

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

  const handleSendMessage = async () => {
      if (!item || !messageText.trim() || !session?.user?.id) return;
      if (session.user.id === item.sellerId) {
           toast({ title: "Action Denied", description: "You cannot message yourself.", variant: "destructive" });
           return;
      }
      setIsSendingMessage(true);
      try {
          // ... send message API call ...
           const response = await fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  recipientId: item.sellerId,
                  itemId: item.id,
                  itemTitle: item.title,
                  itemImageUrl: item.mediaUrls?.[0] ?? null,
                  text: messageText.trim(),
              }),
          });
          const result = await response.json();
          if (!response.ok) {
              throw new Error(result.message || 'Failed to send message');
          }
          toast({ title: "Message Sent", description: "Your message has been sent." });
          setIsMessageSheetOpen(false); 
          setMessageText("");
      } catch (err) {
           const message = err instanceof Error ? err.message : 'Failed to send message.';
           console.error("Error sending message from item detail:", err);
           toast({ title: "Send Error", description: message, variant: "destructive" });
      } finally {
          setIsSendingMessage(false);
      }
  };

  // --- Handle Initiate Payment --- 
  const handleInitiatePayment = async () => {
      if (!item || !session?.user?.id) {
           toast({ title: "Login Required", description: "Please log in to purchase items.", variant: "destructive" });
           return;
      }
      if (item.status !== 'available') {
            toast({ title: "Not Available", description: "This item is no longer available for purchase.", variant: "destructive" });
            return;
      }
      if (session.user.id === item.sellerId) {
           toast({ title: "Action Denied", description: "You cannot purchase your own item.", variant: "destructive" });
           return;
      }

      setIsInitiatingPayment(true);
      try {
            console.log(`Initiating payment for item: ${item.id}, amount: ${item.price}`); // Log amount
            const response = await fetch('/api/payment/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Corrected body to include amount
                body: JSON.stringify({ 
                    itemId: item.id, 
                    amount: item.price // Include the item price
                })
            });
            const result = await response.json();

            // --- Adjust based on Paystack Response --- 
            // Paystack's initialize returns authorization_url, access_code, reference
            if (!response.ok || !result.authorization_url) {
                throw new Error(result.message || 'Failed to prepare payment checkout.');
            }
            console.log(`Redirecting to Paystack checkout: ${result.authorization_url}`);
            // Redirect the user to the Paystack payment page
            window.location.href = result.authorization_url;
            // ----------------------------------------

      } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initiate payment.';
            console.error("Initiate Payment Error:", err);
            toast({ title: "Payment Error", description: message, variant: "destructive" });
            setIsInitiatingPayment(false); 
      }
  };
  // -------------------------

  // --- RENDER LOGIC --- 

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
             <Skeleton className="h-10 w-full mt-2" /> 
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
  const isMyListing = session?.user?.id === item.sellerId;
  const isAvailable = item.status === 'available';

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

           {/* Action Buttons Container */} 
            <div className="pt-4 space-y-3"> 
                {/* Buy/Payment Button */} 
                {!isMyListing && (
                     <Button 
                         className="w-full" 
                         onClick={handleInitiatePayment} 
                         disabled={!isAvailable || isInitiatingPayment || !session?.user}
                     >
                         {isInitiatingPayment && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                         {isAvailable ? (isInitiatingPayment ? 'Processing...' : 'Buy Now / Make Payment') : `Item ${item.status}`}
                     </Button>
                 )}
                {isMyListing && (
                  <Button className="w-full" disabled>This is Your Listing</Button>
                )}
                
                {/* Message Seller Button / Sheet */} 
                {!isMyListing && (
                  <Sheet open={isMessageSheetOpen} onOpenChange={setIsMessageSheetOpen}>
                      <SheetTrigger asChild>
                          <Button variant="outline" className="w-full" disabled={!session?.user}>
                             <Icons.mail className="mr-2 h-4 w-4" /> 
                             {session?.user ? 'Message Seller' : 'Login to Message'}
                          </Button>
                      </SheetTrigger>
                      <SheetContent>
                         <SheetHeader>
                             <SheetTitle>Send Message to Seller</SheetTitle>
                             <SheetDescription>Regarding item: {item.title}</SheetDescription>
                         </SheetHeader>
                         <div className="grid gap-4 py-4">
                             <div className="grid gap-2">
                                 <Label htmlFor="message-detail-text">Message</Label>
                                 <Textarea 
                                    id="message-detail-text"
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
               )}
            </div>
        </div>
      </div>
    </div>
  );
}
