'use client';

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icons } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";

// Define a simple message type for the mock data
interface Message {
    id: string;
    senderId: string;
    text: string;
    timestamp: Date;
}

export default function MessagesPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sellerId = searchParams.get('sellerId');
    const itemId = searchParams.get('itemId');
    const paymentStatus = searchParams.get('payment_status'); // Read payment_status query param

    const { data: session, status } = useSession();
    const currentUserId = session?.user?.id; // Logged-in user's ID

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false); // For sending message
    const [itemDetails, setItemDetails] = useState<any>(null);
    const [itemLoading, setItemLoading] = useState(true);
    const [isPaying, setIsPaying] = useState(false); // State for payment initiation loading
    const [isConfirming, setIsConfirming] = useState(false); // State for payment confirmation loading
    const { toast } = useToast();

    // Fetch item details and initial messages
     useEffect(() => {
        const fetchItemDetails = async () => {
            if (!itemId) {
                setItemDetails(null);
                setItemLoading(false);
                return;
            }
            setItemLoading(true);
            try {
                 // Fetch item details from the API
                 const response = await fetch(`/api/items?itemId=${itemId}`);
                 if (!response.ok) {
                     throw new Error(`HTTP error! status: ${response.status}`);
                 }
                 const data = await response.json();
                 // The API now returns an array when fetching by ID
                 const fetchedItem = data.length > 0 ? data[0] : null;

                 // --- Handle Payment Status Redirection ---                 
                 if (fetchedItem) {
                    // Check if redirected from payment gateway
                    if (paymentStatus === 'success') {
                        toast({
                            title: "Payment Successful!",
                            description: "The payment is now held in escrow.",
                            variant: "success",
                        });
                        // Optimistically update item status to paid_escrow
                        fetchedItem.status = 'paid_escrow';                        
                    } else if (paymentStatus === 'cancelled') {
                        toast({
                            title: "Payment Cancelled",
                            description: "Your payment was cancelled.",
                            variant: "default", // Or appropriate variant
                        });                        
                    }                    
                 } 
                  // You might also want to handle 'failed' or other statuses
                 setItemDetails(fetchedItem);

                 // Remove the payment_status query param after processing
                 if(paymentStatus){
                    const currentPath = window.location.pathname;
                    const newSearchParams = new URLSearchParams(searchParams);
                    newSearchParams.delete('payment_status');
                    router.replace(`${currentPath}?${newSearchParams.toString()}`, undefined);
                 }

             } catch (error) {
                 console.error("Error fetching item details:", error);
                 setItemDetails(null);
                 toast({
                    title: "Error",
                    description: "Could not load item details.",
                    variant: "destructive",
                 });
             } finally {
                 setItemLoading(false);
             }
        };

        fetchItemDetails();

        // Simulate fetching initial messages        
        const mockInitialMessages: Message[] = [
            { id: 'msg1', senderId: sellerId || 'seller-1', text: `Hi, I'm interested in ${itemId ? 'your item ' + itemId : 'this item'}. Is it still available?`, timestamp: new Date(Date.now() - 60000) },
             ...(currentUserId && sellerId && currentUserId !== sellerId) ? [
                 { id: 'msg2', senderId: currentUserId, text: `Yes, it is! What is the price?`, timestamp: new Date(Date.now() - 30000) },
             ] : [],
            { id: 'msg3', senderId: sellerId || 'seller-1', text: `It's KES ${itemDetails?.price.toLocaleString() || '10,000'}.`, timestamp: new Date(Date.now() - 10000) },
        ];
        setMessages(mockInitialMessages);

    }, [sellerId, itemId, currentUserId, router, searchParams, toast]); // Removed itemDetails?.price, added router, searchParams, toast


    // --- Send Message Handler ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUserId || !sellerId || !itemId) return;

        setIsLoading(true);

        console.log(`Sending message from ${currentUserId} to ${sellerId} about item ${itemId}: ${newMessage}`);

        const sentMessage: Message = {
            id: `msg${messages.length + 1}`,
            senderId: currentUserId,
            text: newMessage,
            timestamp: new Date(),
        };

        setMessages((prevMessages) => [...prevMessages, sentMessage]);
        setNewMessage("");

        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log("Mock message sent successfully.");
             // In a real app, you would send this message to your backend
             // and potentially update the UI with the actual timestamp/ID from the backend.
        } catch (error) {
            console.error("Error sending mock message:", error);
            // Implement error handling for sending messages
        } finally {
            setIsLoading(false);
        }
    };

    // --- Handle Pay Item ---
    const handlePayItem = async () => {
        if (!itemId || !currentUserId || !sellerId) {
            toast({
                title: "Payment Error",
                description: "Missing item or user information.",
                variant: "destructive",
            });
            return;
        }

        setIsPaying(true);
        console.log(`Initiating payment for item ${itemId} by user ${currentUserId}`);

        try {
            const response = await fetch('/api/payment/initiate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ itemId }),
            });

            const data = await response.json();

            if (!response.ok) {
                 console.error("Payment Initiation API Error:", data.message);
                toast({
                    title: "Payment Failed",
                    description: data.message || "Could not initiate payment. Please try again.",
                    variant: "destructive",
                });
            } else if (data.redirectUrl) {
                console.log("Payment initiated successfully, redirecting to:", data.redirectUrl);
                window.location.href = data.redirectUrl;

            } else {
                 console.error("Payment Initiation API Error: No redirect URL received.", data);
                 toast({
                    title: "Payment Failed",
                    description: "Failed to get payment instructions from the gateway.",
                    variant: "destructive",
                });
            }

        } catch (error: any) {
            console.error("Frontend Payment Initiation Error:", error);
             toast({
                title: "Payment Error",
                description: error.message || "An unexpected error occurred during payment initiation.",
                variant: "destructive",
            });
        } finally {
            setIsPaying(false);
        }
    };

     // --- Handle Confirm Received ---
     const handleConfirmReceived = async () => {
         if (!itemId || !currentUserId || !sellerId) {
             toast({
                 title: "Confirmation Error",
                 description: "Missing item or user information.",
                 variant: "destructive",
             });
             return;
         }

         setIsConfirming(true);
         console.log(`Confirming receipt for item ${itemId} by buyer ${currentUserId}. Initiating payment release.`);

         try {
             const response = await fetch('/api/payment/release', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({ itemId, buyerId: currentUserId }),
             });

             const data = await response.json();

             if (!response.ok) {
                 console.error("Payment Release API Error:", data.message);
                 toast({
                     title: "Confirmation Failed",
                     description: data.message || "Could not confirm receipt and release payment. Please try again.",
                     variant: "destructive",
                 });
             } else {
                 console.log("Payment release initiated successfully:", data.message);
                 toast({
                     title: "Item Received Confirmed",
                     description: "Payment release to the seller has been initiated.",
                     variant: "success",
                 });
                 // Optimistically update item status to sold
                 if (itemDetails) {
                      setItemDetails({...itemDetails, status: 'sold'});
                 }
                 // Consider fetching updated item/payment status after a short delay
             }

         } catch (error: any) {
             console.error("Frontend Confirmation Error:", error);
              toast({
                 title: "Confirmation Error",
                 description: error.message || "An unexpected error occurred during confirmation.",
                 variant: "destructive",
             });
         } finally {
             setIsConfirming(false);
         }
     };


     // --- Conditional Renderings ---
    const isBuyer = currentUserId && sellerId && currentUserId !== sellerId;
    const isSeller = currentUserId && sellerId && currentUserId === sellerId;


     // Render loading or unauthorized state
    if (status === "loading") {
        return <div className="flex justify-center items-center min-h-screen">Loading session...</div>;
    }

     if (status === "unauthenticated") {
         return (
             <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground">
                 <p className="mb-4">You must be logged in to view messages.</p>
                 <Link href="/auth" passHref>
                     <Button>Login or Register</Button>
                 </Link>
             </div>
         );
     }

     // Render loading state for item details if sellerId/itemId are present
     if (itemLoading && (sellerId || itemId)) {
         return <div className="flex justify-center items-center min-h-screen">Loading item details...</div>;
     }

      // Handle missing sellerId or itemId or item details not found
     if (!sellerId || !itemId || !itemDetails) {
         return (
             <div className="flex flex-col items-center justify-center min-h-screen text-muted-foreground">
                 <p className="mb-4">Item or seller details not found.</p>
                 <Link href="/dashboard" passHref>
                     <Button variant="outline">Back to Marketplace</Button>
                 </Link>
             </div>
         );
     }


    return (
        <div className="container mx-auto p-4 md:p-6 flex flex-col h-[90vh]">
            {/* Header */}
            <Card className="mb-4">
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                         Chat about: {itemDetails.title}
                         {/* Show Pay button only if the current user is the buyer AND the item is available */}
                         {isBuyer && itemDetails.status === 'available' && (
                             <Button
                                 variant="default"
                                 onClick={handlePayItem}
                                 disabled={isPaying || isConfirming} // Disable if paying or confirming
                             >
                                 {isPaying && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                                 Pay Item (KES {itemDetails.price.toLocaleString()})
                             </Button>
                         )}

                         {/* Show Confirm Received button only if the current user is the buyer AND the item is in escrow */}
                          {isBuyer && itemDetails.status === 'paid_escrow' && (
                              <Button
                                 variant="success" // Use a variant that indicates a positive action
                                 onClick={handleConfirmReceived}
                                 disabled={isConfirming || isPaying} // Disable if confirming or paying
                             >
                                 {isConfirming && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                                 Confirm Item Received
                             </Button>
                          )}

                          {/* Show status badges */}
                         {itemDetails.status === 'sold' && (
                              <Badge variant="destructive" className="text-lg">Item Sold</Badge>
                         )}
                          {itemDetails.status === 'paid_escrow' && (
                              <Badge variant="default" className="text-lg bg-yellow-500 text-white">Payment in Escrow</Badge> // Indicate payment is held
                         )}
                           {itemDetails.status === 'available' && !isBuyer && !isSeller && ( // Show available badge to others
                                <Badge variant="secondary" className="text-lg">Available</Badge>
                           )}
                    </CardTitle>
                    <CardDescription>
                         {isBuyer ? `Seller: ${itemDetails.sellerId}` : `Buyer: ${currentUserId}`}
                         {/* In a real app, fetch and display actual seller/buyer names */}
                    </CardDescription>
                </CardHeader>
            </Card>


            {/* Message Display Area */}
            <Card className="flex-grow mb-4">
                <CardContent className="p-4 h-full">
                    <ScrollArea className="h-[calc(90vh - 250px)] pr-4"> {/* Adjust height based on header/input size */}
                         {messages.length === 0 ? (
                             <div className="flex justify-center items-center h-full text-muted-foreground">
                                 Start the conversation!
                             </div>
                         ) : (
                             messages.map((msg) => (
                                 <div
                                     key={msg.id}
                                     className={`flex items-start mb-4 ${msg.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
                                 >
                                     {msg.senderId !== currentUserId && ( // Avatar for the other user
                                         <Avatar className="h-8 w-8 mr-3">
                                             <AvatarImage src="/placeholder-avatar.png" /> {/* Replace with actual avatar */}
                                             <AvatarFallback>{msg.senderId.substring(0, 2).toUpperCase()}</AvatarFallback>
                                         </Avatar>
                                     )}
                                     <div className={`p-3 rounded-lg max-w-[70%] ${msg.senderId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                         <p className="text-sm">{msg.text}</p>
                                          <p className="text-xs text-right mt-1 opacity-75">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                                     </div>
                                     {msg.senderId === currentUserId && ( // Avatar for the current user
                                         <Avatar className="h-8 w-8 ml-3">
                                             <AvatarImage src="/placeholder-avatar.png" /> {/* Replace with actual avatar */}
                                             <AvatarFallback>{currentUserId.substring(0, 2).toUpperCase()}</AvatarFallback>
                                         </Avatar>
                                     )}
                                 </div>
                             ))
                         )}
                    </ScrollArea>
                </CardContent>
            </Card>


            {/* Message Input Area */}
            <Card>
                <CardContent className="p-4">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <Textarea
                            placeholder="Type your message..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            className="flex-grow resize-none"
                            rows={1}
                            disabled={isLoading || isPaying || isConfirming} // Disable input while actions are pending
                        />
                        <Button type="submit" size="icon" disabled={isLoading || !newMessage.trim() || isPaying || isConfirming}>
                            {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-5 w-5" />}
                             <span className="sr-only">Send message</span>
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
