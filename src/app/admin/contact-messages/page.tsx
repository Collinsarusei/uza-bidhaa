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

interface ContactMessage {
  id: string;
  userId: string;
  subject: string;
  message: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
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
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [processingMessageId, setProcessingMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
    } else if (status === 'unauthenticated') {
      setIsAuthorized(false);
      router.push('/auth?callbackUrl=/admin/contact-messages');
    }
  }, [status, router, session]);

  const fetchMessages = async () => {
    if (!isAuthorized) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/contact-messages');
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          setIsAuthorized(false);
          setError("You are not authorized to view this page.");
          return;
        }
        throw new Error(errData.message || `Failed to fetch messages: ${response.status}`);
      }
      const data: ContactMessage[] = await response.json();
      setMessages(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load messages.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized === true) {
      fetchMessages();
    } else if (isAuthorized === false && status === 'authenticated') {
      setError("You are not authorized to view this page.");
      setIsLoading(false);
    }
  }, [isAuthorized, status]);

  const handleStatusUpdate = async (messageId: string, newStatus: ContactMessage['status']) => {
    setProcessingMessageId(messageId);
    try {
      const response = await fetch(`/api/admin/contact-messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update message status');
      }

      toast({
        title: "Status Updated",
        description: `Message status updated to ${newStatus.toLowerCase().replace('_', ' ')}.`,
      });

      fetchMessages(); // Refresh the list
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
      case 'IN_PROGRESS':
        return 'default';
      case 'RESOLVED':
        return 'default';
      default:
        return 'secondary';
    }
  };

  if (status === 'loading' || isAuthorized === null) {
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

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to access this page.</AlertDescription>
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

      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Messages</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && (
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
                                  onClick={() => handleStatusUpdate(message.id, 'IN_PROGRESS')}
                                  disabled={processingMessageId === message.id || message.status === 'IN_PROGRESS'}
                                >
                                  Mark as In Progress
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleStatusUpdate(message.id, 'RESOLVED')}
                                  disabled={processingMessageId === message.id || message.status === 'RESOLVED'}
                                >
                                  Mark as Resolved
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
      )}
    </div>
  );
} 