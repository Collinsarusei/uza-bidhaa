// src/app/notifications/page.tsx
'use client';

import { useNotifications } from '@/components/providers/notification-provider';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Notification } from '@/lib/types';
import { parseISO } from 'date-fns';

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, error, markAllAsRead, markOneAsRead } = useNotifications();

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleMarkOneAsRead = async (notificationId: string) => {
    await markOneAsRead(notificationId);
  };

  const getNotificationIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'new_message':
        return '💬';
      case 'payment_received':
        return '💰';
      case 'item_sold':
        return '🛍️';
      case 'dispute_opened':
        return '⚠️';
      case 'dispute_resolved':
        return '✅';
      case 'withdrawal_completed':
        return '💸';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'new_message':
        return 'text-blue-500';
      case 'payment_received':
        return 'text-green-500';
      case 'item_sold':
        return 'text-purple-500';
      case 'dispute_opened':
        return 'text-red-500';
      case 'dispute_resolved':
        return 'text-green-500';
      case 'withdrawal_completed':
        return 'text-green-500';
      default:
        return 'text-gray-500';
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            onClick={handleMarkAllAsRead}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Check className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>
            Stay updated with your latest activities and interactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No notifications yet</h3>
                <p className="text-muted-foreground">
                  When you receive notifications, they will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-lg transition-colors',
                      !notification.isRead && 'bg-muted/50'
                    )}
                  >
                    <div className={cn('text-2xl', getNotificationColor(notification.type))}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between">
                        <p className="font-medium">{notification.message}</p>
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkOneAsRead(notification.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.createdAt
                          ? formatDistanceToNow(parseISO(notification.createdAt), {
                              addSuffix: true,
                            })
                          : 'Just now'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}