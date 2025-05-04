'use client'; // Keep client directive if needed for session or hooks

import { ProfileContent } from '@/components/profile-content'; // Import the content component

export default function ProfilePage() {
  // This page now simply renders the shared content component.
  // It provides the route /profile for full-page mobile navigation.
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-2xl">
      {/* You might add a page-specific title here if desired */}
      {/* <h1 className="text-2xl font-semibold mb-6">My Profile</h1> */}
      <ProfileContent />
    </div>
  );
}
