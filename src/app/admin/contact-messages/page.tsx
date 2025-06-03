'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Required Next.js configuration for dynamic pages
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

interface ContactMessage {
  id: string;
  userId: string;
  subject: string;
  message: string;
  status: 'PENDING' | 'READ' | 'RESPONDED';
  createdAt: string;
  updatedAt: string;
  user?: {
    name: string;
    email: string;
  };
}

export default function AdminContactMessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingMessageId, setProcessingMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth?callbackUrl=/admin/contact-messages');
      return;
    }

    if (status === 'authenticated' && (session?.user as any)?.role !== 'ADMIN') {
      setError("You are not authorized to view this page.");
      setIsLoading(false);
      return;
    }

    const fetchMessages = async () => {
      try {
        const response = await fetch('/api/admin/contact-messages', {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch messages');
        }
        const data = await response.json();
        if (!data.messages || !Array.isArray(data.messages)) {
          throw new Error('Invalid response format from server');
        }
        setMessages(data.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
        setMessages([]); // Set empty array on error
      } finally {
        setIsLoading(false);
      }
    };

    if (status === 'authenticated') {
      fetchMessages();
    }
  }, [status, session, router]);

  const handleStatusUpdate = async (messageId: string, newStatus: ContactMessage['status']) => {
    setProcessingMessageId(messageId);
    try {
      const response = await fetch(`/api/admin/contact-messages/${messageId}`, {
        method: 'PATCH',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update message status');
      }

      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, status: newStatus }
            : msg
        )
      );

      toast({
        title: "Status Updated",
        description: `Message status updated to ${newStatus.toLowerCase().replace('_', ' ')}.`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update message status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingMessageId(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'PPpp');
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusBadgeVariant = (status: ContactMessage['status']) => {
    switch (status) {
      case 'PENDING':
        return 'secondary';
      case 'READ':
        return 'default';
      case 'RESPONDED':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const handleViewMessage = (message: ContactMessage) => {
    setSelectedMessage(message);
  };

  const handleMarkAsRead = async (messageId: string) => {
    setIsUpdating(true);
    try {
      await handleStatusUpdate(messageId, 'READ');
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to mark message as read. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
      setSelectedMessage(null);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-1/2 mb-2" />
        <Skeleton className="h-4 w-3/4 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3 mb-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Contact Messages</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Review and manage messages from users.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Contact Messages</CardTitle>
          <CardDescription>
            Total: {messages.length} message(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-muted-foreground">No contact messages to display.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
              <Table>
                <TableHeader>
                  <TableRow>
                      <TableHead className="whitespace-nowrap">From</TableHead>
                      <TableHead className="whitespace-nowrap">Subject</TableHead>
                      <TableHead className="hidden md:table-cell">Message</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Received</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((message) => (
                    <TableRow key={message.id}>
                        <TableCell className="whitespace-nowrap">{message.user?.name || 'Unknown User'}</TableCell>
                        <TableCell className="whitespace-nowrap">{message.subject}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="max-w-[200px] truncate">{message.message}</div>
                      </TableCell>
                        <TableCell className="whitespace-nowrap">
                        <Badge variant={getStatusBadgeVariant(message.status)}>
                          {message.status.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(message.createdAt)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                            <Button
                            variant="ghost"
                              size="sm"
                            onClick={() => handleViewMessage(message)}
                          >
                            <Icons.eye className="h-4 w-4" />
                            <span className="sr-only">View</span>
                              </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div>
                <Label>From</Label>
                <p className="text-sm">{selectedMessage.user?.email}</p>
              </div>
              <div>
                <Label>Subject</Label>
                <p className="text-sm">{selectedMessage.subject}</p>
              </div>
              <div>
                <Label>Message</Label>
                <p className="text-sm whitespace-pre-wrap">{selectedMessage.message}</p>
              </div>
              <div>
                <Label>Received</Label>
                <p className="text-sm">{formatDate(selectedMessage.createdAt)}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedMessage(null)}
                >
                  Close
                </Button>
                {selectedMessage.status !== 'READ' && (
                  <Button
                    onClick={() => handleMarkAsRead(selectedMessage.id)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Icons.check className="mr-2 h-4 w-4" />
                        Mark as Read
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 