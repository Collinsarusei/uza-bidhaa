'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import type { Notification as NotificationType } from '@/lib/types';

interface ProcessedNotification extends Omit<NotificationType, 'createdAt'> {
  createdAt: Date;
}

// Reusable component for displaying notifications
export function NotificationsContent() {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<ProcessedNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (status === 'authenticated' && session?.user?.id) {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch('/api/notifications');
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data: NotificationType[] = await response.json();
          const processedData: ProcessedNotification[] = data.map(n => ({
              ...n,
              createdAt: n.createdAt && typeof n.createdAt === 'object' && 'seconds' in n.createdAt
                  ? new Date(n.createdAt.seconds * 1000 + n.createdAt.nanoseconds / 1000000)
                  : n.createdAt instanceof Date ? n.createdAt : new Date()
          }));
          setNotifications(processedData);
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

  const getIconForType = (type: NotificationType['type']) => {
    switch (type) {
        case 'new_message': return <Icons.mail className="h-5 w-5 text-blue-500" />;
        case 'item_listed': return <Icons.plusCircle className="h-5 w-5 text-green-500" />;
        case 'payment_received': return <Icons.circleDollarSign className="h-5 w-5 text-yellow-500" />;
        case 'payment_released': return <Icons.circleDollarSign className="h-5 w-5 text-green-500" />;
        case 'item_sold': return <Icons.tag className="h-5 w-5 text-purple-500" />;
        case 'unusual_activity': return <Icons.shield className="h-5 w-5 text-red-500" />;
        case 'kyc_approved': return <Icons.check className="h-5 w-5 text-green-500" />;
        case 'kyc_rejected': return <Icons.close className="h-5 w-5 text-red-500" />;
        default: return <Icons.bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const renderNotification = (notification: ProcessedNotification) => (
    <Card key={notification.id} className={`mb-3 shadow-sm ${notification.readStatus ? 'opacity-70' : 'border-l-4 border-primary'}`}>
      <CardContent className="p-3 flex items-start space-x-3">
        <div className="flex-shrink-0 pt-0.5">
          {getIconForType(notification.type)}
        </div>
        <div className="flex-grow">
          <p className={`text-sm leading-snug ${!notification.readStatus ? 'font-medium' : ''}`}>{notification.message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
          </p>
        </div>
        {!notification.readStatus && (
          <Badge variant="destructive" className="flex-shrink-0 h-2 w-2 p-0 rounded-full"></Badge>
        )}
      </CardContent>
    </Card>
  );

  const renderLoadingSkeletons = () => (
    Array.from({ length: 5 }).map((_, index) => (
      <Card key={index} className="mb-3 shadow-sm">
        <CardContent className="p-3 flex items-start space-x-3">
          <Skeleton className="h-5 w-5 rounded-full flex-shrink-0 mt-0.5" />
          <div className="flex-grow space-y-1.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-2 w-2 rounded-full flex-shrink-0" />
        </CardContent>
      </Card>
    ))
  );

  if (isLoading || status === 'loading') {
    return <div className="space-y-3 p-1">{renderLoadingSkeletons()}</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/10 m-1">
        <CardContent className="p-4 text-center text-destructive">
           <Icons.alertTriangle className="h-8 w-8 mx-auto mb-2" />
           <p className="font-semibold">Error</p>
           <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (notifications.length === 0) {
    return (
      <Card className="border-none shadow-none m-1">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Icons.bellOff className="h-10 w-10 mx-auto mb-3 text-gray-400" /> {/* Assuming bellOff icon */}
          <p>No notifications yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 p-1">
       {/* Add "Mark all as read" button later */}
       {notifications.map(renderNotification)}
    </div>
  );
}