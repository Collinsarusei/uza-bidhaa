'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge'; // Import Badge

// Assuming a basic user profile structure
interface UserProfile {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  createdAt: string; // Or Date object
  kycVerified?: boolean; // Assuming this might be part of the profile
  // Add other relevant fields
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/user/me'); // Call the API route
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setProfile(data.user);
      } catch (err: any) {
        console.error("Error fetching profile:", err);
        setError(err.message || "Failed to load profile.");
        toast({
          title: "Error",
          description: err.message || "Failed to load profile.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch only if the session is authenticated
    if (status === 'authenticated') {
      fetchProfile();
    } else if (status === 'unauthenticated') {
      setIsLoading(false);
      setError("Please log in to view your profile.");
      // Optional: Redirect to login
      // router.push('/auth');
    }
  }, [status, toast]); // Re-run if session status changes

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth' }); // Redirect to login page after logout
    toast({ title: "Logged Out", description: "You have been logged out." });
  };

  // Render Loading Skeletons
  const renderSkeleton = () => (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <Skeleton className="h-8 w-1/2 mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid gap-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
        </div>
         <Skeleton className="h-10 w-1/3 mt-4" /> {/* KYC Button Skeleton */}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-4 border-t pt-4">
         <Skeleton className="h-8 w-1/3 mb-4" />
          <div className="grid gap-2 w-full">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
          </div>
           <div className="grid gap-2 w-full">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" /> {/* Change Password Button Skeleton */}
          <Skeleton className="h-10 w-full mt-4" /> {/* Logout Button Skeleton */}
      </CardFooter>
    </Card>
  );

  // Render based on loading, error, or profile data
  if (status === 'loading' || isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex justify-center">
        {renderSkeleton()}
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-6 flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
             {status === 'unauthenticated' && (
                 <Link href="/auth" passHref>
                     <Button variant="link" className="mt-4">Login</Button>
                 </Link>
             )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
     return (
      <div className="container mx-auto p-4 md:p-6 flex justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Profile Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p>We could not find your profile data.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Profile Page
  return (
    <div className="container mx-auto p-4 md:p-6 flex justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
          <CardDescription>View and manage your account details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
           {/* Display User Details */}
           <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={profile.name} readOnly />
           </div>
           <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile.email} readOnly />
           </div>
           <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={profile.phoneNumber} readOnly />
           </div>
           <div className="grid gap-2">
              <Label htmlFor="createdAt">Member Since</Label>
              <Input id="createdAt" value={new Date(profile.createdAt).toLocaleDateString()} readOnly />
           </div>

           {/* KYC Section */}
           <div className="mt-4">
             <h3 className="text-lg font-semibold mb-2">Identity Verification (KYC)</h3>
             {profile.kycVerified ? (
                <Badge variant="success" className="p-2 text-sm">Verified</Badge>
             ) : (
                 <Badge variant="secondary" className="p-2 text-sm">Not Verified</Badge>
             )}
             <p className="text-sm text-muted-foreground mt-1">
                {profile.kycVerified
                  ? 'Your identity has been verified.'
                  : 'Complete KYC to start selling items.'}
             </p>
              <Link href="/kyc" passHref>
                  <Button variant="outline" className="mt-2">
                      {profile.kycVerified ? 'View KYC Details' : 'Complete KYC Now'}
                  </Button>
              </Link>
           </div>
        </CardContent>

        {/* Password Change Section */} 
        <CardFooter className="flex flex-col items-start gap-4 border-t pt-4">
          <h3 className="text-lg font-semibold">Change Password</h3>
          {/* Placeholder: Add form fields for current and new password */}
           <div className="grid gap-2 w-full">
              <Label htmlFor="current-password">Current Password</Label>
              <Input id="current-password" type="password" placeholder="Enter your current password" />
              {/* Add FormField and Controller from react-hook-form later */}
           </div>
           <div className="grid gap-2 w-full">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" placeholder="Enter your new password" />
           </div>
            <div className="grid gap-2 w-full">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input id="confirm-password" type="password" placeholder="Confirm your new password" />
           </div>
          <Button className="w-full" onClick={() => alert('Password change functionality to be implemented.')}>
             <Icons.lock className="mr-2 h-4 w-4" /> Update Password
          </Button>

          {/* Logout Button */}
           <Button variant="destructive" className="w-full mt-4" onClick={handleLogout}>
               <Icons.logout className="mr-2 h-4 w-4" /> Logout
           </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
