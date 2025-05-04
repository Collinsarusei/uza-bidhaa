'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { UserProfile as BaseUserProfile } from "@/lib/types";
import { format, differenceInDays, parseISO } from 'date-fns';

interface ProfileDataFromApi extends Omit<Partial<BaseUserProfile>, 'createdAt' | 'updatedAt' | 'usernameLastUpdatedAt' | 'locationLastUpdatedAt' | 'mpesaLastUpdatedAt'> {
  createdAt: string | null;
  updatedAt: string | null;
  usernameLastUpdatedAt?: string | null;
  locationLastUpdatedAt?: string | null;
  mpesaLastUpdatedAt?: string | null;
}

interface ProfileFormData {
    username: string;
    location: string;
    mpesaPhoneNumber: string;
}

export function ProfileContent() {
  const { data: session, status, update: updateSession } = useSession();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileDataFromApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({ username: '', location: '', mpesaPhoneNumber: '' });

  useEffect(() => {
    const fetchProfile = async () => {
      if (status !== 'authenticated') { setIsLoading(false); setError("Authentication required."); return; }
      setIsLoading(true); setError(null);
      try {
        const response = await fetch('/api/user/me');
        if (!response.ok) { const d = await response.json().catch(() => ({})); throw new Error(d.message || `HTTP error! ${response.status}`); }
        const data = await response.json();
        setProfile(data.user);
        setFormData({ username: data.user?.username || '', location: data.user?.location || '', mpesaPhoneNumber: data.user?.mpesaPhoneNumber || '' });
      } catch (err: any) { console.error("Fetch Profile Error:", err); setError(err.message); }
      finally { setIsLoading(false); }
    };
    if (status !== 'loading') { fetchProfile(); }
  }, [status]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCancel = () => {
      setFormData({ username: profile?.username || '', location: profile?.location || '', mpesaPhoneNumber: profile?.mpesaPhoneNumber || '' });
      setIsEditing(false); setError(null);
  };

  const handleSave = async () => {
      setIsSaving(true); setError(null);
      try {
          if (!formData.username.trim()) throw new Error("Username empty.");
          if (!formData.mpesaPhoneNumber.trim()) throw new Error("M-Pesa empty.");
          const response = await fetch('/api/user/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
          const result = await response.json();
          if (!response.ok) { throw new Error(result.message || `Save error! ${response.status}`); }
          setProfile(result.user);
          setFormData({ username: result.user?.username || '', location: result.user?.location || '', mpesaPhoneNumber: result.user?.mpesaPhoneNumber || '' });
          setIsEditing(false);
          toast({ title: "Success", description: "Profile updated." });
          await updateSession({ ...session, user: { ...session?.user, name: formData.username } });
      } catch (err: any) {
          console.error("Save Profile Error:", err);
          setError(err.message);
          toast({ title: "Save Failed", description: err.message, variant: "destructive" });
      } finally { setIsSaving(false); }
  };

  const canEditField = (lastUpdateTimestamp: string | null | undefined): boolean => {
      if (!lastUpdateTimestamp) return true;
      try { return differenceInDays(new Date(), parseISO(lastUpdateTimestamp)) >= 60; }
      catch (e) { return false; }
  };

  const isUsernameLocked = !!(isEditing && profile?.usernameLastUpdatedAt && !canEditField(profile.usernameLastUpdatedAt));
  const isLocationLocked = !!(isEditing && profile?.locationLastUpdatedAt && !canEditField(profile.locationLastUpdatedAt));
  const isMpesaLocked = !!(isEditing && profile?.mpesaLastUpdatedAt && !canEditField(profile.mpesaLastUpdatedAt));

  // --- Restored renderSkeleton function --- 
  const renderSkeleton = () => (
      <Card className="w-full border-none shadow-none">
          <CardHeader className="items-center">
              <Skeleton className="h-24 w-24 rounded-full mb-2" />
              <Skeleton className="h-6 w-32 mb-1" />
              <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
          </CardContent>
      </Card>
  );
  // --- End Restore --- 

  if (isLoading && status !== 'authenticated') return renderSkeleton();
  if (status === 'loading') return renderSkeleton();
  if (error && !isEditing) { 
       return (
            <Card className="w-full border-destructive bg-destructive/10">
                <CardContent className="p-6 text-center text-destructive">
                <Icons.alertTriangle className="h-10 w-10 mx-auto mb-3" />
                <p className="font-semibold">Error Loading Profile</p>
                <p className="text-sm">{error}</p>
                </CardContent>
            </Card>
        );
   }
  if (!profile && !isEditing && !isLoading) { 
      return (
            <Card className="w-full border-none shadow-none">
                <CardContent className="p-6 text-center text-muted-foreground"><p>Could not load profile data.</p></CardContent>
            </Card>
        );
   }

  const formatDate = (dateString: string | Date | null | undefined) => {
     if (!dateString) return 'N/A';
     try { return format(new Date(dateString), 'PPP p'); } catch { return 'Invalid Date'; }
  };

  console.log("Render State:", { isLoading, isSaving, isEditing, isUsernameLocked });

  return (
    <Card className="w-full border-none shadow-none">
      <CardHeader className="items-center text-center">
        <Avatar className="h-24 w-24 mb-3">/* ... avatar ... */</Avatar>
        <CardTitle>{isEditing ? 'Editing Profile' : profile?.username || 'Username Not Set'}</CardTitle>
        <CardDescription>{profile?.email || 'Email Not Set'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
         {isEditing && error && (<p className="text-sm font-medium text-destructive text-center">{error}</p>)}

        <div className="space-y-1">
            <Label htmlFor="profile-username">Username <span className="text-red-500">*</span></Label>
            <Input 
                id="profile-username"
                name="username"
                value={isEditing ? formData.username : profile?.username || ''} 
                onChange={handleInputChange}
                readOnly={!isEditing || isUsernameLocked} 
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="Enter your username"
                className={isUsernameLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
             {isUsernameLocked && (<p className="text-xs text-yellow-600">You can change your username again after 60 days from the last update.</p>)}
        </div>
         <div className="space-y-1"> <Label>Email</Label><Input value={profile?.email || ''} readOnly disabled /><p className="text-xs text-muted-foreground">Email cannot be changed.</p></div>
         <div className="space-y-1"> <Label>Phone Number</Label><Input value={profile?.phoneNumber || 'Not Set'} readOnly disabled /><p className="text-xs text-muted-foreground">Contact support to change phone number.</p></div>
         <div className="space-y-1">
            <Label htmlFor="profile-location">Location</Label>
            <Input 
                id="profile-location" 
                name="location"
                value={isEditing ? formData.location : profile?.location || 'Not Set'} 
                onChange={handleInputChange}
                readOnly={!isEditing || isLocationLocked}
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="e.g., Nairobi - Westlands" 
                 className={isLocationLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
             {isLocationLocked && (<p className="text-xs text-yellow-600">You can change your location again after 60 days from the last update.</p>)}
        </div>
         <div className="space-y-1">
            <Label htmlFor="profile-mpesa">M-Pesa Payout Number <span className="text-red-500">*</span></Label>
            <Input 
                id="profile-mpesa" 
                name="mpesaPhoneNumber"
                value={isEditing ? formData.mpesaPhoneNumber : profile?.mpesaPhoneNumber || 'Not Set'} 
                onChange={handleInputChange}
                readOnly={!isEditing || isMpesaLocked}
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="e.g., 0712345678" 
                 className={isMpesaLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
            {isMpesaLocked && (<p className="text-xs text-yellow-600">You can change your M-Pesa number again after 60 days from the last update.</p>)}
             <p className="text-xs text-muted-foreground">Used for receiving payouts.</p>
        </div>
         <div className="space-y-1"> <Label>Member Since</Label><Input value={formatDate(profile?.createdAt)} readOnly disabled /></div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            {isEditing ? (
                <>
                    <Button variant="outline" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving}> {isSaving && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} Save Changes</Button>
                </>
            ) : (
                <Button variant="outline" onClick={() => { console.log('Edit button clicked!'); setIsEditing(true); setError(null); }} disabled={isLoading}>Edit Profile</Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}