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
          throw new Error('Failed to fetch messages');
        }
        const data = await response.json();
        setMessages(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
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
    <div className="container mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Contact Messages</h1>
        <p className="text-muted-foreground">
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((message) => (
                    <TableRow key={message.id}>
                      <TableCell>
                        {message.user?.name || 'Unknown User'}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {message.user?.email || 'No email'}
                        </span>
                      </TableCell>
                      <TableCell>{message.subject}</TableCell>
                      <TableCell className="max-w-xs truncate" title={message.message}>
                        {message.message}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(message.status)}>
                          {message.status.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(message.createdAt)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={processingMessageId === message.id}
                            >
                              {processingMessageId === message.id ? (
                                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Update Status
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Update Message Status</AlertDialogTitle>
                              <AlertDialogDescription>
                                Select the new status for this message.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="grid gap-4 py-4">
                              <Button
                                variant="outline"
                                onClick={() => handleStatusUpdate(message.id, 'READ')}
                                disabled={processingMessageId === message.id || message.status === 'READ'}
                              >
                                Mark as Read
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleStatusUpdate(message.id, 'RESPONDED')}
                                disabled={processingMessageId === message.id || message.status === 'RESPONDED'}
                              >
                                Mark as Responded
                              </Button>
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 