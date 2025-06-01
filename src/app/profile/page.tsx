'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

type UserRole = 'USER' | 'ADMIN';

interface AppUser {
  id: string;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
  image?: string | null;
  role?: UserRole | null;
  availableBalance?: number | string | null; // Added for payment tab
  location?: string | null; // Added based on form
  mpesaPhoneNumber?: string | null; // Added based on form
}

const profileFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits').optional().or(z.literal('')),
  location: z.string().optional(),
  mpesaPhoneNumber: z.string().min(10, 'MPESA number must be at least 10 digits').optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState<UserProfile | null>(null);

  // Declare and initialize form BEFORE useEffect that uses it
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      location: '',
      mpesaPhoneNumber: '',
    },
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth'); // Redirect to your login/auth page
    } else if (status === 'authenticated' && session?.user?.id) {
      // Fetch full user profile data if needed, e.g., location, mpesaPhoneNumber if not in session
      const fetchUserProfile = async () => {
        try {
          const response = await fetch('/api/user/me');
          if (!response.ok) throw new Error('Failed to fetch profile data');
          const profileData: UserProfile = await response.json();
          setUserData(profileData);
          // Reset form with fetched data + session data
          form.reset({
            name: profileData.name || (session.user as AppUser).name || '',
            email: profileData.email || (session.user as AppUser).email || '',
            phoneNumber: profileData.phoneNumber || (session.user as AppUser).phoneNumber || '',
            location: profileData.location || '',
            mpesaPhoneNumber: profileData.mpesaPhoneNumber || '',
          });
        } catch (error) {
          console.error("Failed to fetch user profile", error);
          toast({ title: "Error", description: "Could not load profile data.", variant: "destructive" });
          // Initialize form with session data as fallback
          form.reset({
            name: (session.user as AppUser)?.name || '',
            email: (session.user as AppUser)?.email || '',
            phoneNumber: (session.user as AppUser)?.phoneNumber || '',
            location: '',
            mpesaPhoneNumber: '',
          });
        }
      };
      fetchUserProfile();
    }
  }, [status, session, router, toast, form]); // Now form is correctly in scope

  const onSubmit = async (data: ProfileFormValues) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }
      toast({ title: 'Profile updated', description: 'Your profile has been updated successfully.' });
      const updatedProfile = await response.json();
      setUserData(updatedProfile.user); // Assuming API returns { user: UserProfile }
       // Optionally re-sync session if name/email changed and NextAuth uses it
       // signOut({ redirect: false }).then(() => signIn('credentials', { ... }))
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update profile. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || (status === 'authenticated' && !userData && !form.formState.isDirty)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !session) {
    // This state should ideally be brief as useEffect handles redirect.
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <p>Redirecting to login...</p>
            <Loader2 className="h-8 w-8 animate-spin text-primary ml-2" />
        </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Update your personal information and preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Your name" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="Your email" type="email" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (<FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="Your phone number" {...field} /></FormControl><FormDescription>This number is used for OTP verification</FormDescription><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="location" render={({ field }) => (<FormItem><FormLabel>Location</FormLabel><FormControl><Input placeholder="Your location" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="mpesaPhoneNumber" render={({ field }) => (<FormItem><FormLabel>MPESA Phone Number</FormLabel><FormControl><Input placeholder="Your MPESA number" {...field} /></FormControl><FormDescription>This number is used for receiving payments</FormDescription><FormMessage /></FormItem>)} />
                  <Button type="submit" disabled={isLoading || !form.formState.isDirty}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader><CardTitle>Security Settings</CardTitle><CardDescription>Manage your account security and authentication</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium">Two-Factor Authentication</h3><p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p></div>
                <Button variant="outline">Enable</Button>
              </div>
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium">Change Password</h3><p className="text-sm text-muted-foreground">Update your account password</p></div>
                <Button variant="outline">Change</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle>Payment Settings</CardTitle><CardDescription>Manage your payment methods and preferences</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium">Available Balance</h3><p className="text-sm text-muted-foreground">Your current available balance</p></div>
                <p className="font-medium">
                  {userData?.availableBalance !== undefined
                    ? `KES ${Number(userData.availableBalance).toLocaleString()}`
                    : (session?.user as AppUser)?.availableBalance !== undefined 
                        ? `KES ${Number((session.user as AppUser).availableBalance).toLocaleString()}` 
                        : 'Loading...'}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div><h3 className="font-medium">Withdraw Funds</h3><p className="text-sm text-muted-foreground">Withdraw your available balance</p></div>
                <Button variant="outline">Withdraw</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
