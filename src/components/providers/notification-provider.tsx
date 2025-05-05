'use client';

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { collection, query, where, onSnapshot, Timestamp, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // Import client-side Firestore instance
import { useToast } from '@/hooks/use-toast';
import { Notification } from '@/lib/types'; // Assuming Notification type exists

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
  const [processedNotificationIds, setProcessedNotificationIds] = useState<Set<string>>(new Set()); // Track shown toasts

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
          const data = doc.data() as Notification;
          const notificationId = doc.id;
          currentNotifications.push({ ...data, id: notificationId }); // Add id to data

          if (!data.isRead) {
            count++;
          }

          // Check if it's a new, unread notification we haven't processed yet
          // Only show toast for notifications created very recently to avoid spam on load
          const notificationTimestamp = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

          if (
              !data.isRead &&
              notificationTimestamp &&
              notificationTimestamp > fiveMinutesAgo && // Only toast for recent notifications
              !processedNotificationIds.has(notificationId)
            ) {
             console.log(`NotificationProvider: New unread notification detected: ${notificationId}`);
             toast({
                title: data.type.replace('_', ' ').toUpperCase(), // Basic formatting
                description: data.message,
                // Add action/link if needed based on type/relatedItemId
             });
             // Add to processed set immediately
             setProcessedNotificationIds(prev => new Set(prev).add(notificationId)); 
          }
        });

        console.log(`NotificationProvider: Unread count: ${count}`);
        setUnreadCount(count);
        
        // Optional: Clean up processed IDs if the notification is removed/read elsewhere
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
        // Handle error appropriately, maybe show a toast
      });

    } else {
      console.log("NotificationProvider: No authenticated user, skipping listener.");
      setUnreadCount(0); // Reset count if user logs out
       setProcessedNotificationIds(new Set()); // Clear processed IDs on logout
    }

    // Cleanup listener on component unmount or user change
    return () => {
      if (unsubscribe) {
        console.log("NotificationProvider: Unsubscribing listener.");
        unsubscribe();
      }
    };
  }, [status, session?.user?.id, toast]); // Rerun effect if user changes

  // --- Mark All As Read Function --- 
  const markAllAsRead = useCallback(async () => {
    if (status !== 'authenticated' || !session?.user?.id || unreadCount === 0) {
        console.log("MarkAllAsRead: Conditions not met (auth, count).");
        return;
    }
    const userId = session.user.id;
    console.log(`MarkAllAsRead: Attempting for user ${userId}`);
    // --- Option 1: Call API endpoint (Recommended) ---
    try {
        const response = await fetch('/api/notifications/mark-read', { method: 'POST' });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.message || 'Failed to mark notifications as read via API');
        }
        console.log("MarkAllAsRead: API call successful.");
        // Optimistic UI update (optional but good UX)
        // setUnreadCount(0);
        // Note: The listener should automatically update the count shortly after the backend write completes.
        toast({ title: "Notifications Marked", description: "All caught up!" });

    } catch (error) {
        console.error("MarkAllAsRead API Error:", error);
        toast({ title: "Error", description: "Could not mark notifications as read.", variant: "destructive" });
    }

    // --- Option 2: Update directly from client (Less secure, needs correct Firestore rules) ---
    /*
    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where("userId", "==", userId), where("isRead", "==", false));
    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
             console.log("MarkAllAsRead: No unread docs found on client.");
             return;
        }
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });
        await batch.commit();
        console.log(`MarkAllAsRead: Client batch committed for ${snapshot.size} docs.`);
        // The listener will update the count automatically
        toast({ title: "Notifications Marked", description: "All caught up!" });
    } catch (error) {
        console.error("MarkAllAsRead Client Error:", error);
        toast({ title: "Error", description: "Could not mark notifications as read.", variant: "destructive" });
    }
    */
  }, [status, session?.user?.id, unreadCount, toast]);

  return (
    <NotificationContext.Provider value={{ unreadCount, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}
