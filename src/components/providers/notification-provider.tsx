'use client';

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { collection, query, where, onSnapshot, Timestamp as ClientTimestamp, writeBatch, getDocs } from 'firebase/firestore'; // Import Client Timestamp
import { db } from '@/lib/firebase'; 
import { useToast } from '@/hooks/use-toast';
import { Notification } from '@/lib/types'; 
import { parseISO } from 'date-fns'; // Import parseISO

interface NotificationContextType {
  unreadCount: number;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [processedNotificationIds, setProcessedNotificationIds] = useState<Set<string>>(new Set()); 

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    if (status === 'authenticated' && session?.user?.id) {
      const userId = session.user.id;
      console.log(`NotificationProvider: Setting up listener for user ${userId}`);
      const notificationsRef = collection(db, 'notifications');
      const q = query(notificationsRef, where("userId", "==", userId));

      unsubscribe = onSnapshot(q, (snapshot) => {
        let count = 0;
        const currentNotifications: Notification[] = [];
        console.log(`NotificationProvider: Snapshot received with ${snapshot.docs.length} docs.`);

        snapshot.forEach((doc) => {
          const rawData = doc.data();
          const notificationId = doc.id;
          
          // --- FIX: Convert client Timestamp to Date safely --- 
          let notificationTimestamp: Date | null = null;
          if (rawData.createdAt instanceof ClientTimestamp) { // Use imported ClientTimestamp
               try { notificationTimestamp = rawData.createdAt.toDate(); } catch (e) { console.error("Error converting ts:", e); }
          } else if (typeof rawData.createdAt === 'string') {
               try { notificationTimestamp = parseISO(rawData.createdAt); } catch (e) { console.error("Error parsing ts string:", e); }
          } else if (rawData.createdAt && typeof rawData.createdAt.seconds === 'number') {
               // Handle object literal { seconds, nanoseconds } case if needed
               try { notificationTimestamp = new Date(rawData.createdAt.seconds * 1000); } catch (e) { console.error("Error converting ts obj:", e); }
          }
          // --- End FIX ---
          
          // Similar conversion for readAt if it exists
          let readAtTimestamp: Date | null = null;
          if (rawData.readAt instanceof ClientTimestamp) {
              try { readAtTimestamp = rawData.readAt.toDate(); } catch {}
          } else if (typeof rawData.readAt === 'string') {
              try { readAtTimestamp = parseISO(rawData.readAt); } catch {}
          }
          // ... add object literal check if needed for readAt ...

          // Construct the Notification type matching types.ts (using string | null for dates)
          const data: Notification = {
              id: notificationId,
              userId: rawData.userId,
              type: rawData.type,
              message: rawData.message,
              relatedItemId: rawData.relatedItemId,
              relatedMessageId: rawData.relatedMessageId,
              relatedUserId: rawData.relatedUserId,
              isRead: rawData.isRead ?? false,
              createdAt: notificationTimestamp ? notificationTimestamp.toISOString() : null,
              readAt: readAtTimestamp ? readAtTimestamp.toISOString() : null,
          };

          currentNotifications.push(data);

          if (!data.isRead) {
            count++;
          }

          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

          if (
              !data.isRead &&
              notificationTimestamp && 
              notificationTimestamp > fiveMinutesAgo && 
              !processedNotificationIds.has(notificationId)
            ) {
             console.log(`NotificationProvider: New unread notification detected: ${notificationId}`);
             toast({
                title: data.type.replace(/_/g, ' ').replace(/\w/g, l => l.toUpperCase()), // Better formatting
                description: data.message,
             });
             setProcessedNotificationIds(prev => new Set(prev).add(notificationId)); 
          }
        });

        console.log(`NotificationProvider: Unread count: ${count}`);
        setUnreadCount(count);
        
        const currentIds = new Set(currentNotifications.map(n => n.id));
        setProcessedNotificationIds(prev => {
             const updated = new Set(prev);
             for (const id of updated) {
                 if (!currentIds.has(id)) {
                     updated.delete(id);
                 }
             }
             return updated;
         });

      }, (error) => {
        console.error("Notification listener error:", error);
      });

    } else {
      console.log("NotificationProvider: No authenticated user, skipping listener.");
      setUnreadCount(0);
       setProcessedNotificationIds(new Set());
    }

    return () => {
      if (unsubscribe) {
        console.log("NotificationProvider: Unsubscribing listener.");
        unsubscribe();
      }
    };
  }, [status, session?.user?.id, toast]); // Removed processedNotificationIds from deps

  const markAllAsRead = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id || unreadCount === 0) {
        console.log("MarkAllAsRead: Conditions not met (auth, count).");
        return;
    }
    const userId = session.user.id;
    console.log(`MarkAllAsRead: Attempting for user ${userId}`);
    try {
        const response = await fetch('/api/notifications/mark-read', { method: 'POST' });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || 'Failed to mark notifications as read via API');
        }
        console.log("MarkAllAsRead: API call successful.");
        toast({ title: "Notifications Marked", description: "All caught up!" });

    } catch (error) {
        console.error("MarkAllAsRead API Error:", error);
        toast({ title: "Error", description: "Could not mark notifications as read.", variant: "destructive" });
    }
  }, [status, session?.user?.id, unreadCount, toast]);

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
