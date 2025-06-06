// src/app/page/messages/MessagesPage.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { Textarea } from "@/components/ui/textarea";
import { Conversation, Message, UserProfile } from '@/lib/types'; // Ensure these types are accurate
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from 'next/link';
import { getSocket, initSocket } from '@/lib/socket-client'; // Use your client socket utility
import { produce } from 'immer'; // For easier immutable state updates

type ParticipantData = Partial<Pick<UserProfile, 'id' | 'name' | 'image'>>;

interface TypingUserInfo {
    userId: string;
    userName?: string | null;
}

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const currentUserId = session?.user?.id;

  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox');

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // For focusing

  const [usersTyping, setUsersTyping] = useState<Map<string, TypingUserInfo>>(new Map()); // userId -> { userName }
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const socket = getSocket(); // Get socket instance, init if not already

  // --- Initial Data Fetching ---
  const fetchConversations = useCallback(async () => {
    if (status !== 'authenticated' || !currentUserId) return;
    setIsLoadingConversations(true);
    setError(null);
    try {
      const response = await fetch('/api/conversations'); // This API should also return unread counts
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to fetch conversations');
      const data = await response.json();
      setAllConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingConversations(false);
    }
  }, [status, currentUserId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessagesForConversation = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`);
      if (!response.ok) throw new Error((await response.json()).message || 'Failed to fetch messages');
      const data = await response.json();
      setMessages(data.messages || []);
      // Optionally, update the selectedConversation details if `data.conversationDetails` is returned
      if (data.conversationDetails) {
        setSelectedConversation(prev => ({ ...prev, ...data.conversationDetails }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (selectedConversation?.id) {
      fetchMessagesForConversation(selectedConversation.id);
    } else {
      setMessages([]); // Clear messages if no conversation selected
    }
  }, [selectedConversation?.id, fetchMessagesForConversation]);


  // --- Socket.IO Setup and Event Handlers ---
  useEffect(() => {
    if (status !== 'authenticated' || !currentUserId) return;

    // Ensure socket is initialized. getSocket() handles this.
    const currentSocket = getSocket();
    if (!currentSocket) {
        console.warn("MessagesPage: Socket not available on mount.");
        return; // Should not happen if getSocket calls initSocket
    }

    // --- Event Listeners ---
    const handleNewMessage = (incomingMessage: Message) => {
      console.log('Client: Received "message-received" event:', incomingMessage);

      // Update messages list if it's for the currently selected conversation
      if (selectedConversation?.id === incomingMessage.conversationId) {
        setMessages(prevMessages =>
          produce(prevMessages, (draft: Message[]) => {
            if (!draft.some(m => m.id === incomingMessage.id)) {
              draft.push(incomingMessage);
            }
          })
        );
        // If message is from another user in current chat, mark as read via API
        if (incomingMessage.senderId !== currentUserId) {
            markConversationAsReadAPI(incomingMessage.conversationId);
        }
      }

      // Update allConversations list (last message snippet, timestamp, unread count)
      setAllConversations(prevConvs =>
        produce(prevConvs, (draft: any[]) => {
          const convIndex = draft.findIndex(c => c.id === incomingMessage.conversationId);
          if (convIndex !== -1) {
            draft[convIndex].lastMessageSnippet = incomingMessage.content.substring(0, 50) + (incomingMessage.content.length > 50 ? '...' : '');
            draft[convIndex].lastMessageTimestamp = incomingMessage.createdAt;
            if (selectedConversation?.id !== incomingMessage.conversationId && incomingMessage.senderId !== currentUserId) {
              draft[convIndex].unreadCount = (draft[convIndex].unreadCount || 0) + 1;
            }
          } else {
            // If conversation is new and not in list, fetch all conversations again
            // This can happen if another user initiates a new conversation with current user
            // For a more seamless UX, the 'message-received' could include enough conv data
            // to add it directly, or a separate 'new-conversation' event could be used.
            console.log("New message for a conversation not in the list, refetching conversations.");
            fetchConversations();
          }
        })
      );
    };

    const handleUserTyping = (data: { userId: string; userName?: string | null; conversationId: string }) => {
      if (data.conversationId === selectedConversation?.id && data.userId !== currentUserId) {
        setUsersTyping(prev => new Map(prev).set(data.userId, { userId: data.userId, userName: data.userName }));
      }
    };

    const handleUserStoppedTyping = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === selectedConversation?.id) {
        setUsersTyping(prev => {
          const newMap = new Map(prev);
          newMap.delete(data.userId);
          return newMap;
        });
      }
    };

    currentSocket?.on('message-received', handleNewMessage);
    currentSocket?.on('user-typing', handleUserTyping);
    currentSocket?.on('user-stopped-typing', handleUserStoppedTyping);
    // Add other listeners like 'user-online', 'user-offline' if needed for UI updates

    // Join/Leave rooms based on selectedConversation
    if (selectedConversation?.id) {
      console.log(`Client: Emitting 'join-conversation' for ${selectedConversation.id}`);
      currentSocket?.emit('join-conversation', selectedConversation.id);
    }

    return () => {
      console.log("Client: Cleaning up MessagesPage socket listeners.");
      currentSocket?.off('message-received', handleNewMessage);
      currentSocket?.off('user-typing', handleUserTyping);
      currentSocket?.off('user-stopped-typing', handleUserStoppedTyping);
      if (selectedConversation?.id) {
        console.log(`Client: Emitting 'leave-conversation' for ${selectedConversation.id}`);
        currentSocket?.emit('leave-conversation', selectedConversation.id);
      }
      setUsersTyping(new Map()); // Clear typing users when component unmounts or conversation changes
    };
  }, [socket, status, currentUserId, selectedConversation, fetchConversations]); // Add fetchConversations to deps

  // --- Mark As Read Logic ---
  const markConversationAsReadAPI = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    try {
      await fetch(`/api/conversations/${conversationId}/mark-as-read`, { method: 'POST' });
      // Optimistically update UI
      setAllConversations(prev => produce(prev, (draft: any[]) => {
        const conv = draft.find(c => c.id === conversationId);
        if (conv) conv.unreadCount = 0;
      }));
    } catch (error) {
      console.error("Failed to mark conversation as read via API:", error);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (selectedConversation?.id && (selectedConversation.unreadCount || 0) > 0) {
      markConversationAsReadAPI(selectedConversation.id);
    }
  }, [selectedConversation?.id, selectedConversation?.unreadCount, markConversationAsReadAPI]);


  // --- UI Interaction Handlers ---
  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConversation?.id === conv.id) return; // Avoid re-selecting same

    // Leave previous room if there was one
    if (socket && selectedConversation?.id) {
        socket.emit('leave-conversation', selectedConversation.id);
    }
    setUsersTyping(new Map()); // Clear typing users from old conversation
    setSelectedConversation(conv);
    setMessages([]); // Clear old messages, new ones will be fetched
    // New room will be joined by the useEffect that depends on selectedConversation
    if (isMobile) {
        // On mobile, after selecting, the message area becomes visible
        // You might want to focus the textarea here
        setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || !currentUserId || !socket || !session?.user) return;
    setIsSending(true);
    const textContent = newMessage.trim();
    setNewMessage(""); // Clear input immediately

    // Optimistic UI update
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversationId: selectedConversation.id,
      content: textContent,
      senderId: currentUserId,
      sender: {
        id: currentUserId,
        name: session.user.name || 'You',
        image: session.user.image || null,
      },
      createdAt: new Date().toISOString(),
      isSystemMessage: false,
    };
    setMessages(prev => [...prev, optimisticMessage]);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { conversationId: selectedConversation.id });


    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          text: textContent,
          // No need to send recipientId, itemId if conversationId exists
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send message');
      }
      const { newMessage: savedMessage }: { newMessage: Message } = await response.json();

      // Replace optimistic message with confirmed message from server
      // The 'message-received' socket event will also handle this,
      // but doing it here ensures the optimistic ID is replaced correctly.
      setMessages(prev =>
        produce(prev, (draft: Message[]) => {
          const index = draft.findIndex(msg => msg.id === optimisticId);
          if (index !== -1) {
            draft[index] = savedMessage;
          } else if (!draft.some(msg => msg.id === savedMessage.id)) {
            // If somehow optimistic was removed and server message not yet received by socket
            draft.push(savedMessage);
          }
        })
      );
      // No need to socket.emit from client here, API POST handler does it.
    } catch (error) {
      console.error('Error sending message:', error);
      toast({ title: "Send Error", description: (error as Error).message, variant: "destructive" });
      setMessages(prev => prev.filter(msg => msg.id !== optimisticId)); // Revert optimistic
      setNewMessage(textContent); // Put message back
    } finally {
      setIsSending(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!socket || !selectedConversation) return;

    if (!typingTimeoutRef.current) { // Only emit start if not already typing
      socket.emit('typing-start', { conversationId: selectedConversation.id });
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing-stop', { conversationId: selectedConversation.id });
      typingTimeoutRef.current = null;
    }, 2000); // Consider user stopped typing after 2s of inactivity
  };

  // --- Memoized Values & Utility Functions ---
  const categorizedConversations = useMemo(() => {
    // ... (your existing categorization and sorting logic for inbox/incoming) ...
    // Make sure to include `unreadCount` in the Conversation type and display it.
    const inbox: Conversation[] = [];
    const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };

    allConversations.forEach(conv => {
        // This logic might need adjustment based on how you define "incoming" vs "inbox"
        // (e.g., based on conv.approved or initiatorId)
      if (conv.approved || conv.initiatorId === currentUserId) { // Example logic
        inbox.push(conv);
      } else {
        incoming.push(conv);
      }
    });
    const getTimeValue = (timestamp: string | null | undefined, fallbackTimestamp: string | null | undefined = null): number => {
      const ts = timestamp ?? fallbackTimestamp;
      return ts ? parseISO(ts).getTime() : 0;
    };
    inbox.sort((a, b) => getTimeValue(b.lastMessageTimestamp, b.createdAt) - getTimeValue(a.lastMessageTimestamp, a.createdAt));
    incoming.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    return { inbox, incoming };
  }, [allConversations, currentUserId]);

  const getParticipantData = (conversation: Conversation | null, userId: string): ParticipantData => {
    // ... (your existing logic) ...
    if (!conversation?.participants) return { id: '', name: 'Unknown', image: null };
    // Your Conversation type might store participants as { userId: string, user: UserProfile }
    // Adjust this based on your actual Conversation type structure
    const participantInfo = conversation.participants.find(p => p.id === userId); // Assuming p.id is the user's ID
    return participantInfo || { id: userId, name: 'User', image: null }; // Fallback
  };

  const formatTimestamp = (timestamp: string | null): string => {
    // ... (your existing logic) ...
    return timestamp ? formatDistanceToNow(parseISO(timestamp), { addSuffix: true }) : '';
  };

  // --- Scroll to bottom ---
  useEffect(() => {
    if (messages.length) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  // --- Render Functions ---
  const renderConversationItem = (conv: Conversation, isIncomingView: boolean) => {
    const otherParticipants = conv.participants?.filter(p => p.id !== currentUserId) || [];
    const otherParticipant = otherParticipants[0] || { id: 'unknown', name: 'Unknown User', image: null };
    const isSelected = selectedConversation?.id === conv.id;
    // Unread count should come from conv.unreadCount updated by socket events or API
    const hasUnread = (conv.unreadCount || 0) > 0 && !isSelected;

    return (
        <div
            key={conv.id}
            onClick={() => handleSelectConversation(conv)}
            className={cn( /* ... your existing classes ... */
                "flex items-start space-x-3 p-3 border-b cursor-pointer transition-colors",
                isSelected && !isMobile ? "bg-muted dark:bg-slate-700" : "hover:bg-muted/50 dark:hover:bg-slate-700/50",
            )}
        >
            <Avatar className="h-10 w-10 border">
                <AvatarImage src={otherParticipant.image ?? undefined} alt={otherParticipant.name ?? 'User'} />
                <AvatarFallback>{otherParticipant.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-center">
                    <p className={cn("text-sm font-medium truncate", hasUnread && "font-bold text-primary dark:text-sky-400")}>
                    {otherParticipant?.name || (otherParticipant?.id ? `User...${otherParticipant.id.slice(-4)}` : 'Unknown User')}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {formatTimestamp(conv.lastMessageTimestamp || conv.createdAt)}
                    </p>
                </div>
                <p className={cn("text-xs text-muted-foreground truncate", hasUnread && "text-foreground font-semibold")}>
                    {conv.lastMessageSnippet || (isIncomingView ? 'Incoming request' : 'No messages yet')}
                </p>
                {conv.itemTitle && <p className="text-xs text-muted-foreground truncate italic">Item: {conv.itemTitle}</p>}
            </div>
            {/* ... Your approve button logic ... */}
            {hasUnread && !isIncomingView && (
                <Badge variant="destructive" className="flex-shrink-0 self-center ml-2 px-1.5 py-0.5 text-xs">
                    {conv.unreadCount}
                </Badge>
            )}
        </div>
    );
  };

  const renderChatAreaContent = (conversation: Conversation | null) => {
    if (!conversation) {
      return <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center h-full">Select a conversation.</div>;
    }
    // ... (your existing logic for canChat, showApprovalMessage, otherParticipant, etc.)
    const otherUserTypingNames = Array.from(usersTyping.values())
        .filter(userInfo => userInfo.userId !== currentUserId) // Should already be filtered by server emit
        .map(userInfo => userInfo.userName || "Someone")
        .join(', ');

    return (
      <div className="flex-1 flex flex-col h-full bg-background dark:bg-slate-800">
        {/* Header */}
        <div className="p-3 border-b flex items-center space-x-3 sticky top-0 bg-background dark:bg-slate-800 z-10 flex-shrink-0">
            {/* ... Avatar, Name, Item Title, Pay Button ... */}
            <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)} className={cn(isMobile ? "mr-2" : "hidden")}>
                <Icons.arrowLeft className="h-5 w-5" />
            </Button>
             <Avatar className="h-9 w-9 border"> {/* ... */}</Avatar>
             <div className="flex-1 overflow-hidden">{/* ... */}</div>
             {/* ... Pay Button ... */}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
          {isLoadingMessages && !messages.length && ( /* Skeleton */ Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/4 my-2 rounded-md" />) )}
          {!isLoadingMessages && messages.length === 0 && ( <p className="text-center text-sm text-muted-foreground py-6">No messages yet.</p> )}
          {messages.map((msg) => {
            // ... (your existing message rendering logic for sender/receiver/system messages) ...
            // Ensure isSystemMessage is handled.
            const isSender = msg.senderId === currentUserId;
            return (
                <div key={msg.id} className={cn("flex items-end gap-2", isSender ? "justify-end" : "justify-start")}>
                     {/* ... Avatar logic ... */}
                    <div className={cn("rounded-lg px-3 py-2 max-w-[70%] break-words text-sm shadow-sm", isSender ? "bg-primary text-primary-foreground" : "bg-muted dark:bg-slate-700")}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn("text-xs mt-1 opacity-70", isSender ? "text-right" : "text-left")}>{formatTimestamp(msg.createdAt)}</p>
                    </div>
                </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {otherUserTypingNames && (
            <div className="px-4 pb-1 text-xs text-muted-foreground italic h-5 flex-shrink-0">
                {otherUserTypingNames} {usersTyping.size > 1 ? "are" : "is"} typing...
            </div>
        )}

        {/* Input Footer */}
        <div className="border-t p-3 bg-background dark:bg-slate-800 mt-auto sticky bottom-0 flex-shrink-0">
          {/* ... (your logic for canChat / showApprovalMessage) ... */}
          <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
            <Textarea
              ref={textareaRef}
              placeholder="Type your message..."
              value={newMessage}
              onChange={handleTextareaChange} // Use new handler for typing indicator
              rows={1}
              className="flex-1 resize-none max-h-24 overflow-y-auto p-2 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); }}}
              disabled={isSending || isLoadingMessages /* || !socket?.connected */}
            />
            <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending /* || !socket?.connected */}>
              {isSending ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    );
  };

  // --- Main Page Structure ---
  if (status === 'loading') return <div className="flex items-center justify-center h-screen"><Icons.spinner className="h-8 w-8 animate-spin" /></div>;
  if (status === 'unauthenticated') return <div className="p-6 text-center">Please <Link href="/login" className="underline">log in</Link>.</div>;
  if (error && !isLoadingConversations && !allConversations.length) return <div className="p-6 text-center text-destructive">Error: {error}</div>;

  return (
    <div className={cn(
      "flex border-t bg-slate-50 dark:bg-slate-900",
      isMobile ? "h-[calc(100dvh-var(--mobile-nav-height,0px))]" : "h-[calc(100vh-theme(spacing.16))]" // Use 100dvh for mobile
    )}>
      {/* Conversation List Panel */}
      <div className={cn(
        "w-full md:w-1/3 lg:w-1/4 border-r flex flex-col bg-card dark:bg-slate-800/50",
        isMobile && selectedConversation && "hidden" // Hide list on mobile when a chat is open
      )}>
        {/* Tabs for Inbox/Requests */}
        <div className="flex border-b flex-shrink-0">
            {/* ... your tab buttons ... */}
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? ( /* Skeletons */ Array.from({ length: 3 }).map((_,i) => <Skeleton key={i} className="h-16 w-full my-1" />))
            : (activeTab === 'inbox' ? categorizedConversations.inbox : categorizedConversations.incoming).map(conv => renderConversationItem(conv, activeTab === 'incoming'))
          }
          {!isLoadingConversations && (activeTab === 'inbox' && !categorizedConversations.inbox.length) && <p className="p-4 text-center text-sm">Inbox empty.</p>}
          {!isLoadingConversations && (activeTab === 'incoming' && !categorizedConversations.incoming.length) && <p className="p-4 text-center text-sm">No requests.</p>}
          {error && !isLoadingConversations && <p className="p-4 text-destructive text-sm">{error}</p>}
        </div>
      </div>

      {/* Chat Area Panel */}
      <div className={cn(
        "flex-1 flex-col", // This will be shown on desktop, or on mobile if a chat is selected
        isMobile ? (selectedConversation ? "flex" : "hidden") : "hidden md:flex",
        !selectedConversation && !isMobile && "items-center justify-center" // Center "select chat" message on desktop
      )}>
        {renderChatAreaContent(selectedConversation)}
      </div>
    </div>
  );
}