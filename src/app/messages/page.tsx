'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Conversation, Message } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns'; // Import parseISO
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// --- Types --- 
interface CategorizedConversations {
  incoming: Conversation[];
  inbox: Conversation[];
}

// --- Main Component --- 
export default function MessagesPage() {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<CategorizedConversations>({ incoming: [], inbox: [] });
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox');
  const { toast } = useToast();

  const currentUserId = session?.user?.id;

  // --- Fetch Conversations List --- 
  useEffect(() => {
    const fetchConversations = async () => {
      if (status === 'authenticated' && currentUserId) {
        setIsLoadingConversations(true);
        setError(null);
        try {
          console.log("MessagesPage: Fetching conversations...");
          const response = await fetch('/api/conversations');
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP error! ${response.status}`);
          }
          const data: CategorizedConversations = await response.json();
          console.log(`MessagesPage: Fetched conversations - Incoming: ${data.incoming.length}, Inbox: ${data.inbox.length}`);
          setConversations(data);
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

  // --- Fetch Messages for Selected Conversation --- 
  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedConversation?.id) {
         setMessages([]);
         return;
      }
      setIsLoadingMessages(true);
      setError(null);
      try {
        console.log(`MessagesPage: Fetching messages for conv ${selectedConversation.id}...`);
        const response = await fetch(`/api/messages?conversationId=${selectedConversation.id}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP error! ${response.status}`);
        }
        const data = await response.json();
        console.log(`MessagesPage: Fetched ${data.messages.length} messages.`);
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

  // --- Handle Sending Message --- 
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedConversation?.id || !currentUserId) return;
    
    const recipientId = selectedConversation.participantIds.find(id => id !== currentUserId);
    if (!recipientId) {
        console.error("Could not determine recipient ID.");
        toast({ title: "Error", description: "Could not send message.", variant: "destructive" });
        return;
    }

    setIsSending(true);
    const tempMessageId = `temp_${Date.now()}`;
    const messageText = newMessage.trim();

    setMessages(prev => [...prev, {
        id: tempMessageId,
        senderId: currentUserId,
        text: messageText,
        timestamp: new Date().toISOString(), 
    }]);
    setNewMessage("");

    try {
      console.log(`MessagesPage: Sending message to conv ${selectedConversation.id}...`);
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipientId,
          itemId: selectedConversation.itemId,
          itemTitle: selectedConversation.itemTitle || 'Item',
          itemImageUrl: selectedConversation.itemImageUrl,
          text: messageText,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to send message');
      }
      console.log("MessagesPage: Message sent successfully via API.");
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      setError(message);
      console.error("Error sending message:", err);
      toast({ title: "Send Error", description: message, variant: "destructive" });
      setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
    } finally {
      setIsSending(false);
    }
  };

  // --- Handle Approving Conversation --- 
  const handleApprove = async (conversationId: string) => {
    setIsApproving(true);
    setError(null);
    try {
      console.log(`MessagesPage: Approving conversation ${conversationId}...`);
      const response = await fetch(`/api/conversations/${conversationId}/approve`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to approve conversation');
      }
       console.log(`MessagesPage: Conversation ${conversationId} approved via API.`);
      setConversations(prev => {
          const approvedConv = prev.incoming.find(c => c.id === conversationId);
          if (!approvedConv) return prev;
          return {
              incoming: prev.incoming.filter(c => c.id !== conversationId),
              inbox: [ { ...approvedConv, approved: true }, ...prev.inbox]
          };
      });
      toast({ title: "Conversation Approved", description: "You can now chat freely." });
      const approvedConv = conversations.incoming.find(c => c.id === conversationId);
      if(approvedConv) setSelectedConversation({ ...approvedConv, approved: true }); 
      setActiveTab('inbox');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve conversation.';
      setError(message);
      console.error("Error approving conversation:", err);
      toast({ title: "Approval Error", description: message, variant: "destructive" });
    } finally {
      setIsApproving(false);
    }
  };

  // --- Helper to get other participant's info --- 
  const getOtherParticipant = (conversation: Conversation) => {
      if (!currentUserId || !conversation.participantsData) return { name: 'Unknown', avatar: null };
      const otherId = conversation.participantIds.find(id => id !== currentUserId);
      return otherId ? conversation.participantsData[otherId] || { name: 'User', avatar: null } : { name: 'Unknown', avatar: null };
  };
  
  // --- Helper to format timestamp strings ---
  const formatTimestamp = (timestamp: string | null): string => {
     if (!timestamp) return '';
     try {
         // Parse the ISO string and then format
         return formatDistanceToNow(parseISO(timestamp), { addSuffix: true });
     } catch (e) {
         console.error("Error formatting timestamp:", e);
         return 'Invalid date';
     }
  }

  // --- Render Skeletons --- 
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

  // --- Render Conversation List Item --- 
  const renderConversationItem = (conv: Conversation, isIncoming: boolean) => {
      const otherParticipant = getOtherParticipant(conv);
      const isSelected = selectedConversation?.id === conv.id;
      const hasUnread = false; // Placeholder

      return (
          <div
              key={conv.id}
              onClick={() => { if(!isIncoming) setSelectedConversation(conv); }}
              className={cn(
                  "flex items-start space-x-3 p-3 border-b cursor-pointer transition-colors",
                  isSelected && !isIncoming ? "bg-muted" : "hover:bg-muted/50",
                  isIncoming && "opacity-80 hover:opacity-100"
              )}
          >
              <Avatar className="h-10 w-10 border">
                  {/* FIX: Provide default string for alt prop */}
                  <AvatarImage src={otherParticipant.avatar ?? undefined} alt={otherParticipant.name ?? 'User avatar'} /> 
                  <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center">
                       <p className={cn("text-sm font-medium truncate", hasUnread && !isIncoming && "font-bold")}>
                           {otherParticipant.name}
                       </p>
                       {/* FIX: Format timestamp correctly */}
                       <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {formatTimestamp(conv.lastMessageTimestamp)}
                       </p>
                  </div>
                   <p className={cn("text-xs text-muted-foreground truncate", hasUnread && !isIncoming && "text-foreground")}>
                       {conv.lastMessageSnippet || 'No messages yet'}
                   </p>
                   <p className="text-xs text-muted-foreground truncate italic">
                       Item: {conv.itemTitle || 'Unknown Item'}
                   </p>
              </div>
              {isIncoming && (
                  <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={(e) => { e.stopPropagation(); handleApprove(conv.id); }}
                      disabled={isApproving}
                      className="ml-auto self-center"
                  >
                     {isApproving ? <Icons.spinner className="h-4 w-4 animate-spin" /> : "Approve"}
                  </Button>
              )}
               {hasUnread && !isIncoming && (
                    <Badge variant="destructive" className="flex-shrink-0 h-2 w-2 p-0 rounded-full self-center ml-2"></Badge>
               )}
          </div>
      );
  };

  // --- Render Chat Area --- 
  const renderChatArea = () => {
      if (!selectedConversation) {
           return (
               <div className="flex-1 flex items-center justify-center text-muted-foreground">
                   <p>Select a conversation from the inbox to start chatting.</p>
               </div>
           );
      }
      if (isLoadingMessages) {
          return (
              <div className="flex-1 flex flex-col justify-between p-4">
                   <div className="space-y-3 overflow-y-auto">
                       {Array.from({ length: 5 }).map((_, i) => renderMessageSkeleton())}
                   </div>
                   <Skeleton className="h-20 w-full mt-4" />
              </div>
          );
      }

      const otherParticipant = getOtherParticipant(selectedConversation);

      return (
          <div className="flex-1 flex flex-col border-l">
              <div className="p-3 border-b flex items-center space-x-3">
                  <Avatar className="h-9 w-9 border">
                       {/* FIX: Provide default string for alt prop */}
                      <AvatarImage src={otherParticipant.avatar ?? undefined} alt={otherParticipant.name ?? 'User avatar'} />
                      <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                     <p className="font-medium text-sm">{otherParticipant.name}</p>
                     <p className="text-xs text-muted-foreground italic truncate">Item: {selectedConversation.itemTitle || 'Unknown Item'}</p>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg) => {
                      const isSender = msg.senderId === currentUserId;
                      return (
                           <div key={msg.id} className={cn("flex", isSender ? "justify-end" : "justify-start")}>
                               <div className={cn("rounded-lg px-3 py-2 max-w-[70%] text-sm", 
                                   isSender ? "bg-primary text-primary-foreground" : "bg-muted"
                               )}>
                                   <p>{msg.text}</p>
                                   {/* FIX: Format timestamp correctly */}
                                   <p className={cn("text-xs mt-1", isSender ? "text-primary-foreground/70" : "text-muted-foreground/70", "text-right")}>
                                       {formatTimestamp(msg.timestamp)}
                                   </p>
                               </div>
                           </div>
                      );
                  })}
              </div>
               <div className="border-t p-3 bg-background">
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
          </div>
      );
  };

  // --- Main Render --- 
  if (status === 'loading') {
       return (
           <div className="flex h-screen">
                <div className="w-1/3 lg:w-1/4 border-r"><Skeleton className="h-full w-full"/></div>
                <div className="flex-1"><Skeleton className="h-full w-full"/></div>
           </div>
       );
  }
  if (status === 'unauthenticated') {
      return <div className="p-6 text-center">Please log in to view messages.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] border-t"> 
      <div className="w-full md:w-1/3 lg:w-1/4 border-r flex flex-col">
          <div className="flex border-b">
              <Button 
                  variant="ghost" 
                  className={cn("flex-1 justify-center rounded-none", activeTab === 'inbox' && "bg-muted font-semibold")}
                  onClick={() => setActiveTab('inbox')}
              >
                  Inbox ({conversations.inbox.length})
              </Button>
              <Button 
                  variant="ghost" 
                  className={cn("flex-1 justify-center rounded-none border-l", activeTab === 'incoming' && "bg-muted font-semibold")}
                  onClick={() => setActiveTab('incoming')}
              >
                 Incoming ({conversations.incoming.length})
              </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
               {isLoadingConversations && (
                   <div className="p-3 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => renderConversationSkeleton())}
                   </div>
               )}
                {!isLoadingConversations && activeTab === 'inbox' && conversations.inbox.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">Your inbox is empty.</p>
                )}
                {!isLoadingConversations && activeTab === 'incoming' && conversations.incoming.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">No incoming message requests.</p>
                )}
                {!isLoadingConversations && activeTab === 'inbox' && (
                    conversations.inbox.map(conv => renderConversationItem(conv, false))
                )}
                {!isLoadingConversations && activeTab === 'incoming' && (
                    conversations.incoming.map(conv => renderConversationItem(conv, true))
                )}
          </div>
      </div>

      <div className="hidden md:flex flex-1">
          {renderChatArea()}
      </div>
    </div>
  );
}