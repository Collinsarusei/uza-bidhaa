// src/app/page/messages/MessagesPage.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { Textarea } from "@/components/ui/textarea";
import { Conversation, Message, UserProfile } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from 'next/link';
import { getSocket } from '@/lib/socket-client'; // Ensure initSocket is called by getSocket if needed
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
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox');

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [usersTyping, setUsersTyping] = useState<Map<string, TypingUserInfo>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const socket = getSocket(); // This should ensure socket is initialized if not already

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
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch messages');
      const data = await response.json();
      setMessages(data.messages || []);
      if (data.conversationDetails) {
        setSelectedConversation(prev => prev ? ({ ...prev, ...data.conversationDetails }) : data.conversationDetails);
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
      setMessages([]);
    }
  }, [selectedConversation?.id, fetchMessagesForConversation]);


  // --- Socket.IO Event Handlers ---
  useEffect(() => {
    if (status !== 'authenticated' || !currentUserId || !socket) return;

    // Ensure socket is connected before attaching listeners
    if (!socket.connected) {
        console.warn("MessagesPage Effect: Socket exists but not connected, trying to connect.");
        socket.connect(); // Attempt to connect if not already
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
        setUsersTyping(prev => { const newMap = new Map(prev); newMap.delete(data.userId); return newMap; });
      }
    };

    socket.on('message-received', handleNewMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('user-stopped-typing', handleUserStoppedTyping);

    if (selectedConversation?.id) {
      socket.emit('join-conversation', selectedConversation.id);
    }

    return () => {
      socket.off('message-received', handleNewMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('user-stopped-typing', handleUserStoppedTyping);
      if (selectedConversation?.id) {
        socket.emit('leave-conversation', selectedConversation.id);
      }
      setUsersTyping(new Map());
    };
  }, [socket, status, currentUserId, selectedConversation, fetchConversations]); // Added markConversationAsReadAPI if it becomes a dependency

  const markConversationAsReadAPI = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
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

  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConversation?.id === conv.id) return;
    if (socket && selectedConversation?.id) socket.emit('leave-conversation', selectedConversation.id);
    setUsersTyping(new Map());
    setSelectedConversation(conv);
    setMessages([]);
    if (isMobile) setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    console.log("handleSendMessage: Triggered");
    e.preventDefault();

    if (!socket) {
        console.warn("handleSendMessage: Socket object is null or undefined.");
        toast({ title: "Chat Error", description: "Chat service not available. Please refresh.", variant: "destructive" });
        return;
    }
    if (!socket.connected) {
        console.warn("handleSendMessage: Socket is not connected.");
        toast({ title: "Connection Error", description: "Not connected to chat server. Trying to reconnect...", variant: "destructive" });
        socket.connect(); // Attempt to reconnect
        return;
    }
    if (!newMessage.trim() || !selectedConversation || !currentUserId || !session?.user) {
      console.warn("handleSendMessage: Pre-condition not met", {
        newMessageEmpty: !newMessage.trim(),
        noSelectedConversation: !selectedConversation,
        noCurrentUserId: !currentUserId,
        noSessionUser: !session?.user,
        socketId: socket?.id,
        socketConnected: socket?.connected
      });
      return;
    }

    console.log("handleSendMessage: All checks passed. Proceeding to send.");
    setIsSending(true);
    const textContent = newMessage.trim();
    const tempNewMessage = newMessage; // Store before clearing
    setNewMessage("");

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
    typingTimeoutRef.current = null; // Clear ref after use
    socket.emit('typing-stop', { conversationId: selectedConversation.id });

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
          else if (!draft.some(msg => msg.id === savedMessage.id)) draft.push(savedMessage);
        })
      );
    } catch (error) {
      console.error('handleSendMessage: Error sending message:', error);
      toast({ title: "Send Error", description: (error instanceof Error ? error.message : String(error)), variant: "destructive" });
      setMessages(prev => prev.filter(msg => msg.id !== optimisticId));
      setNewMessage(tempNewMessage); // Restore message to input on failure
    } finally {
      console.log("handleSendMessage: setIsSending(false)");
      setIsSending(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!socket || !socket.connected || !selectedConversation) return; // Add socket.connected check

    if (!typingTimeoutRef.current) {
      socket.emit('typing-start', { conversationId: selectedConversation.id });
    } else {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (socket && socket.connected && selectedConversation) { // Check again before emitting stop
        socket.emit('typing-stop', { conversationId: selectedConversation.id });
      }
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = []; const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };
    allConversations.forEach(conv => {
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
    if (!conversation?.participants) return { id: userId, name: 'User', image: null };
    const pInfo = conversation.participants.find(p => p.id === userId);
    return pInfo || { id: userId, name: 'User', image: null };
  };
  const formatTimestamp = (ts: string | null): string => ts ? formatDistanceToNow(parseISO(ts), { addSuffix: true }) : '';

  useEffect(() => { if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const renderConversationItem = (conv: Conversation, isIncomingView: boolean) => {
    const otherP = (conv.participants?.filter(p => p.id !== currentUserId) || [])[0] || { id: 'unknown', name: 'Unknown', image: null };
    const isSelected = selectedConversation?.id === conv.id;
    const hasUnread = (conv.unreadCount || 0) > 0 && !isSelected;
    return (
        <div key={conv.id} onClick={() => handleSelectConversation(conv)}
            className={cn("flex items-start space-x-3 p-3 border-b cursor-pointer", isSelected && !isMobile ? "bg-muted" : "hover:bg-muted/50")}>
            <Avatar className="h-10 w-10 border"><AvatarImage src={otherP.image ?? undefined} /><AvatarFallback>{otherP.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback></Avatar>
            <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-center">
                    <p className={cn("text-sm font-medium truncate", hasUnread && "font-bold")}>{otherP.name}</p>
                    <p className="text-xs text-muted-foreground ml-2">{formatTimestamp(conv.lastMessageTimestamp || conv.createdAt)}</p>
                </div>
                <p className={cn("text-xs text-muted-foreground truncate", hasUnread && "font-semibold")}>{conv.lastMessageSnippet || '...'}</p>
                {conv.itemTitle && <p className="text-xs italic">{conv.itemTitle}</p>}
            </div>
            {hasUnread && <Badge variant="destructive" className="ml-2">{conv.unreadCount}</Badge>}
        </div>);
  };

  const renderChatAreaContent = (conversation: Conversation | null) => {
    if (!conversation) return <div className="flex-1 flex items-center justify-center">Select a conversation.</div>;
    const typingNames = Array.from(usersTyping.values()).map(u => u.userName || "Someone").join(', ');
    return (
      <div className="flex-1 flex flex-col h-full bg-background">
        <div className="p-3 border-b flex items-center space-x-2 sticky top-0 z-10 bg-background">
            {isMobile && <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}><Icons.arrowLeft className="h-5 w-5"/></Button>}
            {/* Other header elements */}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{messages.map(msg => {
            const isSender = msg.senderId === currentUserId;
            return (<div key={msg.id} className={cn("flex items-end gap-2", isSender ? "justify-end" : "justify-start")}>
                {!isSender && msg.sender && <Avatar className="h-6 w-6"><AvatarImage src={msg.sender.image||undefined}/><AvatarFallback>{msg.sender.name?.charAt(0)}</AvatarFallback></Avatar>}
                <div className={cn("rounded-lg p-2 max-w-[75%]", isSender ? "bg-primary text-primary-foreground":"bg-muted")}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn("text-xs mt-0.5 opacity-70",isSender?"text-right":"text-left")}>{formatTimestamp(msg.createdAt)}</p>
                </div>
                {isSender && msg.sender && <Avatar className="h-6 w-6"><AvatarImage src={msg.sender.image||undefined}/><AvatarFallback>{msg.sender.name?.charAt(0)}</AvatarFallback></Avatar>}
            </div>);
        })} <div ref={messagesEndRef}/></div>
        {typingNames && <div className="p-2 text-xs italic text-muted-foreground">{typingNames} is typing...</div>}
        <div className="border-t p-3 sticky bottom-0 bg-background">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Textarea ref={textareaRef} value={newMessage} onChange={handleTextareaChange} placeholder="Type..." rows={1} className="flex-1 resize-none"
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSendMessage(e as any);}}}
              disabled={isSending || isLoadingMessages || !socket?.connected} />
            <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending || isLoadingMessages || !socket?.connected}>
              {isSending ? <Icons.spinner className="h-4 w-4 animate-spin"/> : <Icons.send className="h-4 w-4"/>}
            </Button>
          </form>
        </div>
      </div>);
  };

  if (status === 'loading') return <div className="center-screen"><Icons.spinner className="h-8 w-8 animate-spin"/></div>;
  if (status === 'unauthenticated') return <div className="p-6 text-center"><Link href="/login">Log in</Link> to view messages.</div>;

  return (
    <div className={cn("flex border-t", isMobile ? "h-[calc(100dvh-var(--mobile-nav-height,0px))]" : "h-[calc(100vh-16rem)]")}>
      <div className={cn("w-full md:w-1/3 lg:w-1/4 border-r flex flex-col", isMobile && selectedConversation && "hidden")}>
        {/* Tabs */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-16 m-2"/>) :
            (activeTab === 'inbox' ? categorizedConversations.inbox : categorizedConversations.incoming)
            .map(c => renderConversationItem(c, activeTab === 'incoming'))
          }
        </div>
      </div>
      <div className={cn("flex-1 flex-col", isMobile ? (selectedConversation ? "flex":"hidden") : "hidden md:flex", !selectedConversation && !isMobile && "items-center justify-center")}>
        {renderChatAreaContent(selectedConversation)}
      </div>
    </div>
  );
}