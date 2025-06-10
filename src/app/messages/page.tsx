// src/app/messages/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { produce } from 'immer';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MessageSquare, Menu, Check } from 'lucide-react';

type ParticipantData = Partial<Pick<UserProfile, 'id' | 'name' | 'image'>>;

interface TypingUserInfo {
    userId: string;
    userName?: string | null;
}

// Wrap the main component with dynamic import
const MessagesPage = () => {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Add early return for server-side rendering
  if (typeof window === 'undefined') {
    return null;
  }

  // Early return if not authenticated
  if (!session?.user) {
    return <div className="container mx-auto p-4 max-w-5xl">Please sign in to view messages</div>;
  }

  // Early return if searchParams is not available
  if (!searchParams) {
    return <div className="container mx-auto p-4 max-w-5xl">Loading...</div>;
  }

  const conversationId = searchParams.get('conversationId');
  const currentUserId = session.user.id;
  const user = session.user; // Store user in a constant to avoid repeated type checks

  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'incoming'>('inbox');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchConversations = useCallback(async () => {
    if (sessionStatus !== 'authenticated' || !currentUserId) return;
    setIsLoadingConversations(true);
    setError(null);
    try {
      const response = await fetch('/api/conversations');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Failed to fetch conversations');
      const data = await response.json();
      setAllConversations(data.conversations || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      toast({ title: "Error", description: `Failed to load conversations: ${errorMsg}`, variant: "destructive" });
    } finally {
      setIsLoadingConversations(false);
    }
  }, [sessionStatus, currentUserId, toast]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const categorizedConversations = useMemo(() => {
    const inbox: Conversation[] = [];
    const incoming: Conversation[] = [];
    if (!currentUserId) return { inbox, incoming };

    allConversations.forEach(conv => {
      if (conv.approved) {
        inbox.push(conv);
      } else {
        incoming.push(conv);
      }
    });

    const getTimeValue = (timestamp: string | null | undefined, fallbackTimestamp: string | null | undefined = null): number => {
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

  const fetchMessagesForConversation = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Set up polling for messages
  useEffect(() => {
    if (selectedConversation) {
      // Clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      // Fetch messages immediately
      fetchMessagesForConversation(selectedConversation.id);

      // Set up polling every 5 seconds
      pollingIntervalRef.current = setInterval(() => {
        fetchMessagesForConversation(selectedConversation.id);
      }, 5000);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }
  }, [selectedConversation]);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConversation?.id === conv.id && messages.length > 0) return;
    setSelectedConversation(conv);
    setMessages([]);
    if (isMobile) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form submission
    if (!newMessage.trim() || isSending || !selectedConversation) return;

    const messageToSend = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Create optimistic message
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: messageToSend,
      senderId: currentUserId!,
      conversationId: selectedConversation.id,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId!,
        name: session?.user?.name || 'You',
        image: session?.user?.image || null
      }
    };

    // Add optimistic message
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          text: messageToSend
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      
      // Update the optimistic message with the real one
      setMessages(prev => prev.map(msg => 
        msg.id === optimisticMessage.id ? data.newMessage : msg
      ));

    } catch (error) {
      console.error('Error sending message:', error);
      // Remove the optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
      setNewMessage(messageToSend); // Restore the message in the input
      toast({ 
        title: "Error", 
        description: "Failed to send message. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleApproveConversation = async (conversation: Conversation) => {
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to approve conversation');
      }

      toast({
        title: 'Success',
        description: 'Conversation approved',
      });

      // Refresh conversations
      const convResponse = await fetch('/api/conversations');
      if (convResponse.ok) {
        const convData = await convResponse.json();
        setAllConversations(convData.conversations || []);
      }
    } catch (error) {
      console.error('Error approving conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve conversation',
        variant: 'destructive',
      });
    }
  };

  // Helper function to safely format dates
  const safeFormatDate = (date: string | Date | null) => {
    if (!date) return 'Never';
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Never';
    }
  };

  // Group messages by date
  const groupMessagesByDate = (messages: any[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return {
      today: messages.filter(m => {
        if (!m.createdAt) return false;
        try {
          return new Date(m.createdAt) >= today;
        } catch {
          return false;
        }
      }),
      yesterday: messages.filter(m => {
        if (!m.createdAt) return false;
        try {
          const date = new Date(m.createdAt);
          return date >= yesterday && date < today;
        } catch {
          return false;
        }
      }),
      earlier: messages.filter(m => {
        if (!m.createdAt) return false;
        try {
          return new Date(m.createdAt) < yesterday;
        } catch {
          return false;
        }
      }),
    };
  };

  const groupedMessages = selectedConversation ? groupMessagesByDate(messages) : { today: [], yesterday: [], earlier: [] };

  const renderMessageGroup = (group: any[], label: string) => {
    if (group.length === 0) return null;
    return (
      <>
        <div className="text-center text-xs text-muted-foreground my-2">{label}</div>
        {group.map((message) => (
          <div
            key={message.id}
            className={`mb-2 flex items-start ${message.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
          >
            {message.senderId !== currentUserId && (
              <Avatar className="mr-2 h-8 w-8">
                <AvatarImage src={message.sender?.image || ''} />
                <AvatarFallback>{message.sender?.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
            )}
            <div
              className={`max-w-[70%] rounded-lg p-2 ${message.senderId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {message.senderId !== currentUserId && (
                <div className="text-xs text-muted-foreground mb-1">{message.sender?.name || 'Unknown'}</div>
              )}
              <div>{message.content}</div>
              <div className={`text-xs ${message.senderId === currentUserId ? 'text-primary-foreground/70' : 'text-muted-foreground'} mt-1`}>
                {safeFormatDate(message.createdAt)}
              </div>
            </div>
            {message.senderId === currentUserId && (
              <Avatar className="ml-2 h-8 w-8">
                <AvatarImage src={message.sender?.image || user.image || ''} />
                <AvatarFallback>{message.sender?.name?.charAt(0) || user.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
      </>
    );
  };

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
                    <p className="text-xs text-muted-foreground ml-2 shrink-0">{safeFormatDate(conv.lastMessageTimestamp||conv.createdAt)}</p>
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
    const otherPDisp = otherPId ? { id: otherPId, name: conversation.participants?.find(p => p.id === otherPId)?.name || 'Unknown', image: conversation.participants?.find(p => p.id === otherPId)?.image || null } : { id: 'unknown', name: 'N/A', image: null };
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
            const senderDisp = msg.sender || otherPDisp;
            if(msg.isSystemMessage) return <div key={msg.id} className="my-3 p-2.5 bg-yellow-100 dark:bg-yellow-800 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-200 rounded-md text-xs flex items-start gap-2"><Icons.alertTriangle className="h-4 w-4 mt-0.5 shrink-0"/>{msg.content}</div>;
            return (<div key={msg.id} className={cn("flex items-end gap-2 max-w-[85%]",isSender?"justify-end self-end":"justify-start self-start")}>
                {!isSender && senderDisp && senderDisp.id!=='unknown' && <Avatar className="h-6 w-6 border shrink-0"><AvatarImage src={senderDisp.image??undefined}/><AvatarFallback>{senderDisp.name?.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>}
                <div className={cn("rounded-lg px-3 py-2 text-sm shadow-sm",isSender?"bg-primary text-primary-foreground":"bg-muted dark:bg-slate-700")}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn("text-xs mt-0.5 opacity-70",isSender?"text-right":"text-left")}>{safeFormatDate(msg.createdAt)}</p>
                </div>
                {isSender && senderDisp && senderDisp.id!=='unknown' && <Avatar className="h-6 w-6 border shrink-0"><AvatarImage src={senderDisp.image??undefined}/><AvatarFallback>{senderDisp.name?.charAt(0)?.toUpperCase()||'?'}</AvatarFallback></Avatar>}
            </div>);
        })} <div ref={messagesEndRef}/></div>
        <div className="border-t p-3 sticky bottom-0 bg-background dark:bg-slate-900">
          {conversation.approved || conversation.initiatorId === currentUserId ? (
            <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
              <Textarea 
                placeholder="Type your message..." 
                rows={1} 
                className="flex-1 resize-none max-h-24 p-2 text-sm border rounded-md"
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                disabled={isSending || isLoadingMessages} 
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!newMessage.trim() || isSending || isLoadingMessages}
              >
                {isSending ? <Icons.spinner className="h-4 w-4 animate-spin"/> : <Icons.send className="h-4 w-4"/>}
              </Button>
            </form>
          ) : ( <div className="text-center text-sm text-muted-foreground p-2">Chat unavailable.</div> )}
        </div>
      </div>);
  };

  if ((sessionStatus as 'loading' | 'authenticated' | 'unauthenticated') === 'loading') return <div className="flex items-center justify-center h-screen"><Icons.spinner className="h-8 w-8 animate-spin text-primary"/></div>;
  if ((sessionStatus as 'loading' | 'authenticated' | 'unauthenticated') === 'unauthenticated') return <div className="p-6 text-center">Please <Link href="/login" className="underline text-primary hover:text-primary/80">log in</Link>.</div>;

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
};

// Export with dynamic import
export default dynamic(() => Promise.resolve(MessagesPage), {
  ssr: false
});