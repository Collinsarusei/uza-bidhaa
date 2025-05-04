'use client'; // Keep client directive if needed for session or hooks

import { NotificationsContent } from '@/components/notifications-content'; // Import the content component

export default function NotificationsPage() {
  // This page now simply renders the shared content component.
  // It provides the route /notifications for full-page mobile navigation.
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-4">Notifications</h1>
      <NotificationsContent />
    </div>
  );
}
