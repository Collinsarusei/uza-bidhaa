'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'; // Import Suspense
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import { useToast } from "@/hooks/use-toast";
import type { Item } from '@/lib/types';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from 'date-fns';

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string | null;
}

// Extracted content into a separate component to be wrapped by Suspense
function MessageContent() {
  const searchParams = useSearchParams(); // useSearchParams is called here
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [isLoadingItem, setIsLoadingItem] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [itemDetails, setItemDetails] = useState<Item | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
      const itemIdParam = searchParams.get('itemId');
      const sellerIdParam = searchParams.get('sellerId');
      const convIdParam = searchParams.get('conversationId');

      if (!itemIdParam) {
          setError("Item ID missing.");
          setIsLoadingItem(false); setIsLoadingMessages(false);
          return;
      }
      
      setItemId(itemIdParam);
      setConversationId(convIdParam);

      const fetchInitialData = async () => {
          if (status !== 'authenticated' || !session?.user?.id) return;
          const currentUserId = session.user.id;

          setIsLoadingItem(true); setIsLoadingMessages(true); setError(null);
          try {
              const itemRes = await fetch(`/api/items?itemId=${itemIdParam}`);
              if (!itemRes.ok) { const d = await itemRes.json().catch(()=>{}); throw new Error(d?.message || `Item fetch failed: ${itemRes.statusText}`); }
              const itemDataArray = await itemRes.json();
              if (!itemDataArray || itemDataArray.length === 0) { throw new Error('Item not found.'); }
              const fetchedItem = itemDataArray[0] as Item;
              setItemDetails(fetchedItem);

              const fetchedRecipientId = fetchedItem.sellerId === currentUserId ? searchParams.get('buyerId') : fetchedItem.sellerId;
              const finalRecipientId = sellerIdParam || fetchedRecipientId;
              if (!finalRecipientId) { throw new Error("Cannot determine recipient."); }
              setRecipientId(finalRecipientId);

              const messagesApiUrl = convIdParam ? `/api/messages?conversationId=${convIdParam}` : `/api/messages?recipientId=${finalRecipientId}&itemId=${itemIdParam}`;
              const messagesRes = await fetch(messagesApiUrl);
              if (!messagesRes.ok) { const d=await messagesRes.json().catch(()=>{}); throw new Error(d?.message || `Messages fetch failed: ${messagesRes.statusText}`); }
              const messagesData = await messagesRes.json();
              setMessages(messagesData.messages || []);

          } catch (err: any) {
              console.error("Msg Page Load Error:", err);
              setError(err.message || "Failed to load conversation.");
          } finally {
              setIsLoadingItem(false);
              setIsLoadingMessages(false);
          }
      };

      if (status === 'authenticated') { fetchInitialData(); }
       else if (status === 'unauthenticated') { setError("Login required."); setIsLoadingItem(false); setIsLoadingMessages(false); }

  }, [searchParams, status, session]); // searchParams is a dependency

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleSendMessage = async () => {
      if (!newMessage.trim() || !recipientId || !itemId || isSending || status !== 'authenticated') return;
      setIsSending(true);
      const originalMessage = newMessage; setNewMessage("");
       const optimisticMessage: Message = { id: `temp-${Date.now()}`, senderId: session!.user!.id!, text: originalMessage.trim(), timestamp: new Date().toISOString() };
       setMessages(prev => [...prev, optimisticMessage]);
       scrollToBottom();
      try {
          const response = await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, itemId, text: originalMessage.trim() }) });
          const result = await response.json();
          if (!response.ok) { throw new Error(result.message || `Send failed: ${response.statusText}`); }
      } catch (err: any) {
          console.error("Send Msg Error:", err);
          toast({ title: "Error Sending", description: err.message, variant: "destructive" });
          setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
          setNewMessage(originalMessage);
      } finally { setIsSending(false); }
  };

   const handlePayItem = async () => {
        if (!itemDetails || !session?.user?.id || itemDetails.sellerId === session.user.id) return;
        setIsPaying(true);
        try {
            const response = await fetch('/api/payment/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: itemDetails.id, amount: itemDetails.price, buyerName: session.user.name || 'Buyer', buyerEmail: session.user.email }) });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.message || 'Payment init failed.'); }
             if (result.checkoutUrl) { window.location.href = result.checkoutUrl; }
              else { throw new Error('Checkout URL missing.'); }
        } catch (err: any) { console.error("Pay Init Error:", err); toast({ title: "Payment Error", description: err.message, variant: "destructive" }); setIsPaying(false); }
   };

   const handleConfirmReceived = async () => {
        if (!itemDetails || !session?.user?.id || itemDetails.sellerId === session.user.id) return;
        setIsConfirming(true);
        try {
            const response = await fetch('/api/payment/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: itemDetails.id }) });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.message || 'Failed to confirm receipt.'); }
            toast({ title: "Success", description: "Payment release initiated!" });
            setItemDetails(prev => prev ? { ...prev, status: 'sold' } : null);
        } catch (err: any) {
            console.error("Confirmation error:", err);
            toast({ title: "Confirmation Failed", description: err.message, variant: "destructive" });
        } finally { setIsConfirming(false); }
   };

  if (status === 'loading') {
      // Still show skeleton while session is resolving
      return <MessagesPageSkeleton />;
  }

   if (error) {
       return (
           <div className="container mx-auto p-4 max-w-3xl">
               <Alert variant="destructive">
                   <Icons.alertTriangle className="h-4 w-4" />
                   <AlertTitle>Error</AlertTitle>
                   <AlertDescription>{error}</AlertDescription>
               </Alert>
           </div>
       );
   }

    const currentUserId = session?.user?.id;
    const isBuyer = !!currentUserId && !!itemDetails && itemDetails.sellerId !== currentUserId;
    const isSeller = !!currentUserId && !!itemDetails && itemDetails.sellerId === currentUserId;

  return (
    <div className="container mx-auto p-4 flex flex-col h-[calc(100vh-80px)] max-w-4xl">
      <Card className="mb-4 flex-shrink-0">
           {isLoadingItem ? ( <CardHeader><Skeleton className="h-8 w-3/4"/></CardHeader> ) :
            itemDetails ? (
                <CardHeader className="flex flex-row items-center space-x-4">
                     <div className="flex-shrink-0">
                         <img 
                              src={itemDetails.mediaUrls?.[0] || '/placeholder.png'}
                              alt={itemDetails.title}
                              className="h-16 w-16 rounded-md object-cover border"
                         />
                     </div>
                      <div className="flex-grow">
                          <CardTitle className="text-xl mb-1">{itemDetails.title}</CardTitle>
                          <CardDescription>Conversation about item</CardDescription>
                           <div className="mt-2 flex gap-2 flex-wrap items-center">
                               {isBuyer && itemDetails.status === 'available' && (
                                   <Button onClick={handlePayItem} disabled={isPaying || isConfirming} size="sm">
                                       {isPaying && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} 
                                       Pay (KES {itemDetails.price.toLocaleString()})
                                   </Button>
                               )}
                                {isBuyer && itemDetails.status === 'paid_escrow' && (
                                    <Button variant="default" onClick={handleConfirmReceived} disabled={isConfirming || isPaying} size="sm">
                                       {isConfirming && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} 
                                       Confirm Received
                                   </Button>
                                )}
                               {itemDetails.status === 'sold' && (<Badge variant="destructive">Sold</Badge>)}
                                {itemDetails.status === 'paid_escrow' && (<Badge variant="default" className="bg-yellow-500 text-white hover:bg-yellow-600">In Escrow</Badge>)}
                                 {itemDetails.status === 'available' && !isBuyer && !isSeller && (<Badge variant="secondary">Available</Badge>)}
                           </div>
                     </div>
                </CardHeader>
           ) :
            ( <CardHeader><CardTitle>Item Not Found</CardTitle></CardHeader> )
           }
       </Card>

      <div className="flex-grow overflow-y-auto mb-4 bg-muted/40 p-4 rounded-md border">
           {isLoadingMessages ? (
               <div className="space-y-4">
                   <Skeleton className="h-16 w-3/4" />
                   <Skeleton className="h-16 w-3/4 ml-auto" />
               </div>
           ) : messages.length === 0 ? (
               <div className="text-center text-muted-foreground py-10">
                   <Icons.messageSquare className="h-12 w-12 mx-auto mb-3 text-gray-400"/>
                   <p>No messages yet.</p>
               </div>
           ) : (
                <div className="space-y-4">
                    {messages.map((message) => {
                        const dateObj = message.timestamp ? new Date(message.timestamp) : null;
                        return (
                            <div key={message.id} className={`flex ${message.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] p-3 rounded-lg ${message.senderId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-background border'}`}>
                                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                    <p className={`text-xs mt-1 ${message.senderId === currentUserId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                        {dateObj ? format(dateObj, 'p') : 'Sending...'}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                     <div ref={messagesEndRef} />
                </div>
           )}
       </div>

       <div className="flex-shrink-0 flex items-center gap-2 border-t pt-4">
           <Textarea
               placeholder="Type your message..."
               value={newMessage}
               onChange={(e) => setNewMessage(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
               rows={1}
               className="flex-grow resize-none min-h-[40px] max-h-[120px]"
               disabled={isSending || isLoadingMessages || isLoadingItem || itemDetails?.status === 'sold'}
           />
           <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim() || itemDetails?.status === 'sold'}>
               {isSending ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
               <span className="sr-only">Send</span>
           </Button>
       </div>
    </div>
  );
}

// Skeleton component for the page loading state
function MessagesPageSkeleton() {
    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <Card className="mb-4">
                <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
            </Card>
            <div className="space-y-4 mb-4 border p-4 rounded-md">
                <Skeleton className="h-16 w-3/4" />
                <Skeleton className="h-16 w-3/4 ml-auto" />
                <Skeleton className="h-16 w-3/4" />
            </div>
            <div className="flex gap-2 border-t pt-4">
                <Skeleton className="h-10 flex-grow"/>
                <Skeleton className="h-10 w-10"/>
            </div>
        </div>
    );
}

// The main page component now wraps MessageContent in Suspense
export default function MessagesPage() {
    return (
        <Suspense fallback={<MessagesPageSkeleton />}>
            <MessageContent />
        </Suspense>
    );
}
