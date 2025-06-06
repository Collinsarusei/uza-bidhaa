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
import { getSocket } from '@/lib/socket-client'; // Uses initSocket internally if socket is not ready
import { produce } from 'immer';

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
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox'); // 'approved' | 'pending' might be better terms

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [usersTyping, setUsersTyping] = useState<Map<string, TypingUserInfo>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const socket = getSocket(); // Get socket instance, ensures initSocket is called if needed

  // --- Initial Data Fetching ---
  const fetchConversations = useCallback(async () => {
    if (status !== 'authenticated' || !currentUserId) return;
    setIsLoadingConversations(true);
    setError(null);
    try {
      const response = await fetch('/api/conversations');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch conversations');
      const data = await response.json();
      setAllConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast({ title: "Error", description: `Failed to load conversations: ${err instanceof Error ? err.message : String(err)}`, variant: "destructive" });
    } finally {
      setIsLoadingConversations(false);
    }
  }, [status, currentUserId, toast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessagesForConversation = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch messages');
      const data = await response.json();
      setMessages(data.messages || []);
      if (data.conversationDetails) { // API can return updated conversation details
        setSelectedConversation(prev => prev ? ({ ...prev, ...data.conversationDetails }) : data.conversationDetails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast({ title: "Error", description: `Failed to load messages: ${err instanceof Error ? err.message : String(err)}`, variant: "destructive" });
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentUserId, toast]);

  useEffect(() => {
    if (selectedConversation?.id) {
      fetchMessagesForConversation(selectedConversation.id);
    } else {
      setMessages([]); // Clear messages if no conversation is selected
    }
  }, [selectedConversation?.id, fetchMessagesForConversation]);


  // --- Socket.IO Event Handlers & Room Management ---
  useEffect(() => {
    if (status !== 'authenticated' || !currentUserId || !socket) {
      // If socket is not ready yet, this effect might run before socket is initialized by getSocket()
      // getSocket() should handle initialization, so this check might be for early renders.
      return;
    }

    // Attempt to connect if socket object exists but is not connected
    if (!socket.connected) {
        console.warn("MessagesPage Effect: Socket exists but not connected. Attempting socket.connect().");
        socket.connect();
    }

    const handleNewMessage = (incomingMessage: Message) => {
      console.log('Client: Received "message-received" event:', incomingMessage);
      if (selectedConversation?.id === incomingMessage.conversationId) {
        setMessages(prevMessages =>
          produce(prevMessages, (draft: Message[]) => {
            if (!draft.some(m => m.id === incomingMessage.id)) draft.push(incomingMessage);
          })
        );
        if (incomingMessage.senderId !== currentUserId) markConversationAsReadAPI(incomingMessage.conversationId);
      }
      setAllConversations(prevConvs =>
        produce(prevConvs, (draft: Conversation[]) => {
          const convIndex = draft.findIndex(c => c.id === incomingMessage.conversationId);
          if (convIndex !== -1) {
            draft[convIndex].lastMessageSnippet = incomingMessage.content.substring(0, 50) + (incomingMessage.content.length > 50 ? '...' : '');
            draft[convIndex].lastMessageTimestamp = incomingMessage.createdAt;
            if (selectedConversation?.id !== incomingMessage.conversationId && incomingMessage.senderId !== currentUserId) {
              draft[convIndex].unreadCount = (draft[convIndex].unreadCount || 0) + 1;
            }
          } else {
            console.log("New message for a new/unknown conversation, refetching all conversations.");
            fetchConversations(); // Consider a more targeted update or a 'new_conversation' event
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
        setUsersTyping(prev => { const newMap = new Map(prev); newMap.delete(data.userId); return newMap; });
      }
    };

    // Attach listeners
    socket.on('message-received', handleNewMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('user-stopped-typing', handleUserStoppedTyping);

    // Join room for selected conversation
    if (selectedConversation?.id && socket.connected) { // Only join if connected
      console.log(`Client: Emitting 'join-conversation' for ${selectedConversation.id}`);
      socket.emit('join-conversation', selectedConversation.id);
    }

    return () => { // Cleanup function
      console.log("Client: Cleaning up MessagesPage socket listeners.");
      socket.off('message-received', handleNewMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('user-stopped-typing', handleUserStoppedTyping);
      if (selectedConversation?.id && socket.connected) { // Only leave if connected
        console.log(`Client: Emitting 'leave-conversation' for ${selectedConversation.id}`);
        socket.emit('leave-conversation', selectedConversation.id);
      }
      setUsersTyping(new Map()); // Clear typing users when changing conversations or unmounting
    };
  }, [socket, status, currentUserId, selectedConversation, fetchConversations]); // Dependencies

  // --- Mark As Read Logic ---
  const markConversationAsReadAPI = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    console.log(`Marking conversation ${conversationId} as read.`);
    try {
      await fetch(`/api/conversations/${conversationId}/mark-as-read`, { method: 'POST' });
      setAllConversations(prev => produce(prev, (draft: Conversation[]) => {
        const conv = draft.find(c => c.id === conversationId);
        if (conv) conv.unreadCount = 0;
      }));
    } catch (error) { console.error("Failed to mark conversation as read via API:", error); }
  }, [currentUserId]);

  useEffect(() => {
    if (selectedConversation?.id && (selectedConversation.unreadCount || 0) > 0) {
      markConversationAsReadAPI(selectedConversation.id);
    }
  }, [selectedConversation?.id, selectedConversation?.unreadCount, markConversationAsReadAPI]);


  // --- UI Interaction Handlers ---
  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConversation?.id === conv.id && messages.length > 0) return; // Avoid re-selecting same if messages loaded

    if (socket && selectedConversation?.id && socket.connected) {
        socket.emit('leave-conversation', selectedConversation.id);
    }
    setUsersTyping(new Map()); // Clear typing users from old conversation
    setSelectedConversation(conv);
    setMessages([]); // Clear old messages; new ones will be fetched by useEffect
    if (isMobile) {
        setTimeout(() => textareaRef.current?.focus(), 50); // Slight delay for UI to update
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    console.log("handleSendMessage: Triggered");
    e.preventDefault();

    if (!socket) {
        console.warn("handleSendMessage: Socket object is null. Cannot send message.");
        toast({ title: "Chat Error", description: "Chat service not available. Please refresh.", variant: "destructive" });
        return;
    }
    if (!socket.connected) {
        console.warn("handleSendMessage: Socket is not connected. Attempting to connect...");
        toast({ title: "Connection Error", description: "Not connected to chat. Trying to send...", variant: "default" });
        socket.connect(); // Attempt to reconnect, message might fail if this doesn't connect fast enough
        // We'll proceed, but the button should ideally be disabled. The disabled state handles this.
    }

    // Final check for sendability, including socket.connected
    if (!newMessage.trim() || !selectedConversation || !currentUserId || !session?.user || !socket.connected) {
      console.warn("handleSendMessage: Pre-condition not met OR socket not connected.", {
        newMessageEmpty: !newMessage.trim(),
        noSelectedConversation: !selectedConversation,
        noCurrentUserId: !currentUserId,
        noSessionUser: !session?.user,
        socketId: socket?.id,
        isSocketConnected: socket?.connected // Explicitly log connected status
      });
      // If socket not connected, the button should be disabled, but this is a safeguard.
      if (!socket.connected) {
        toast({ title: "Send Failed", description: "Still not connected to chat server.", variant: "destructive" });
      }
      return;
    }

    console.log("handleSendMessage: All checks passed. Proceeding to send.");
    setIsSending(true);
    const textContent = newMessage.trim();
    const tempNewMessageForInput = newMessage; // Store original for potential revert
    setNewMessage(""); // Clear input

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversationId: selectedConversation.id,
      content: textContent,
      senderId: currentUserId,
      sender: { id: currentUserId, name: session.user.name || 'You', image: session.user.image || null },
      createdAt: new Date().toISOString(),
      isSystemMessage: false,
    };
    setMessages(prev => [...prev, optimisticMessage]);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (selectedConversation.id && socket.connected) { // Check socket connected before emitting
        socket.emit('typing-stop', { conversationId: selectedConversation.id });
    }

    try {
      console.log("handleSendMessage: Sending POST to /api/messages");
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConversation.id, text: textContent }),
      });
      console.log("handleSendMessage: POST response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        console.error("handleSendMessage: API error response data:", errorData);
        throw new Error(errorData.message);
      }
      const { newMessage: savedMessage }: { newMessage: Message } = await response.json();
      console.log("handleSendMessage: Message saved, server returned:", savedMessage);

      setMessages(prev =>
        produce(prev, (draft: Message[]) => {
          const index = draft.findIndex(msg => msg.id === optimisticId);
          if (index !== -1) draft[index] = savedMessage;
          else if (!draft.some(msg => msg.id === savedMessage.id)) draft.push(savedMessage); // Fallback
        })
      );
    } catch (error) {
      console.error('handleSendMessage: Error sending message:', error);
      toast({ title: "Send Error", description: (error instanceof Error ? error.message : String(error)), variant: "destructive" });
      setMessages(prev => prev.filter(msg => msg.id !== optimisticId)); // Revert optimistic
      setNewMessage(tempNewMessageForInput); // Restore message to input on failure
    } finally {
      console.log("handleSendMessage: setIsSending(false)");
      setIsSending(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!socket || !socket.connected || !selectedConversation) return;

    if (!typingTimeoutRef.current) { // Only emit start if not already typing (i.e., timeout is not set)
      socket.emit('typing-start', { conversationId: selectedConversation.id });
    } else {
      clearTimeout(typingTimeoutRef.current); // Reset existing timeout
    }
    typingTimeoutRef.current = setTimeout(() => {
      // Check socket and conversation again before emitting stop, as state might have changed
      if (socket && socket.connected && selectedConversation) {
        socket.emit('typing-stop', { conversationId: selectedConversation.id });
      }
      typingTimeoutRef.current = null; // Important to clear ref after timeout executes
    }, 1500); // User considered stopped typing after 1.5s
  };

  // --- Memoized Values & Utility Functions ---
  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = []; const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };
    allConversations.forEach(conv => { // Assuming 'approved' and 'initiatorId' are on your Conversation type
      if (conv.approved || conv.initiatorId === currentUserId) inbox.push(conv); else incoming.push(conv);
    });
    const getTimeValue = (t1: string | null | undefined, t2: string | null | undefined = null): number => {
      const ts = t1 ?? t2; return ts ? parseISO(ts).getTime() : 0;
    };
    inbox.sort((a, b) => getTimeValue(b.lastMessageTimestamp, b.createdAt) - getTimeValue(a.lastMessageTimestamp, a.createdAt));
    incoming.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
    return { inbox, incoming };
  }, [allConversations, currentUserId]);

  const getParticipantData = (conversation: Conversation | null, userId: string): ParticipantData => {
    if (!conversation?.participants) return { id: userId, name: 'User...', image: null };
    // Assuming conversation.participants is an array of UserProfile-like objects
    const pInfo = conversation.participants.find(p => p.id === userId);
    return pInfo || { id: userId, name: `User ${userId.slice(0,4)}...`, image: null };
  };
  const formatTimestamp = (ts: string | null): string => ts ? formatDistanceToNow(parseISO(ts), { addSuffix: true }) : '';

  useEffect(() => { if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages]);


  // --- Render Functions ---
  const renderConversationItem = (conv: Conversation, isIncomingView: boolean) => {
    const otherParticipants = conv.participants?.filter(p => p.id !== currentUserId) || [];
    const otherParticipant = otherParticipants[0] || { id: 'unknown', name: 'Unknown User', image: null }; // Fallback
    const isSelected = selectedConversation?.id === conv.id;
    const hasUnread = (conv.unreadCount || 0) > 0 && !isSelected;

    return (
        <div
            key={conv.id}
            onClick={() => handleSelectConversation(conv)}
            className={cn(
                "flex items-start space-x-3 p-3 border-b cursor-pointer transition-colors",
                isSelected && !isMobile ? "bg-muted dark:bg-slate-700" : "hover:bg-muted/50 dark:hover:bg-slate-700/50",
                isIncomingView && "opacity-80 hover:opacity-100"
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
            {/* Add your "Approve" button logic here if isIncomingView is true */}
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
      return <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center h-full">Select a conversation to start chatting.</div>;
    }

    const otherParticipantData = getParticipantData(conversation, conversation?.participants?.find(p => p.id !== currentUserId)?.id || '');
    const typingNames = Array.from(usersTyping.values())
        .map(uInfo => uInfo.userName || "Someone") // Use userName for display
        .join(', ');

    // Determine if chat is allowed (based on approval, initiator, etc.)
    // This logic should align with your backend rules.
    const canChat = conversation.approved || conversation.initiatorId === currentUserId; // Simplified example

    return (
      <div className="flex-1 flex flex-col h-full bg-background dark:bg-slate-900">
        {/* Header */}
        <div className="p-3 border-b flex items-center space-x-3 sticky top-0 bg-background dark:bg-slate-900 z-10 flex-shrink-0">
            {isMobile && (
                <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)} className="mr-2">
                    <Icons.arrowLeft className="h-5 w-5" />
                </Button>
            )}
            <Avatar className="h-9 w-9 border">
                <AvatarImage src={otherParticipantData.image ?? undefined} />
                <AvatarFallback>{otherParticipantData.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
                <p className="font-medium text-sm truncate">{otherParticipantData.name}</p>
                {conversation.itemTitle && <p className="text-xs text-muted-foreground italic truncate">Item: {conversation.itemTitle}</p>}
            </div>
            {/* Payment Button or other actions */}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
          {isLoadingMessages && !messages.length && ( Array.from({ length: 5 }).map((_, i) => <Skeleton key={`msgskel-${i}`} className="h-12 w-3/4 my-2 rounded-md even:self-end even:w-2/3 odd:w-2/3" />) )}
          {!isLoadingMessages && messages.length === 0 && canChat && ( <p className="text-center text-sm text-muted-foreground py-6">No messages yet. Start the conversation!</p> )}
          {!isLoadingMessages && messages.length === 0 && !canChat && ( <p className="text-center text-sm text-muted-foreground py-6">Waiting for approval to chat.</p> )}

          {messages.map((msg) => {
            const isSender = msg.senderId === currentUserId;
            const senderDisplay = msg.sender || getParticipantData(conversation, msg.senderId); // Fallback if sender not on msg
            if (msg.isSystemMessage) { // Handle system messages
                return (<div key={msg.id} className="my-3 p-2.5 bg-yellow-100 dark:bg-yellow-800 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-200 rounded-md text-xs flex items-start gap-2">
                    <Icons.alertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>);
            }
            return (
                <div key={msg.id} className={cn("flex items-end gap-2 max-w-[85%]", isSender ? "justify-end self-end" : "justify-start self-start")}>
                    {!isSender && senderDisplay && (
                         <Avatar className="h-6 w-6 border flex-shrink-0 self-start">
                             <AvatarImage src={senderDisplay.image ?? undefined} alt={senderDisplay.name ?? 'Sender'} />
                             <AvatarFallback>{senderDisplay.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                         </Avatar>
                    )}
                    <div className={cn("rounded-lg px-3 py-2 break-words text-sm shadow-sm",
                       isSender ? "bg-primary text-primary-foreground" : "bg-muted dark:bg-slate-700"
                    )}>
                       <p className="whitespace-pre-wrap">{msg.content}</p>
                       <p className={cn("text-xs mt-1 opacity-70", isSender ? "text-right" : "text-left")}>
                           {formatTimestamp(msg.createdAt)}
                       </p>
                   </div>
                   {isSender && senderDisplay && ( // Show current user's avatar on the right
                        <Avatar className="h-6 w-6 border flex-shrink-0 self-start">
                            <AvatarImage src={senderDisplay.image ?? undefined} alt={senderDisplay.name ?? 'You'} />
                            <AvatarFallback>{senderDisplay.name?.charAt(0)?.toUpperCase() || 'Y'}</AvatarFallback>
                        </Avatar>
                   )}
                </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {typingNames && (
            <div className="px-4 pb-1 text-xs text-muted-foreground italic h-5 flex-shrink-0">
                {typingNames} {usersTyping.size > 1 ? "are" : "is"} typing...
            </div>
        )}

        {/* Input Footer */}
        <div className="border-t p-3 bg-background dark:bg-slate-900 mt-auto sticky bottom-0 flex-shrink-0">
          {canChat ? (
               <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
               <Textarea
                 ref={textareaRef}
                 placeholder="Type your message..."
                 value={newMessage}
                 onChange={handleTextareaChange}
                 rows={1}
                 className="flex-1 resize-none max-h-24 overflow-y-auto p-2 text-sm border rounded-md focus-visible:ring-1 focus-visible:ring-ring"
                 onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); }}}
                 disabled={isSending || isLoadingMessages}
               />
               <Button
                 type="submit"
                 size="icon"
                 disabled={!newMessage.trim() || isSending || isLoadingMessages || !socket} // Send button disabled if socket not connected
               >
                 {isSending ? <Icons.spinner className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
               </Button>
             </form>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-2">
              {/* Logic for when chat is not allowed (e.g., pending approval) */}
              This chat is pending approval or not available.
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- Main Page Structure ---
  if (status === 'loading') return <div className="flex items-center justify-center h-screen"><Icons.spinner className="h-8 w-8 animate-spin text-primary" /></div>;
  if (status === 'unauthenticated') return <div className="p-6 text-center">Please <Link href="/login" className="underline text-primary hover:text-primary/80">log in</Link> to view messages.</div>;
  if (error && !isLoadingConversations && !allConversations.length) return <div className="p-6 text-center text-destructive">Error loading conversations: {error}</div>;

  return (
    <div className={cn(
      "flex border-t bg-slate-50 dark:bg-slate-950", // Main background
      isMobile ? "h-[calc(100dvh-var(--mobile-nav-height,0px))]" : "h-[calc(100vh-theme(spacing.16))]"
    )}>
      {/* Conversation List Panel */}
      <div className={cn(
        "w-full md:w-1/3 lg:w-1/4 border-r border-border dark:border-slate-700 flex flex-col bg-card dark:bg-slate-900",
        isMobile && selectedConversation && "hidden"
      )}>
        <div className="flex border-b border-border dark:border-slate-700 flex-shrink-0">
            <Button variant="ghost" className={cn("flex-1 justify-center rounded-none h-10", activeTab === 'inbox' && "bg-muted dark:bg-slate-800 font-semibold")}
                onClick={() => { setActiveTab('inbox'); setSelectedConversation(null); }}>
                Inbox ({categorizedConversations.inbox.length})
            </Button>
            <Button variant="ghost" className={cn("flex-1 justify-center rounded-none border-l border-border dark:border-slate-700 h-10", activeTab === 'incoming' && "bg-muted dark:bg-slate-800 font-semibold")}
                onClick={() => { setActiveTab('incoming'); setSelectedConversation(null); }}>
               Requests ({categorizedConversations.incoming.length})
            </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? ( Array.from({ length: 5 }).map((_, i) => <Skeleton key={`convskel-${i}`} className="h-20 m-2 rounded" />))
            : (
                (activeTab === 'inbox' ? categorizedConversations.inbox : categorizedConversations.incoming).length > 0 ?
                (activeTab === 'inbox' ? categorizedConversations.inbox : categorizedConversations.incoming)
                    .map(conv => renderConversationItem(conv, activeTab === 'incoming'))
                : <p className="p-4 text-center text-sm text-muted-foreground">
                    {activeTab === 'inbox' ? 'Your inbox is empty.' : 'No incoming message requests.'}
                  </p>
            )
          }
          {error && !isLoadingConversations && <p className="p-4 text-center text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {/* Chat Area Panel */}
      <div className={cn(
        "flex-1 flex-col",
        isMobile ? (selectedConversation ? "flex" : "hidden") : "hidden md:flex",
        !selectedConversation && !isMobile && "items-center justify-center" // Center "select chat" for desktop
      )}>
        {renderChatAreaContent(selectedConversation)}
      </div>
    </div>
  );
}