// src/components/providers/notification-provider.tsx
'use client';

import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { Notification } from '@/lib/types';
import { parseISO, isValid } from 'date-fns';

interface NotificationContextData {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  markAllAsRead: () => Promise<void>;
  markOneAsRead: (notificationId: string) => Promise<void>;
  refetchNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextData | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processedToastIds, setProcessedToastIds] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(() => {
    return Array.isArray(allNotifications) ? allNotifications.filter(n => !n.isRead).length : 0;
  }, [allNotifications]);

  const fetchNotifications = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    
    let retryCount = 0;
    const maxRetries = 3;
    
    const attemptFetch = async (): Promise<void> => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/notifications');
        if (!response.ok) {
          throw new Error(`Failed to fetch notifications: ${response.status}`);
        }
        const data = await response.json();
        // Ensure we're setting an array of notifications
        const notifications = Array.isArray(data.notifications) ? data.notifications : [];
        setAllNotifications(notifications);
        setError(null);

        // Show toasts for new unread notifications
        const newToastableNotifications = notifications.filter((n: Notification) => {
          const createdAtDate = n.createdAt ? parseISO(n.createdAt) : null;
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          return (
            !n.isRead &&
            createdAtDate &&
            isValid(createdAtDate) &&
            createdAtDate > fiveMinutesAgo &&
            !processedToastIds.has(n.id)
          );
        });

        if (newToastableNotifications.length > 0) {
          const updatedToastIds = new Set(processedToastIds);
          newToastableNotifications.forEach((n: Notification) => {
            toast({
              title: n.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              description: n.message,
            });
            updatedToastIds.add(n.id);
          });
          setProcessedToastIds(prev => new Set([...prev, ...newToastableNotifications.map((n: Notification) => n.id)]));
        }
      } catch (err) {
        console.error('Error fetching notifications:', err);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying notification fetch (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
          return attemptFetch();
        }
        setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
      } finally {
        setIsLoading(false);
      }
    };

    await attemptFetch();
  }, [status, session?.user?.id, toast]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchNotifications();
      // Set up polling for new notifications every minute
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    } else if (status === 'unauthenticated') {
      setAllNotifications([]);
      setProcessedToastIds(new Set());
      setError(null);
    }
  }, [status, session?.user?.id, fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id || unreadCount === 0) {
      return;
    }
    try {
      const response = await fetch('/api/notifications/mark-read', { method: 'POST' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to mark notifications as read via API');
      }
      toast({ title: "Notifications Marked", description: "All caught up!" });
      // Refresh notifications after marking all as read
      fetchNotifications();
    } catch (error) {
      console.error("MarkAllAsRead API Error:", error);
      toast({ title: "Error", description: "Could not mark notifications as read.", variant: "destructive" });
    }
  }, [status, session?.user?.id, unreadCount, toast, fetchNotifications]);

  const markOneAsRead = useCallback(async (notificationId: string) => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    try {
      const response = await fetch('/api/notifications/mark-one-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to mark notification as read');
      }
      // Refresh notifications after marking one as read
      fetchNotifications();
    } catch (err) {
      console.error("markOneAsRead API error:", err);
      toast({ title: "Error", description: "Could not mark notification as read.", variant: "destructive" });
    }
  }, [status, session?.user?.id, toast, fetchNotifications]);

  const refetchNotifications = useCallback(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchNotifications();
    }
  }, [status, session?.user?.id, fetchNotifications]);

  const contextValue = useMemo(() => ({
    notifications: allNotifications,
    unreadCount,
    isLoading,
    error,
    markAllAsRead,
    markOneAsRead,
    refetchNotifications,
  }), [allNotifications, unreadCount, isLoading, error, markAllAsRead, markOneAsRead, refetchNotifications]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}