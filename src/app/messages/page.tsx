'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Conversation, Message, ParticipantData } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { 
    Sheet, 
    SheetContent, 
    SheetHeader, 
    SheetTitle, 
    SheetDescription, 
    SheetFooter, 
    SheetClose
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from 'next/link';
import { useRouter } from 'next/navigation';


// --- Main Component --- 
export default function MessagesPage() {
  const { data: session, status } = useSession();
  const [allConversations, setAllConversations] = useState<Conversation[]>([]); 
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState<string | null>(null); 
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox');
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isChatSheetOpen, setIsChatSheetOpen] = useState(false);

  const currentUserId = session?.user?.id;

  // --- Fetch All Conversations List --- 
  useEffect(() => {
    const fetchConversations = async () => {
      if (status === 'authenticated' && currentUserId) {
        setIsLoadingConversations(true);
        setError(null);
        try {
          const response = await fetch('/api/conversations');
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP error! status: ${response.status}`);
          }
          const data = await response.json(); 
          setAllConversations(data.conversations || []);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch conversations.';
          setError(message);
          console.error("Error fetching conversations:", err);
        } finally {
          setIsLoadingConversations(false);
        }
      }
    };
    fetchConversations();
  }, [status, currentUserId]);

  // --- Categorize Conversations Dynamically using useMemo --- 
  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = [];
    const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };

    allConversations.forEach(conv => {
        const isApproved = conv.approved === true;
        const isLegacy = conv.approved === undefined || conv.initiatorId === undefined;

        if (isApproved || isLegacy) {
            inbox.push(conv);
        } else if (!isApproved && conv.initiatorId !== currentUserId) {
            incoming.push(conv);
        } else if (!isApproved && conv.initiatorId === currentUserId) {
             inbox.push(conv);
        }
    });
    
    inbox.sort((a, b) => {
        const timeA = a.lastMessageTimestamp ? parseISO(a.lastMessageTimestamp).getTime() : (a.createdAt ? parseISO(a.createdAt).getTime() : 0);
        const timeB = b.lastMessageTimestamp ? parseISO(b.lastMessageTimestamp).getTime() : (b.createdAt ? parseISO(b.createdAt).getTime() : 0);
        return timeB - timeA; 
    });
    incoming.sort((a, b) => {
        const timeA = a.createdAt ? parseISO(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? parseISO(b.createdAt).getTime() : 0;
        return timeB - timeA; 
    });

    return { inbox, incoming };

  }, [allConversations, currentUserId]);

  // --- Fetch Messages --- 
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedConversation?.id) {
         setMessages([]); 
         return;
      }
      setIsLoadingMessages(true);
      setError(null);
      try {
        const response = await fetch(`/api/messages?conversationId=${selectedConversation.id}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Update selected conversation data if returned by API
        if(data.conversation) setSelectedConversation(data.conversation); 
        setMessages(data.messages || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch messages.';
        setError(message);
        console.error("Error fetching messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    };
    fetchMessages();
  }, [selectedConversation?.id]);

  useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   }, [messages]);

  const handleSelectConversation = (conv: Conversation) => {
       setSelectedConversation(conv);
       if (isMobile) {
           setIsChatSheetOpen(true);
       }
   };

  // --- Handle Sending Message --- 
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedConversation?.id || !currentUserId) return;
    
    const recipientId = selectedConversation.participantIds.find(id => id !== currentUserId);
    if (!recipientId) {
        toast({ title: "Error", description: "Cannot determine recipient.", variant: "destructive" });
        return;
    }
    // FIX: Ensure itemId and itemTitle are present, provide fallback if needed
    const itemIdToSend = selectedConversation.itemId;
    const itemTitleToSend = selectedConversation.itemTitle || "this item"; // Fallback title

    if (!itemIdToSend) {
         toast({ title: "Error", description: "Cannot send message: Item ID missing for this conversation.", variant: "destructive" });
         console.error("Missing itemId in selectedConversation for sending message:", selectedConversation);
         return;
    }
    // --- End FIX ---

    setIsSending(true);
    const tempMessageId = `temp_${Date.now()}`;
    const messageText = newMessage.trim();

    // Optimistic UI update
    setMessages(prev => [...prev, {
        id: tempMessageId,
        senderId: currentUserId,
        text: messageText,
        timestamp: new Date().toISOString(), 
    }]);
    setNewMessage("");

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipientId,
          itemId: itemIdToSend, // Use variable
          itemTitle: itemTitleToSend, // Use variable
          itemImageUrl: selectedConversation.itemImageUrl,
          text: messageText,
        }),
      });
      
      const result = await response.json(); 
      if (!response.ok) {
        throw new Error(result.message || `Failed to send message (${response.status})`); 
      }
      
      // Refetch conversations to update last message snippet/timestamp
      const convResponse = await fetch('/api/conversations');
      const convData = await convResponse.json();
      if (convResponse.ok) setAllConversations(convData.conversations || []);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
      console.error("handleSendMessage Error:", err);
      toast({ title: "Send Error", description: message, variant: "destructive" });
      setMessages(prev => prev.filter(msg => msg.id !== tempMessageId)); 
    } finally {
      setIsSending(false);
    }
  };

  // --- Handle Approving Conversation --- 
  const handleApprove = async (conversationId: string) => {
    setIsApproving(conversationId);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/approve`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to approve conversation');
      }
      const approvedConv = allConversations.find(c => c.id === conversationId);
      if (approvedConv) {
           setAllConversations(prev => 
               prev.map(c => c.id === conversationId ? { ...c, approved: true } : c)
           );
           handleSelectConversation({ ...approvedConv, approved: true });
           setActiveTab('inbox');
           toast({ title: "Conversation Approved", description: "Moved to Inbox." });
      } else {
          toast({ title: "Approval Completed", description: "Refresh may be needed." }); 
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve conversation.';
      setError(message);
      toast({ title: "Approval Error", description: message, variant: "destructive" });
    } finally {
      setIsApproving(null);
    }
  };

  // --- Helpers & Renders --- 
  const getParticipantData = (conversation: Conversation | null, userId: string): ParticipantData => {
       if (!conversation?.participantsData?.[userId]) {
            // Provide better fallback based on session user
            const name = userId === currentUserId ? session?.user?.name : 'User';
            const avatar = userId === currentUserId ? session?.user?.image : null;
            return { name: name || (userId ? userId.substring(0,6) : 'User'), avatar }; // Use part of ID if name missing
       }
       return conversation.participantsData[userId];
   };
  
  const formatTimestamp = (timestamp: string | null): string => {
     if (!timestamp) return '';
     try {
         return formatDistanceToNow(parseISO(timestamp), { addSuffix: true });
     } catch (e) {
         return 'Invalid date';
     }
  }

  const renderConversationSkeleton = () => (
      <div className="flex items-center space-x-3 p-3 border-b">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
          </div>
      </div>
  );
  const renderMessageSkeleton = () => (
      <div className="flex items-start space-x-2 p-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1 rounded-md bg-muted p-2">
               <Skeleton className="h-3 w-1/4" />
               <Skeleton className="h-4 w-3/4" />
          </div>
      </div>
  );

  const renderConversationItem = (conv: Conversation, isIncomingView: boolean) => {
      const otherUserId = conv.participantIds.find(id => id !== currentUserId) || 'unknown';
      const otherParticipant = getParticipantData(conv, otherUserId);
      const isSelected = selectedConversation?.id === conv.id;
      const hasUnread = false; // Placeholder

      return (
          <div
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={cn(
                  "flex items-start space-x-3 p-3 border-b cursor-pointer transition-colors",
                  isSelected && !isMobile ? "bg-muted" : "hover:bg-muted/50",
                  isIncomingView && "opacity-80 hover:opacity-100"
              )}
          >
              <Avatar className="h-10 w-10 border">
                  <AvatarImage src={otherParticipant.avatar ?? undefined} alt={otherParticipant.name ?? 'User avatar'} /> 
                  <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center">
                       <p className={cn("text-sm font-medium truncate", hasUnread && "font-bold")}>
                           {otherParticipant.name ?? 'User'} {/* Fallback name */}
                       </p>
                       <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {formatTimestamp(conv.lastMessageTimestamp)}
                       </p>
                  </div>
                   <p className={cn("text-xs text-muted-foreground truncate", hasUnread && "text-foreground")}>
                       {conv.lastMessageSnippet || 'No messages yet'}
                   </p>
                   <p className="text-xs text-muted-foreground truncate italic">
                       Item: {conv.itemTitle || 'Item details missing'} {/* Indicate if title missing */}
                   </p>
              </div>
              {isIncomingView && (
                  <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={(e) => { e.stopPropagation(); handleApprove(conv.id); }}
                      disabled={isApproving === conv.id} 
                      className="ml-auto self-center"
                  >
                     {isApproving === conv.id ? <Icons.spinner className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
              )}
               {hasUnread && !isIncomingView && (
                    <Badge variant="destructive" className="flex-shrink-0 h-2 w-2 p-0 rounded-full self-center ml-2"></Badge>
               )}
          </div>
      );
  };

  const renderChatAreaContent = (conversation: Conversation | null) => {
        if (!conversation) {
           return (
               <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                   <p>Select a conversation from the inbox to start chatting.</p>
               </div>
           );
      }
      
      const canChat = conversation.approved || conversation.initiatorId === currentUserId || (conversation.approved === undefined && conversation.initiatorId === undefined); // Allow chat in legacy convos
      const otherUserId = conversation.participantIds.find(id => id !== currentUserId) || 'unknown';
      const otherParticipant = getParticipantData(conversation, otherUserId);
      const paymentButtonLink = conversation.itemId ? `/item/${conversation.itemId}` : '#'; // Fallback link if no itemId

        return (
             <div className="flex-1 flex flex-col h-full"> 
                <div className="p-3 border-b flex items-center space-x-3 sticky top-0 bg-background z-10">
                     <Avatar className="h-9 w-9 border">
                        <AvatarImage src={otherParticipant.avatar ?? undefined} alt={otherParticipant.name ?? 'User avatar'} />
                        <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                     </Avatar>
                     <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-sm truncate">{otherParticipant.name ?? 'User'}</p>
                        <p className="text-xs text-muted-foreground italic truncate">Item: {conversation.itemTitle || 'Item details missing'}</p>
                     </div>
                     {conversation.itemId && (
                           <Link href={paymentButtonLink} passHref>
                              <Button size="sm" variant="outline" title={`View or pay for ${conversation.itemTitle}`}>
                                   <Icons.circleDollarSign className="h-4 w-4 mr-1" /> Pay
                               </Button>
                            </Link>
                       )}
                </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}> {/* Added smooth scroll */} 
                      {isLoadingMessages && (
                         <div className="space-y-3">
                             {Array.from({ length: 5 }).map((_, i) => renderMessageSkeleton())}
                         </div>
                     )}
                     {!isLoadingMessages && messages.map((msg) => {
                         const isSender = msg.senderId === currentUserId;
                         const senderInfo = getParticipantData(conversation, msg.senderId);
                         return (
                            <div key={msg.id} className={cn("flex items-end gap-2", isSender ? "justify-end" : "justify-start")}>
                                {!isSender && (
                                     <Avatar className="h-6 w-6 border flex-shrink-0">
                                         <AvatarImage src={senderInfo.avatar ?? undefined} alt={senderInfo.name ?? 'Sender'} />
                                         <AvatarFallback>{senderInfo.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                                     </Avatar>
                                )}
                                <div className={cn("rounded-lg px-3 py-2 max-w-[70%] break-words text-sm", 
                                   isSender ? "bg-primary text-primary-foreground" : "bg-muted"
                                )}>
                                   <p className="whitespace-pre-wrap">{msg.text}</p> {/* Allow wrapping */} 
                                   <p className={cn("text-xs mt-1 opacity-70", isSender ? "text-right" : "text-left")}>
                                       {formatTimestamp(msg.timestamp)}
                                   </p>
                               </div>
                               {isSender && (
                                    <Avatar className="h-6 w-6 border flex-shrink-0">
                                        <AvatarImage src={senderInfo.avatar ?? undefined} alt={senderInfo.name ?? 'You'} />
                                        <AvatarFallback>{senderInfo.name?.charAt(0)?.toUpperCase() || 'Y'}</AvatarFallback>
                                    </Avatar>
                               )}
                            </div>
                         );
                     })}
                      <div ref={messagesEndRef} /> 
                 </div>
                 {canChat ? (
                     <div className="border-t p-3 bg-background mt-auto sticky bottom-0">
                         <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                             <Textarea
                                 placeholder="Type your message..."
                                 value={newMessage}
                                 onChange={(e) => setNewMessage(e.target.value)}
                                 rows={1}
                                 className="flex-1 resize-none max-h-24 overflow-y-auto p-2 text-sm"
                                 onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage(e); }}
                                 disabled={isSending}
                             />
                             <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}>
                                {isSending ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
                                 <span className="sr-only">Send</span>
                             </Button>
                         </form>
                     </div>
                 ) : (
                    <div className="border-t p-4 bg-muted text-center text-sm text-muted-foreground mt-auto sticky bottom-0">
                        Waiting for seller to approve the message request.
                    </div>
                 )}
             </div>
        );
    };

  // --- Main Render --- 
  if (status === 'loading') {
       return (
           <div className="flex h-screen">
                <div className="w-full md:w-1/3 lg:w-1/4 border-r"><Skeleton className="h-full w-full"/></div>
                <div className="hidden md:flex flex-1"><Skeleton className="h-full w-full"/></div>
           </div>
       );
  }
  if (status === 'unauthenticated') {
      return <div className="p-6 text-center">Please log in to view messages.</div>;
  }

  return (
    <div className={cn("flex h-[calc(100vh-theme(spacing.16))] border-t", isMobile && "h-screen border-none")} > 
      <div className={cn("w-full md:w-1/3 lg:w-1/4 border-r flex flex-col", 
                      isMobile && isChatSheetOpen && "hidden" 
                      )}
        >
          <div className="flex border-b">
              <Button 
                  variant="ghost" 
                  className={cn("flex-1 justify-center rounded-none", activeTab === 'inbox' && "bg-muted font-semibold")}
                  onClick={() => setActiveTab('inbox')}
              >
                  Inbox ({categorizedConversations.inbox.length}) 
              </Button>
              <Button 
                  variant="ghost" 
                  className={cn("flex-1 justify-center rounded-none border-l", activeTab === 'incoming' && "bg-muted font-semibold")}
                  onClick={() => setActiveTab('incoming')}
              >
                 Incoming ({categorizedConversations.incoming.length})
              </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
               {isLoadingConversations && (
                   <div className="p-3 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => renderConversationSkeleton())}
                   </div>
               )}
                {!isLoadingConversations && activeTab === 'inbox' && categorizedConversations.inbox.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">Your inbox is empty.</p>
                )}
                {!isLoadingConversations && activeTab === 'incoming' && categorizedConversations.incoming.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">No incoming message requests.</p>
                )}
                {!isLoadingConversations && activeTab === 'inbox' && (
                    categorizedConversations.inbox.map(conv => renderConversationItem(conv, false))
                )}
                {!isLoadingConversations && activeTab === 'incoming' && (
                    categorizedConversations.incoming.map(conv => renderConversationItem(conv, true))
                )}
          </div>
      </div>

      {/* Desktop Chat Area */} 
      <div className="hidden md:flex flex-1">
          {renderChatAreaContent(selectedConversation)}
      </div>
      
      {/* Mobile Chat Area (Sheet) */}
       {isMobile && (
            <Sheet open={isChatSheetOpen} onOpenChange={(open) => {
                 setIsChatSheetOpen(open);
                 if (!open) setSelectedConversation(null); 
             }}>
                 <SheetContent className="p-0 w-full flex flex-col h-screen"> 
                      {renderChatAreaContent(selectedConversation)} 
                  </SheetContent>
             </Sheet>
       )}
    </div>
  );
}