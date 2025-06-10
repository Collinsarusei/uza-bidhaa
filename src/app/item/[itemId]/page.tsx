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
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [sellerName, setSellerName] = useState<string | null>(null);

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
        const response = await fetch(`/api/items?itemId=${itemId}`);
        if (!response.ok) {
          const errData = await response.json();
             throw new Error(errData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || data.length === 0) { 
           throw new Error('Item not found.');
        }

        const itemData = data[0];
        setItem(itemData);

        // Fetch seller's name
        if (itemData.sellerId) {
          const sellerResponse = await fetch(`/api/user/${itemData.sellerId}`);
          if (sellerResponse.ok) {
            const sellerData = await sellerResponse.json();
            setSellerName(sellerData.name || 'Unknown Seller');
          }
        }
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
    if (!messageText.trim() || !session?.user || !item) return;
    setIsSendingMessage(true);

    try {
      // Check if conversation already exists
      const existingConvRes = await fetch(`/api/conversations?itemId=${item.id}&sellerId=${item.sellerId}`);
      let conversationId = null;
      if (existingConvRes.ok) {
        const convData = await existingConvRes.json();
        if (convData.conversation) {
          conversationId = convData.conversation.id;
        }
      }

      // If conversation already exists, send message to that conversation
      if (conversationId) {
        const msgRes = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            text: messageText,
            recipientId: item.sellerId,
            itemId: item.id,
            itemTitle: item.title,
            itemImageUrl: item.mediaUrls?.[0] || ''
          })
        });
        if (!msgRes.ok) throw new Error('Failed to send message');
        toast({ title: 'Message Sent', description: 'Your message has been sent.' });
        router.push(`/messages?conversationId=${conversationId}`);
      } else {
        // Create new conversation and send message
        const convRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientId: item.sellerId,
            itemId: item.id,
            itemTitle: item.title,
            itemImageUrl: item.mediaUrls?.[0] || ''
          })
        });
        if (!convRes.ok) throw new Error('Failed to create conversation');
        const convData = await convRes.json();
        if (!convData.conversationId) throw new Error('Failed to get conversation ID');
        const msgRes = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: convData.conversationId,
            text: messageText,
            recipientId: item.sellerId,
            itemId: item.id,
            itemTitle: item.title,
            itemImageUrl: item.mediaUrls?.[0] || ''
          })
        });
        if (!msgRes.ok) throw new Error('Failed to send message');
        toast({ title: 'Message Sent', description: 'Your message has been sent.' });
        router.push(`/messages?conversationId=${convData.conversationId}`);
      }
      setMessageText('');
      setIsMessageSheetOpen(false);
    } catch (err) {
      console.error('Error sending message:', err);
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleInitiatePayment = async () => {
      if (!item || !session?.user?.id) {
      toast({
        title: "Login Required",
        description: "Please log in to purchase items.",
        variant: "destructive"
      });
           return;
      }

    if (item.status !== 'AVAILABLE') {
      toast({
        title: "Not Available",
        description: "This item is no longer available for purchase.",
        variant: "destructive"
      });
            return;
      }

      if (session.user.id === item.sellerId) {
      toast({
        title: "Action Denied",
        description: "You cannot purchase your own item.",
        variant: "destructive"
      });
           return;
      }

      setIsInitiatingPayment(true);
      try {
            const response = await fetch('/api/payment/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    itemId: item.id, 
          amount: item.price
                })
            });

            const result = await response.json();
            if (!response.ok || !result.authorization_url) {
                throw new Error(result.message || 'Failed to prepare payment checkout.');
            }

            window.location.href = result.authorization_url;
      } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initiate payment.';
      console.error("Payment Error:", err);
      toast({
        title: "Payment Error",
        description: message,
        variant: "destructive"
      });
    } finally {
            setIsInitiatingPayment(false); 
      }
  };

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
  const isAvailable = item.status === 'AVAILABLE';

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
       <Button variant="outline" onClick={() => router.back()} className="mb-4">
         <Icons.arrowLeft className="mr-2 h-4 w-4" /> Back to Listings
       </Button>
       
      <div className="grid md:grid-cols-2 gap-6 lg:gap-12">
        <div className="space-y-4">
           {item.mediaUrls && item.mediaUrls.length > 0 ? (
            <>
              <div className="aspect-square w-full rounded-lg overflow-hidden border">
                <img 
                  src={item.mediaUrls[selectedImageIndex]} 
                  alt={`${item.title} - Image ${selectedImageIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {item.mediaUrls.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {item.mediaUrls.map((url, index) => (
                    <button
                      key={url}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`aspect-square rounded-md overflow-hidden border-2 ${
                        selectedImageIndex === index ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={url}
                        alt={`${item.title} - Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
           ) : (
             <div className="aspect-square w-full bg-secondary rounded-lg flex items-center justify-center text-muted-foreground border">
              No images available
             </div>
           )}
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{item.title}</h1>
            <p className="text-2xl font-semibold text-primary mt-2">
              KES {item.price.toLocaleString()}
          </p>
            {sellerName && (
              <p className="text-sm text-muted-foreground mt-1">
                Listed by {sellerName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Description</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{item.description}</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Condition</p>
                <p className="font-medium">{item.condition}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="font-medium">{item.category}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-medium">{item.location}</p>
           </div>
           <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={isAvailable ? "default" : "secondary"}>
                  {item.status}
                </Badge>
            </div>
            </div>
            </div>

          <div className="pt-4 space-y-2">
            {isMyListing ? (
              <Button variant="outline" className="w-full" disabled>
                This is your listing
              </Button>
            ) : (
              <>
                {isAvailable && (
                     <Button 
                         className="w-full" 
                         onClick={handleInitiatePayment} 
                    disabled={isInitiatingPayment}
                     >
                    {isInitiatingPayment ? (
                      <>
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Icons.dollarSign className="mr-2 h-4 w-4" />
                        Buy Now
                      </>
                    )}
                     </Button>
                )}
                {canMessageSeller && (
                  <Sheet open={isMessageSheetOpen} onOpenChange={setIsMessageSheetOpen}>
                      <SheetTrigger asChild>
                      <Button variant="outline" className="w-full">
                        <Icons.messageSquare className="mr-2 h-4 w-4" />
                        Message Seller
                          </Button>
                      </SheetTrigger>
                      <SheetContent>
                         <SheetHeader>
                        <SheetTitle>Message Seller</SheetTitle>
                        <SheetDescription>
                          Send a message to the seller about this item.
                        </SheetDescription>
                         </SheetHeader>
                      <div className="py-4">
                        <Label htmlFor="message">Your Message</Label>
                                 <Textarea 
                          id="message"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                          placeholder="Type your message here..."
                          className="mt-2"
                                    rows={4}
                                 />
                         </div>
                         <SheetFooter>
                        <SheetClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </SheetClose>
                        <Button 
                          onClick={handleSendMessage}
                          disabled={!messageText.trim() || isSendingMessage}
                        >
                  {isSendingMessage ? (
                    <>
                      <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Message'
                  )}
                             </Button>
                         </SheetFooter>
                      </SheetContent>
                  </Sheet>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
