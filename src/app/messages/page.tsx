// src/app/messages/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button"; // Assuming this path is correct for your Button
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Assuming correct
import { Skeleton } from "@/components/ui/skeleton"; // Assuming correct
import { Icons } from "@/components/icons"; // <<<< CHECK THIS PATH CAREFULLY
import { Textarea } from "@/components/ui/textarea"; // Assuming correct
import { Conversation, Message, UserProfile } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast"; // Assuming this is from shadcn/ui or your setup
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge"; // Assuming correct
import { useIsMobile } from "@/hooks/use-mobile"; // Assuming custom hook
import Link from 'next/link';
import { getSocket } from '@/lib/socket-client';
import { produce } from 'immer';
import { Socket } from 'socket.io-client';

type ParticipantData = Partial<Pick<UserProfile, 'id' | 'name' | 'image'>>;

interface TypingUserInfo {
    userId: string;
    userName?: string | null;
}

export default function MessagesPage() {
  const { data: session, status: sessionStatus } = useSession();
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

  const [socket, setSocketInstance] = useState<Socket | undefined>(undefined);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setSocketInstance(s);
    if (s) {
      setIsSocketConnected(s.connected);
      const handleConnect = () => setIsSocketConnected(true);
      const handleDisconnect = () => setIsSocketConnected(false);
      const handleConnectError = () => setIsSocketConnected(false);
      s.on('connect', handleConnect);
      s.on('disconnect', handleDisconnect);
      s.on('connect_error', handleConnectError);
      return () => {
        s.off('connect', handleConnect);
        s.off('disconnect', handleDisconnect);
        s.off('connect_error', handleConnectError);
      };
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    if (sessionStatus !== 'authenticated' || !currentUserId) return;
    setIsLoadingConversations(true); setError(null);
    try {
      const response = await fetch('/api/conversations');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch conversations');
      const data = await response.json();
      setAllConversations(data.conversations || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      toast({ title: "Error", description: `Failed to load conversations: ${errorMsg}`, variant: "destructive" });
    } finally { setIsLoadingConversations(false); }
  }, [sessionStatus, currentUserId, toast]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const fetchMessagesForConversation = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    setIsLoadingMessages(true); setError(null);
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch messages');
      const data = await response.json();
      setMessages(data.messages || []);
      if (data.conversationDetails) {
        setSelectedConversation(prev => prev ? ({ ...prev, ...data.conversationDetails }) : data.conversationDetails);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      toast({ title: "Error", description: `Failed to load messages: ${errorMsg}`, variant: "destructive" });
      setMessages([]);
    } finally { setIsLoadingMessages(false); }
  }, [currentUserId, toast]);

  useEffect(() => {
    if (selectedConversation?.id) {
      fetchMessagesForConversation(selectedConversation.id);
    } else { setMessages([]); }
  }, [selectedConversation?.id, fetchMessagesForConversation]);

  const markConversationAsReadAPI = useCallback(async (conversationId: string) => {
    if (!currentUserId) return;
    try {
      await fetch(`/api/conversations/${conversationId}/mark-as-read`, { method: 'POST' });
      setAllConversations(prev => produce(prev, (draft: Conversation[]) => {
        const conv = draft.find(c => c.id === conversationId);
        if (conv) conv.unreadCount = 0;
      }));
    } catch (error) { console.error("Failed to mark as read:", error); }
  }, [currentUserId]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !currentUserId || !socket || !isSocketConnected) return;
    const handleNewMessage = (incomingMessage: Message) => {
      if (selectedConversation?.id === incomingMessage.conversationId) {
        setMessages(prev => produce(prev, (draft: Message[]) => {
          if (!draft.some(m => m.id === incomingMessage.id)) draft.push(incomingMessage);
        }));
        if (incomingMessage.senderId !== currentUserId) markConversationAsReadAPI(incomingMessage.conversationId);
      }
      setAllConversations(prev => produce(prev, (draft: Conversation[]) => {
        const convIndex = draft.findIndex(c => c.id === incomingMessage.conversationId);
        if (convIndex !== -1) { /* update existing */
          draft[convIndex].lastMessageSnippet = incomingMessage.content.substring(0,50)+'...';
          draft[convIndex].lastMessageTimestamp = incomingMessage.createdAt;
          if(selectedConversation?.id !== incomingMessage.conversationId && incomingMessage.senderId !== currentUserId){
            draft[convIndex].unreadCount = (draft[convIndex].unreadCount || 0) + 1;
          }
        } else { fetchConversations(); } /* new conversation */
      }));
    };
    const handleUserTyping = (data: { userId: string; userName?: string | null; conversationId: string }) => {
      if (data.conversationId === selectedConversation?.id && data.userId !== currentUserId) {
        setUsersTyping(prev => new Map(prev).set(data.userId, { userId: data.userId, userName: data.userName }));
      }
    };
    const handleUserStoppedTyping = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === selectedConversation?.id) {
        setUsersTyping(prev => { const map = new Map(prev); map.delete(data.userId); return map; });
      }
    };
    socket.on('message-received', handleNewMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('user-stopped-typing', handleUserStoppedTyping);
    if (selectedConversation?.id) socket.emit('join-conversation', selectedConversation.id);
    return () => {
      socket.off('message-received', handleNewMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('user-stopped-typing', handleUserStoppedTyping);
      if (selectedConversation?.id) socket.emit('leave-conversation', selectedConversation.id);
      setUsersTyping(new Map());
    };
  }, [socket, isSocketConnected, sessionStatus, currentUserId, selectedConversation, fetchConversations, markConversationAsReadAPI]);

  useEffect(() => {
    if (selectedConversation?.id && (selectedConversation.unreadCount || 0) > 0) {
      markConversationAsReadAPI(selectedConversation.id);
    }
  }, [selectedConversation?.id, selectedConversation?.unreadCount, markConversationAsReadAPI]);

  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConversation?.id === conv.id && messages.length > 0) return;
    if (socket && selectedConversation?.id && isSocketConnected) {
        socket.emit('leave-conversation', selectedConversation.id);
    }
    setUsersTyping(new Map()); setSelectedConversation(conv); setMessages([]);
    if (isMobile) setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) { toast({ title: "Chat Error", variant: "destructive" }); return; }
    if (!isSocketConnected) { toast({ title: "Connection Error", variant: "destructive" }); return; }
    if (!newMessage.trim() || !selectedConversation || !currentUserId || !session?.user) {
      console.warn("handleSendMessage: Pre-condition not met."); return;
    }
    setIsSending(true);
    const textContent = newMessage.trim(); const tempMsg = newMessage; setNewMessage("");
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId, conversationId: selectedConversation.id, content: textContent,
      senderId: currentUserId, createdAt: new Date().toISOString(), isSystemMessage: false,
      sender: { id: currentUserId, name: session.user.name || 'You', image: session.user.image || null },
    };
    setMessages(prev => [...prev, optimisticMessage]);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null;
    if (selectedConversation.id && isSocketConnected) {
      socket.emit('typing-stop', { conversationId: selectedConversation.id });
    }
    try {
      const response = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedConversation.id, text: textContent }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! ${response.status}` }));
        throw new Error(errorData.message);
      }
      const { newMessage: savedMessage }: { newMessage: Message } = await response.json();
      setMessages(prev => produce(prev, (draft: Message[]) => {
        const idx = draft.findIndex(m => m.id === optimisticId);
        if (idx !== -1) draft[idx] = savedMessage;
        else if(!draft.some(m => m.id === savedMessage.id)) draft.push(savedMessage);
      }));
    } catch (error) {
      toast({ title: "Send Error", description:(error instanceof Error?error.message:String(error)), variant: "destructive" });
      setMessages(prev => prev.filter(m => m.id !== optimisticId)); setNewMessage(tempMsg);
    } finally { setIsSending(false); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!socket || !isSocketConnected || !selectedConversation) return;
    if (!typingTimeoutRef.current) socket.emit('typing-start', { conversationId: selectedConversation.id });
    else clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (socket && isSocketConnected && selectedConversation) {
        socket.emit('typing-stop', { conversationId: selectedConversation.id });
      }
      typingTimeoutRef.current = null;
    }, 1500);
  };

  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = []; const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };
    allConversations.forEach(c => (c.approved || c.initiatorId === currentUserId ? inbox : incoming).push(c));
    const getTime = (t1?: string|null,t2?: string|null)=>(t1||t2?parseISO(t1||t2!).getTime():0);
    inbox.sort((a,b)=>getTime(b.lastMessageTimestamp,b.createdAt)-getTime(a.lastMessageTimestamp,a.createdAt));
    incoming.sort((a,b)=>getTime(b.createdAt)-getTime(a.createdAt));
    return { inbox, incoming };
  }, [allConversations, currentUserId]);

  const getParticipantData = (conversation: Conversation | null, userIdToFind: string): ParticipantData => {
    if (!userIdToFind) return { id: 'unknown', name: 'System', image: null };
    if (!conversation?.participants?.length) return { id: userIdToFind, name: `User...`, image: null };
    const p = conversation.participants.find(pt => pt.id === userIdToFind);
    return p ? { id: p.id, name: p.name, image: p.image } : { id: userIdToFind, name: `User...`, image: null };
  };
  const formatTimestamp = (ts: string | null): string => ts ? formatDistanceToNow(parseISO(ts), { addSuffix: true }) : '';

  useEffect(() => { if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages]);

  const renderConversationItem = (conv: Conversation, isIncomingView: boolean) => {
    const otherPArray = conv.participants?.filter(p => p.id !== currentUserId) || [];
    const otherP = otherPArray[0] || { id: 'unknown', name: 'N/A', image: null };
    const isSel = selectedConversation?.id === conv.id;
    const hasUnread = (conv.unreadCount || 0) > 0 && !isSel;
    const dispName = otherP.name || (otherP.id !== 'unknown' && otherP.id ? `User...${otherP.id.slice(-4)}` : 'N/A');
    return (
        <div key={conv.id} onClick={() => handleSelectConversation(conv)}
            className={cn("flex items-start gap-3 p-3 border-b cursor-pointer", isSel && !isMobile ? "bg-muted" : "hover:bg-muted/50")}>
            <Avatar className="h-10 w-10 border"><AvatarImage src={otherP.image ?? undefined} /><AvatarFallback>{dispName.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>
            <div className="flex-1 overflow-hidden">
                <div className="flex justify-between items-center">
                    <p className={cn("text-sm font-medium truncate",hasUnread&&"font-bold")}>{dispName}</p>
                    <p className="text-xs text-muted-foreground ml-2 shrink-0">{formatTimestamp(conv.lastMessageTimestamp||conv.createdAt)}</p>
                </div>
                <p className={cn("text-xs text-muted-foreground truncate",hasUnread&&"font-semibold")}>{conv.lastMessageSnippet||'...'}</p>
                {conv.itemTitle && <p className="text-xs italic text-muted-foreground truncate">Item: {conv.itemTitle}</p>}
            </div>
            {isIncomingView && <Button size="sm" variant="outline" className="ml-auto self-center">Approve</Button> }
            {hasUnread && <Badge variant="destructive" className="ml-2 self-center shrink-0">{conv.unreadCount}</Badge>}
        </div>);
  };

  const renderChatAreaContent = (conversation: Conversation | null) => {
    if (!conversation) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Select a conversation.</div>;
    const otherPId = conversation.participants?.find(p=>p.id!==currentUserId)?.id;
    const otherPDisp = getParticipantData(conversation, otherPId||'');
    const typingNames = Array.from(usersTyping.values()).map(u=>u.userName||"Someone").join(', ');
    const canChat = conversation.approved || conversation.initiatorId === currentUserId;
    return (
      <div className="flex-1 flex flex-col h-full bg-background dark:bg-slate-900">
        <div className="p-3 border-b flex items-center gap-2 sticky top-0 z-10 bg-background dark:bg-slate-900">
            {isMobile && <Button variant="ghost" size="icon" onClick={()=>setSelectedConversation(null)}><Icons.arrowLeft className="h-5 w-5"/></Button>}
            <Avatar className="h-9 w-9 border"><AvatarImage src={otherPDisp.image??undefined}/><AvatarFallback>{otherPDisp.name?.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>
            <div className="flex-1 overflow-hidden">
                <p className="font-medium text-sm truncate">{otherPDisp.name}</p>
                {conversation.itemTitle && <p className="text-xs italic truncate text-muted-foreground">Item: {conversation.itemTitle}</p>}
            </div>
            {/* Action buttons like "Pay" */}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{messages.map(msg => {
            const isSender = msg.senderId === currentUserId;
            const senderDisp = msg.sender || getParticipantData(conversation, msg.senderId);
            if(msg.isSystemMessage) return <div key={msg.id} className="my-3 p-2.5 bg-yellow-100 dark:bg-yellow-800 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-200 rounded-md text-xs flex items-start gap-2"><Icons.alertTriangle className="h-4 w-4 mt-0.5 shrink-0"/>{msg.content}</div>;
            return (<div key={msg.id} className={cn("flex items-end gap-2 max-w-[85%]",isSender?"justify-end self-end":"justify-start self-start")}>
                {!isSender && senderDisp && senderDisp.id!=='unknown' && <Avatar className="h-6 w-6 border shrink-0"><AvatarImage src={senderDisp.image??undefined}/><AvatarFallback>{senderDisp.name?.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>}
                <div className={cn("rounded-lg px-3 py-2 text-sm shadow-sm",isSender?"bg-primary text-primary-foreground":"bg-muted dark:bg-slate-700")}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn("text-xs mt-0.5 opacity-70",isSender?"text-right":"text-left")}>{formatTimestamp(msg.createdAt)}</p>
                </div>
                {isSender && senderDisp && senderDisp.id!=='unknown' && <Avatar className="h-6 w-6 border shrink-0"><AvatarImage src={senderDisp.image??undefined}/><AvatarFallback>{senderDisp.name?.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>}
            </div>);
        })} <div ref={messagesEndRef}/></div>
        {typingNames && <div className="px-4 pb-1 text-xs italic text-muted-foreground h-5 shrink-0">{typingNames} is typing...</div>}
        <div className="border-t p-3 sticky bottom-0 bg-background dark:bg-slate-900">
          {canChat ? (
            <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
              <Textarea ref={textareaRef} value={newMessage} onChange={handleTextareaChange} placeholder="Type your message..." rows={1} className="flex-1 resize-none max-h-24 p-2 text-sm border rounded-md"
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSendMessage(e as any);}}}
                disabled={isSending || isLoadingMessages} />
              <Button type="submit" size="icon" disabled={!newMessage.trim()||isSending||isLoadingMessages||!isSocketConnected}>
                {isSending?<Icons.spinner className="h-4 w-4 animate-spin"/>:<Icons.send className="h-4 w-4"/>}
              </Button>
            </form>
          ) : ( <div className="text-center text-sm text-muted-foreground p-2">Chat unavailable.</div> )}
        </div>
      </div>);
  };

  if (sessionStatus === 'loading') return <div className="flex items-center justify-center h-screen"><Icons.spinner className="h-8 w-8 animate-spin text-primary"/></div>;
  if (sessionStatus === 'unauthenticated') return <div className="p-6 text-center">Please <Link href="/login" className="underline text-primary hover:text-primary/80">log in</Link>.</div>;

  return (
    <div className={cn("flex border-t", isMobile ? "h-[calc(100dvh-var(--mobile-nav-height,0px))]" : "h-[calc(100vh-theme(spacing.16))]")}>
      <div className={cn("w-full md:w-1/3 lg:w-1/4 border-r flex flex-col", isMobile && selectedConversation && "hidden")}>
        <div className="flex border-b shrink-0">
             <Button variant="ghost" className={cn("flex-1 justify-center rounded-none h-10",activeTab==='inbox'&&"bg-muted font-semibold")} onClick={()=>{setActiveTab('inbox');setSelectedConversation(null);}}>Inbox ({categorizedConversations.inbox.length})</Button>
             <Button variant="ghost" className={cn("flex-1 justify-center rounded-none border-l h-10",activeTab==='incoming'&&"bg-muted font-semibold")} onClick={()=>{setActiveTab('incoming');setSelectedConversation(null);}}>Requests ({categorizedConversations.incoming.length})</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversations ? Array.from({length:5}).map((_,i)=><Skeleton key={`convskel-${i}`} className="h-20 m-2 rounded"/>) :
            (activeTab==='inbox'?categorizedConversations.inbox:categorizedConversations.incoming).length > 0 ?
            (activeTab==='inbox'?categorizedConversations.inbox:categorizedConversations.incoming).map(c => renderConversationItem(c, activeTab==='incoming'))
            : <p className="p-4 text-center text-sm text-muted-foreground">{activeTab==='inbox'?'Inbox empty.':'No requests.'}</p>
          }
          {error && !isLoadingConversations && <p className="p-4 text-destructive text-sm">{error}</p>}
        </div>
      </div>
      <div className={cn("flex-1 flex-col", isMobile?(selectedConversation?"flex":"hidden"):"hidden md:flex", !selectedConversation&&!isMobile&&"items-center justify-center")}>
        {renderChatAreaContent(selectedConversation)}
      </div>
    </div>
  );
}