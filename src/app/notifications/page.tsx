// src/app/notifications/page.tsx
'use client';

import { NotificationsContent } from '@/components/notifications-content';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useNotifications } from '@/components/providers/notification-provider';

export default function NotificationsPage() {
  const { markAllAsRead, unreadCount, isLoading: isLoadingProviderNotifications } = useNotifications();

  const handleMarkAllRead = async () => {
    if (unreadCount > 0) {
        try {
            await markAllAsRead();
        } catch (error) {
            console.error("Failed to mark all notifications as read on page", error);
            // Optionally show a toast if not handled by provider
        }
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 md:p-6 min-h-screen">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unreadCount > 0 && !isLoadingProviderNotifications && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={isLoadingProviderNotifications}>
            <Icons.CheckAll className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
         {isLoadingProviderNotifications && unreadCount > 0 && (
            <Button variant="outline" size="sm" disabled>
                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                Loading...
            </Button>
        )}
      </div>
      <NotificationsContent />
    </div>
  );
}