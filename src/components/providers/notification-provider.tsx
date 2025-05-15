// src/components/providers/notification-provider.tsx
'use client';

import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { collection, query, where, onSnapshot, Timestamp as ClientTimestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Ensure you have firebase-client.ts
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

const convertToISOString = (timestamp: any): string | null => {
    if (!timestamp) return null;
    try {
        if (timestamp instanceof ClientTimestamp) {
            return timestamp.toDate().toISOString();
        }
        if (typeof timestamp === 'string') {
            const parsed = parseISO(timestamp);
            return isValid(parsed) ? parsed.toISOString() : null;
        }
        if (typeof timestamp === 'object' && typeof timestamp.seconds === 'number' && typeof timestamp.nanoseconds === 'number') {
            return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000).toISOString();
        }
        if (timestamp instanceof Date && isValid(timestamp)) {
            return timestamp.toISOString();
        }
    } catch (e) {
        // console.warn("Could not convert timestamp to ISO string:", timestamp, e);
    }
    return null;
};


export function NotificationProvider({ children }: NotificationProviderProps) {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processedToastIds, setProcessedToastIds] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(() => {
    return allNotifications.filter(n => !n.isRead).length;
  }, [allNotifications]);

  const fetchAndSetNotifications = useCallback((userId: string) => {
    setIsLoading(true);
    setError(null);
    // console.log(`NotificationProvider: Setting up listener for user ${userId}`);
    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where("userId", "==", userId)); // Add other conditions like where("archived", "==", false) if needed

    const unsubscribe: Unsubscribe = onSnapshot(q, (snapshot) => {
      const currentFetchedNotifications: Notification[] = [];
      const newToastableNotifications: Notification[] = [];

      snapshot.forEach((doc) => {
        const rawData = doc.data();
        const notificationId = doc.id;

        const data: Notification = {
            id: notificationId,
            userId: rawData.userId,
            type: rawData.type,
            message: rawData.message,
            relatedItemId: rawData.relatedItemId,
            relatedMessageId: rawData.relatedMessageId,
            relatedUserId: rawData.relatedUserId,
            isRead: rawData.isRead ?? false,
            createdAt: convertToISOString(rawData.createdAt),
            readAt: convertToISOString(rawData.readAt),
        };
        currentFetchedNotifications.push(data);

        const createdAtDate = data.createdAt ? parseISO(data.createdAt) : null;
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (
            !data.isRead &&
            createdAtDate &&
            isValid(createdAtDate) &&
            createdAtDate > fiveMinutesAgo &&
            !processedToastIds.has(notificationId)
          ) {
           newToastableNotifications.push(data);
        }
      });

      currentFetchedNotifications.sort((a, b) => {
         const timeA = a.createdAt ? parseISO(a.createdAt).getTime() : 0;
         const timeB = b.createdAt ? parseISO(b.createdAt).getTime() : 0;
         return timeB - timeA;
      });

      setAllNotifications(currentFetchedNotifications);
      setIsLoading(false);

      if (newToastableNotifications.length > 0) {
         const updatedToastIds = new Set(processedToastIds);
         newToastableNotifications.forEach(n => {
             toast({
                 title: n.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                 description: n.message,
             });
             updatedToastIds.add(n.id);
         });
         setProcessedToastIds(updatedToastIds);
      }

      const currentIds = new Set(currentFetchedNotifications.map(n => n.id));
         setProcessedToastIds(prev => {
             const updated = new Set(prev);
             for (const id of updated) {
                 if (!currentIds.has(id)) {
                     updated.delete(id);
                 }
             }
             return updated;
         });

    }, (err) => {
      console.error("Notification listener error:", err);
      setError(err.message || "Failed to load notifications.");
      setIsLoading(false);
    });
    return unsubscribe;
  }, [toast]);

  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;
    if (status === 'authenticated' && session?.user?.id) {
      unsubscribe = fetchAndSetNotifications(session.user.id);
    } else if (status === 'unauthenticated') {
      setAllNotifications([]);
      setProcessedToastIds(new Set());
      setIsLoading(false);
      setError(null);
    } else {
      setIsLoading(true);
    }

    return () => {
      if (unsubscribe) {
        // console.log("NotificationProvider: Unsubscribing listener.");
        unsubscribe();
      }
    };
  }, [status, session?.user?.id, fetchAndSetNotifications]);

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
    } catch (error) {
        console.error("MarkAllAsRead API Error:", error);
        toast({ title: "Error", description: "Could not mark notifications as read.", variant: "destructive" });
    }
  }, [status, session?.user?.id, unreadCount, toast]);

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
     } catch (err) {
         console.error("markOneAsRead API error:", err);
         toast({ title: "Error", description: "Could not mark notification as read.", variant: "destructive"});
     }
  }, [status, session?.user?.id, toast]);

  const refetchNotifications = useCallback(() => {
     if (status === 'authenticated' && session?.user?.id) {
         // No direct refetch, listener handles updates.
     }
  }, [status, session?.user?.id]);


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