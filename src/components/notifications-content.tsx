'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'; // Import isValid
import type { Notification as NotificationType } from '@/lib/types';
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/components/providers/notification-provider";

export function NotificationsContent() {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  // Removed contextMarkAllAsRead as it's called from the dashboard page opening the sheet

  useEffect(() => {
    const fetchNotifications = async () => {
      if (status === 'authenticated' && session?.user?.id) {
        setIsLoading(true);
        setError(null);
        try {
          console.log("NotificationsContent: Fetching notifications...");
          const response = await fetch('/api/notifications');
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP error! status: ${response.status}`);
          }
          const data: NotificationType[] = await response.json();
          console.log(`NotificationsContent: Fetched ${data.length} notifications.`);
          setNotifications(data);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch notifications.';
          setError(message);
          console.error("Error fetching notifications:", err);
        } finally {
          setIsLoading(false);
        }
      } else if (status === 'unauthenticated') {
        setError("You need to be logged in to view notifications.");
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [session, status]);

  const handleNotificationClick = useCallback(async (notificationId: string) => {
      const clickedNotification = notifications.find(n => n.id === notificationId);
      if (!clickedNotification) return;

      if (!clickedNotification.isRead) {
          setNotifications(prev => 
              prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
          );
          try {
              const response = await fetch('/api/notifications/mark-one-read', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notificationId })
              });
              if (!response.ok) {
                  const result = await response.json().catch(() => ({}));
                  throw new Error(result.message || 'API Error');
              }
          } catch (err) {
              console.error("Mark one read API Error:", err);
              toast({ title: "Error", description: "Could not update notification status.", variant: "destructive" });
              setNotifications(prev => 
                  prev.map(n => n.id === notificationId ? { ...n, isRead: false } : n)
              );
          }
      }
      // Potentially navigate based on notification type/link here if you add such a feature
  }, [notifications, toast]);

  const getIconForType = (type: NotificationType['type']) => {
    switch (type) {
        case 'new_message': return <Icons.mail className="h-5 w-5 text-blue-500" />;
        case 'item_listed': return <Icons.plusCircle className="h-5 w-5 text-green-500" />;
        case 'payment_received': return <Icons.circleDollarSign className="h-5 w-5 text-yellow-500" />;
        case 'payment_released': return <Icons.circleDollarSign className="h-5 w-5 text-green-500" />;
        case 'item_sold': return <Icons.tag className="h-5 w-5 text-purple-500" />;
        case 'unusual_activity': return <Icons.shield className="h-5 w-5 text-red-500" />;
        case 'kyc_approved': return <Icons.check className="h-5 w-5 text-green-500" />;
        case 'kyc_rejected': return <Icons.x className="h-5 w-5 text-red-500" />;
        case 'admin_action': return <Icons.shieldAlert className="h-5 w-5 text-orange-500" />;
        case 'dispute_filed': return <Icons.alertTriangle className="h-5 w-5 text-red-600" />;
        case 'new_dispute_admin': return <Icons.alertTriangle className="h-5 w-5 text-red-700 font-bold" />;
        case 'withdrawal_initiated': return <Icons.loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
        case 'withdrawal_completed': return <Icons.check className="h-5 w-5 text-green-500" />;
        case 'withdrawal_failed': return <Icons.x className="h-5 w-5 text-red-500" />;
        default: return <Icons.bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const renderNotification = (notification: NotificationType) => {
    let createdAtDate: Date | null = null;
    let displayTime = 'Date unavailable';

    if (typeof notification.createdAt === 'string') {
        try {
            createdAtDate = parseISO(notification.createdAt);
            if (isValid(createdAtDate)) { // Check if the parsed date is valid
                displayTime = formatDistanceToNow(createdAtDate, { addSuffix: true });
            } else {
                console.warn("Parsed invalid date for notification:", notification.id, notification.createdAt);
            }
        } catch (e) { 
            console.error("Error parsing notification timestamp string:", notification.id, notification.createdAt, e);
        }
    } else if (notification.createdAt === null || notification.createdAt === undefined) {
        // Handled by initial displayTime value
    } else {
        console.warn("Unexpected type for notification.createdAt:", typeof notification.createdAt, notification.id);
    }

    return (
        <Card 
            key={notification.id}
            className={cn(
                "mb-2 shadow-sm cursor-pointer transition-colors hover:bg-muted/50 dark:hover:bg-slate-700/50", 
                notification.isRead ? "bg-card/50 opacity-75 dark:bg-slate-800/50 dark:border-slate-700" : "bg-card border-l-4 border-primary dark:bg-slate-800 dark:border-primary"
            )}
            onClick={() => handleNotificationClick(notification.id)}
        >
            <CardContent className="p-3 flex items-start space-x-3">
                <div className="flex-shrink-0 pt-0.5">
                {getIconForType(notification.type)}
                </div>
                <div className="flex-grow">
                <p className={cn(
                    "text-sm leading-snug", 
                    !notification.isRead ? "font-medium text-foreground dark:text-gray-100" : "text-muted-foreground dark:text-slate-400"
                )}>
                    {notification.message}
                </p>
                <p className="text-xs text-muted-foreground dark:text-slate-500 mt-1">
                    {displayTime}
                </p>
                </div>
            </CardContent>
        </Card>
    );
  };

  const renderLoadingSkeletons = () => (
    Array.from({ length: 5 }).map((_, index) => (
      <Card key={index} className="mb-2 shadow-sm dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="p-3 flex items-start space-x-3">
          <Skeleton className="h-5 w-5 rounded-full flex-shrink-0 mt-0.5 bg-slate-200 dark:bg-slate-700" />
          <div className="flex-grow space-y-1.5">
            <Skeleton className="h-4 w-4/5 bg-slate-200 dark:bg-slate-700" />
            <Skeleton className="h-3 w-1/3 bg-slate-200 dark:bg-slate-700" />
          </div>
        </CardContent>
      </Card>
    ))
  );

  if (isLoading || status === 'loading') {
    return <div className="space-y-2 p-1">{renderLoadingSkeletons()}</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/10 m-1 dark:bg-red-900/30 dark:border-red-700">
        <CardContent className="p-4 text-center text-destructive dark:text-red-400">
           <Icons.alertTriangle className="h-8 w-8 mx-auto mb-2" />
           <p className="font-semibold">Error</p>
           <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card className="border-none shadow-none m-1 dark:bg-slate-800 dark:border-slate-700">
        <CardContent className="p-6 text-center text-muted-foreground dark:text-slate-400">
          <Icons.bellOff className="h-10 w-10 mx-auto mb-3 text-gray-400 dark:text-slate-500" />
          <p>No notifications yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2 p-1">
       {notifications.map(renderNotification)}
    </div>
  );
}
