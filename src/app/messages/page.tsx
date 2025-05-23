// src/app/page/messages/MessagesPage.tsx (or your actual path)
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
import { Input } from "@/components/ui/input"; // Not used, but kept from original
import { Textarea } from "@/components/ui/textarea";
import { Conversation, Message, ParticipantData } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
    Sheet, // Not used, but kept from original
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetClose
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Not used, but kept from original

// Firebase imports for real-time updates
import {adminDb} from '@/lib/firebase-admin'; // Adjust path if your firebase init is elsewhere
import { collection, query, orderBy, onSnapshot, doc, Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  // const router = useRouter(); // Keep if used elsewhere, not directly in provided snippet logic
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUserId = session?.user?.id;

  const fetchConversations = useCallback(async () => {
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
  }, [status, currentUserId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = [];
    const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };

    allConversations.forEach(conv => {
        const isApproved = conv.approved === true;
        const isLegacyOrApproved = isApproved || (conv.approved === undefined && conv.initiatorId === undefined);
        if (isLegacyOrApproved || (!isApproved && conv.initiatorId === currentUserId)) {
            inbox.push(conv);
        } else if (!isApproved && conv.initiatorId !== currentUserId) {
            incoming.push(conv);
        }
    });

    const getTimeValue = (timestamp: string | null, fallbackTimestamp: string | null = null): number => {
        const timestampToParse = timestamp ?? fallbackTimestamp;
        if (timestampToParse && typeof timestampToParse === 'string') {
            try {
                return parseISO(timestampToParse).getTime();
            } catch (e) {
                 console.warn(`Sorting: Could not parse timestamp "${timestampToParse}"`, e);
                return 0;
            }
        }
        return 0;
    };

    inbox.sort((a, b) => {
        const timeA = getTimeValue(a.lastMessageTimestamp, a.createdAt);
        const timeB = getTimeValue(b.lastMessageTimestamp, b.createdAt);
        return timeB - timeA;
    });

    incoming.sort((a, b) => {
        const timeA = getTimeValue(a.createdAt);
        const timeB = getTimeValue(b.createdAt);
        return timeB - timeA;
    });

    return { inbox, incoming };

  }, [allConversations, currentUserId]);


  // Real-time message fetching using onSnapshot
  useEffect(() => {
    if (!selectedConversation?.id || !currentUserId) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    setIsLoadingMessages(true);
    setError(null);

    const messagesColRef = collection(db, 'conversations', selectedConversation.id, 'messages');
    const q = query(messagesColRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedMessages: Message[] = [];
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        // Ensure timestamp is converted from Firestore Timestamp to ISO string
        const timestampFromServer = data.timestamp;
        let isoTimestamp: string | null = null;
        if (timestampFromServer instanceof FirestoreTimestamp) {
            isoTimestamp = timestampFromServer.toDate().toISOString();
        } else if (typeof timestampFromServer === 'string') { // Handle cases where it might already be a string
            isoTimestamp = timestampFromServer;
        } else if (timestampFromServer && typeof timestampFromServer.toDate === 'function') { // Firebase Web SDK v8 Timestamps
            isoTimestamp = timestampFromServer.toDate().toISOString();
        }


        fetchedMessages.push({
          id: docSnapshot.id,
          senderId: data.senderId,
          text: data.text,
          timestamp: isoTimestamp,
          isSystemMessage: data.isSystemMessage || data.senderId === "system_warning", // Ensure this is captured
        } as Message); // Cast to Message, ensure your Message type is accurate
      });
      setMessages(fetchedMessages);
      setIsLoadingMessages(false);
    }, (error) => {
      console.error("Error fetching messages with snapshot:", error);
      const message = error.message || "Failed to listen for messages.";
      setError(message);
      toast({ title: "Message Error", description: message, variant: "destructive" });
      setMessages([]);
      setIsLoadingMessages(false);
    });

    // Cleanup listener on component unmount or when conversationId/currentUserId changes
    return () => unsubscribe();

  }, [selectedConversation?.id, currentUserId, toast]);


  useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   }, [messages]);


  const handleSelectConversation = (conv: Conversation) => {
       // console.log("Selecting conversation:", conv); // Keep for debugging if needed
       setSelectedConversation(conv);
       // No need to manually fetch messages here, the useEffect for onSnapshot will handle it.
   };


  const handleSendMessage = async (e?: React.FormEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedConversation?.id || !currentUserId || isSending) return;

    const recipientId = selectedConversation.participantIds.find(id => id !== currentUserId);
    if (!recipientId) {
        toast({ title: "Error", description: "Cannot determine recipient.", variant: "destructive" });
        return;
    }

    const itemIdToSend = selectedConversation.itemId;
    if (!itemIdToSend) {
         toast({ title: "Error", description: "Cannot send message: Item details missing for this conversation.", variant: "destructive" });
         console.error("Missing itemId in selectedConversation for sending message:", selectedConversation);
         return;
    }
    const itemTitleToSend = selectedConversation.itemTitle || "this item";

    setIsSending(true);
    const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // More unique temp ID
    const messageText = newMessage.trim();

    // Optimistic update
    setMessages(prev => [...prev, {
        id: tempMessageId,
        senderId: currentUserId,
        text: messageText,
        timestamp: new Date().toISOString(), // Client-generated timestamp for optimistic update
        isSystemMessage: false,
    }]);
    setNewMessage("");

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipientId,
          itemId: itemIdToSend,
          itemTitle: itemTitleToSend,
          itemImageUrl: selectedConversation.itemImageUrl,
          text: messageText,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to send message (${response.status})`);
      }
      // Message will be updated by the onSnapshot listener. No need to manually fetch.
      // Optimistic message will be replaced by the server version via onSnapshot.

    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
      console.error("handleSendMessage Error:", err);
      toast({ title: "Send Error", description: message, variant: "destructive" });
      // Revert optimistic update on error
      setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
      setNewMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };


  const handleApprove = async (conversationId: string) => {
    if (isApproving) return;
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

      // Attempt to optimistically update or refetch for immediate UI change
      // The fetchConversations() will eventually update, but this can be faster for the selected one.
      const updatedConv = allConversations.find(c => c.id === conversationId);
      if (updatedConv) {
          const newSelectedConvData = { ...updatedConv, approved: true, approvedAt: new Date().toISOString() };
          setAllConversations(prev => prev.map(c => c.id === conversationId ? newSelectedConvData : c));
          if (selectedConversation?.id === conversationId) {
              setSelectedConversation(newSelectedConvData);
          }
          // If the approved conversation was in 'incoming', move it to 'inbox' view
          handleSelectConversation(newSelectedConvData);
          setActiveTab('inbox');
          toast({ title: "Conversation Approved", description: "Moved to Inbox." });
      } else {
        // Fallback to refetching if the conversation wasn't found in current state (less likely)
        await fetchConversations(); // This will refresh the categorized lists
        const newlyFetchedConv = allConversations.find(c => c.id === conversationId && c.approved);
        if(newlyFetchedConv) handleSelectConversation(newlyFetchedConv);
        setActiveTab('inbox');
        toast({ title: "Conversation Approved", description: "Please check your inbox." });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve conversation.';
      setError(message);
      toast({ title: "Approval Error", description: message, variant: "destructive" });
    } finally {
      setIsApproving(null);
    }
  };

  const getParticipantData = (conversation: Conversation | null, userId: string): ParticipantData => {
        if (!conversation?.participantsData?.[userId]) {
            const name = userId === currentUserId ? session?.user?.name : 'User';
            const avatar = userId === currentUserId ? session?.user?.image : null;
            return { name: name || (userId ? `User ${userId.substring(0,4)}` : 'User'), avatar };
       }
       return conversation.participantsData[userId];
   };

  const formatTimestamp = (timestamp: string | null): string => {
      if (!timestamp) return '';
     try {
         if (typeof timestamp === 'string') {
            return formatDistanceToNow(parseISO(timestamp), { addSuffix: true });
         }
         return 'Invalid date input';
     } catch (e) {
         // console.error("Error parsing timestamp for formatting:", timestamp, e); // Debug if needed
         return 'A while ago'; // Fallback for invalid dates
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
        const hasUnread = false; // Implement unread logic if needed

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
                            {otherParticipant.name ?? `User ${otherUserId.substring(0,4)}`}
                        </p>
                        <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {formatTimestamp(conv.lastMessageTimestamp || conv.createdAt)}
                        </p>
                    </div>
                    <p className={cn("text-xs text-muted-foreground truncate", hasUnread && "text-foreground")}>
                        {conv.lastMessageSnippet || (isIncomingView ? 'Incoming request' : 'No messages yet')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate italic">
                         Item: {conv.itemTitle || '[Item details missing]'}
                    </p>
                </div>
                {isIncomingView && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleApprove(conv.id); }}
                        disabled={isApproving === conv.id}
                        className="ml-auto self-center flex-shrink-0"
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
               <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center h-full">
                   <p>{isMobile ? "Select a conversation" : "Select a conversation from the list to start chatting."}</p>
               </div>
           );
      }

       const isInitiator = conversation.initiatorId === currentUserId;
       const isLegacy = conversation.approved === undefined && conversation.initiatorId === undefined;
       const canChat = conversation.approved || isInitiator || isLegacy;
       const showApprovalMessage = !conversation.approved && !isInitiator && !isLegacy;

      const otherUserId = conversation.participantIds.find(id => id !== currentUserId) || 'unknown';
      const otherParticipant = getParticipantData(conversation, otherUserId);
      const paymentButtonLink = conversation.itemId ? `/item/${conversation.itemId}` : '#';
      const paymentButtonTitle = conversation.itemId
            ? `View or pay for ${conversation.itemTitle || 'this item'}`
            : 'Item details missing';

        return (
             <div className="flex-1 flex flex-col h-full bg-background">
                <div className="p-3 border-b flex items-center space-x-3 sticky top-0 bg-background z-10 flex-shrink-0">
                     <Avatar className="h-9 w-9 border">
                        <AvatarImage src={otherParticipant.avatar ?? undefined} alt={otherParticipant.name ?? 'User avatar'} />
                        <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                     </Avatar>
                     <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-sm truncate">{otherParticipant.name ?? `User ${otherUserId.substring(0,4)}`}</p>
                        <p className="text-xs text-muted-foreground italic truncate">Item: {conversation.itemTitle || '[Item details missing]'}</p>
                     </div>
                     {conversation.itemId && (
                           <Link href={paymentButtonLink} passHref legacyBehavior>
                              <a target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline" title={paymentButtonTitle}>
                                       <Icons.circleDollarSign className="h-4 w-4 mr-1" /> Pay
                                   </Button>
                               </a>
                            </Link>
                       )}
                </div>

                 <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
                    {/* Hardcoded platform safety message is REMOVED from here. System message will be rendered below. */}

                      {isLoadingMessages && !messages.length && (
                         <div className="space-y-3">
                             {Array.from({ length: 5 }).map((_, i) => renderMessageSkeleton())}
                         </div>
                     )}
                     {!isLoadingMessages && messages.length === 0 && canChat && (
                          <p className="text-center text-sm text-muted-foreground py-6">
                                No messages yet. Start the conversation!
                           </p>
                     )}
                     {!isLoadingMessages && messages.length === 0 && !canChat && (
                          <p className="text-center text-sm text-muted-foreground py-6">
                                Waiting for approval...
                           </p>
                     )}

                     {messages.map((msg) => {
                         // Check if it's a system message
                         if (msg.isSystemMessage || msg.senderId === "system_warning") {
                             return (
                                 <div key={msg.id} className="my-4 p-3 bg-yellow-100 dark:bg-yellow-700 dark:text-yellow-100 border-l-4 border-yellow-500 dark:border-yellow-400 text-yellow-700 rounded-md shadow-sm text-sm flex items-start space-x-2">
                                     <Icons.alertTriangle className="h-5 w-5 text-yellow-500 dark:text-yellow-300 flex-shrink-0 mt-0.5" />
                                     <div className="flex-1">
                                        {/* System messages might not always need a title, or title could be part of msg.text */}
                                        {/* For this specific warning, we can add the title if msg.text matches */}
                                        {msg.text.includes("For your safety, ensure all payments are made") && (
                                             <p className="font-medium">Important Security Notice</p>
                                        )}
                                         <p className="whitespace-pre-wrap">{msg.text}</p>
                                         <p className="text-xs mt-1 opacity-70 text-left">
                                            {formatTimestamp(msg.timestamp)}
                                         </p>
                                     </div>
                                 </div>
                             );
                         }

                         // Regular user message
                         const isSender = msg.senderId === currentUserId;
                         const senderInfo = getParticipantData(conversation, msg.senderId);
                         return (
                            <div key={msg.id} className={cn("flex items-end gap-2", isSender ? "justify-end" : "justify-start")}>
                                {!isSender && (
                                     <Avatar className="h-6 w-6 border flex-shrink-0 self-start">
                                         <AvatarImage src={senderInfo.avatar ?? undefined} alt={senderInfo.name ?? 'Sender'} />
                                         <AvatarFallback>{senderInfo.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                                     </Avatar>
                                )}
                                <div className={cn("rounded-lg px-3 py-2 max-w-[70%] break-words text-sm shadow-sm",
                                   isSender ? "bg-primary text-primary-foreground" : "bg-muted"
                                )}>
                                   <p className="whitespace-pre-wrap">{msg.text}</p>
                                   <p className={cn("text-xs mt-1 opacity-70", isSender ? "text-right" : "text-left")}>
                                       {formatTimestamp(msg.timestamp)}
                                   </p>
                               </div>
                               {isSender && (
                                    <Avatar className="h-6 w-6 border flex-shrink-0 self-start">
                                        <AvatarImage src={senderInfo.avatar ?? undefined} alt={senderInfo.name ?? 'You'} />
                                        <AvatarFallback>{senderInfo.name?.charAt(0)?.toUpperCase() || 'Y'}</AvatarFallback>
                                    </Avatar>
                               )}
                            </div>
                         );
                     })}
                      <div ref={messagesEndRef} />
                 </div>

                 <div className="border-t p-3 bg-background mt-auto sticky bottom-0 flex-shrink-0">
                    {canChat ? (
                         <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                             <Textarea
                                 placeholder="Type your message..."
                                 value={newMessage}
                                 onChange={(e) => setNewMessage(e.target.value)}
                                 rows={1}
                                 className="flex-1 resize-none max-h-24 overflow-y-auto p-2 text-sm border rounded-md focus-visible:ring-1 focus-visible:ring-ring"
                                 onKeyDown={(e) => {
                                     if (e.key === 'Enter' && !e.shiftKey) {
                                         e.preventDefault();
                                         handleSendMessage(e);
                                     }
                                 }}
                                 disabled={isSending || isLoadingMessages}
                             />
                             <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending || isLoadingMessages}>
                                {isSending ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
                                 <span className="sr-only">Send</span>
                             </Button>
                         </form>
                     ) : showApprovalMessage ? (
                        <div className="text-center text-sm text-muted-foreground py-2">
                            Waiting for you to approve this message request.
                            <Button
                                size="sm"
                                variant="link"
                                onClick={() => handleApprove(conversation.id)}
                                disabled={isApproving === conversation.id}
                                className="ml-2"
                            >
                                {isApproving === conversation.id ? <Icons.spinner className="h-4 w-4 animate-spin mr-1" /> : null}
                                Approve Now
                            </Button>
                        </div>
                     ) : (
                         <div className="text-center text-sm text-muted-foreground py-2">
                             Waiting for the seller to approve your message.
                         </div>
                     )}
                 </div>
             </div>
        );
    };

    if (status === 'loading') {
         return (
           <div className="flex h-[calc(100vh-theme(spacing.16))] border-t bg-slate-50 dark:bg-slate-900">
                <div className="w-full md:w-1/3 lg:w-1/4 border-r"><Skeleton className="h-full w-full"/></div>
                <div className="hidden md:flex flex-1"><Skeleton className="h-full w-full"/></div>
           </div>
       );
  }
  if (status === 'unauthenticated') {
       return <div className="p-6 text-center bg-slate-50 dark:bg-slate-900 min-h-screen">Please <Link href="/login" className="underline">log in</Link> to view messages.</div>;
  }
   if (error && !isLoadingConversations && !allConversations.length) { // Shows if initial conversation load fails
       return <div className="p-6 text-center text-destructive bg-slate-50 dark:bg-slate-900 min-h-screen">Error loading conversations: {error}</div>;
   }


  return (
    <div className={cn("flex h-[calc(100vh-theme(spacing.16))] border-t bg-slate-50 dark:bg-slate-900", isMobile && "h-[calc(100vh-var(--mobile-nav-height,4rem))] border-none")} >
      <div className={cn("w-full md:w-1/3 lg:w-1/4 border-r flex flex-col bg-card dark:bg-slate-800",
                      isMobile && selectedConversation && "hidden"
                      )}
        >
          <div className="flex border-b flex-shrink-0">
              <Button
                  variant="ghost"
                  className={cn("flex-1 justify-center rounded-none h-10", activeTab === 'inbox' && "bg-muted font-semibold")}
                  onClick={() => { setActiveTab('inbox'); setSelectedConversation(null); }} // Clear selected on tab change
              >
                  Inbox ({categorizedConversations.inbox.length})
              </Button>
              <Button
                  variant="ghost"
                  className={cn("flex-1 justify-center rounded-none border-l h-10", activeTab === 'incoming' && "bg-muted font-semibold")}
                  onClick={() => { setActiveTab('incoming'); setSelectedConversation(null); }} // Clear selected on tab change
              >
                 Requests ({categorizedConversations.incoming.length})
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
                 {error && !isLoadingConversations && <p className="p-4 text-center text-sm text-destructive">{error}</p>}
          </div>
      </div>

      <div className={cn("hidden md:flex flex-1 flex-col",
                   selectedConversation ? "" : "items-center justify-center"
                   )}>
         {renderChatAreaContent(selectedConversation)}
      </div>

       {isMobile && selectedConversation && (
            <div className="w-full flex flex-1 flex-col h-full">
                {renderChatAreaContent(selectedConversation)}
            </div>
        )}
    </div>
  );
}