'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { format, differenceInDays, parseISO } from 'date-fns';

// Import UploadThing components
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core"; // Adjust path if needed

interface ProfileDataFromApi { // Aligned with Prisma User model and /api/user/me select
  id: string; 
  name: string | null; 
  email: string | null;
  image: string | null; // Was profilePictureUrl, now maps to Prisma 'image'
  phoneNumber: string | null;
  location: string | null;
  mpesaPhoneNumber: string | null;
  createdAt: string | null; 
  updatedAt: string | null; 
  nameLastUpdatedAt?: string | null; 
}

interface ProfileFormData {
    name: string; 
    location: string;
    mpesaPhoneNumber: string;
    // No image here, image is handled by uploadedImageUrl state
}

export function ProfileContent() {
  const { data: session, status, update: updateSession } = useSession();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileDataFromApi | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({ name: '', location: '', mpesaPhoneNumber: '' });

  // No longer need selectedFile for upload logic, UploadThing handles the file.
  // uploadedImageUrl will store the URL from UploadThing or current profile.image
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // fileInputRef is no longer needed

  useEffect(() => {
    const fetchProfile = async () => {
      if (status === 'unauthenticated') { setIsLoading(false); setError("Authentication required."); return; }
      if (status === 'loading') { return; } 
      
      setIsLoading(true); setError(null);
      try {
        const response = await fetch('/api/user/me');
        if (!response.ok) { 
            const d = await response.json().catch(() => ({ message: `Failed to load profile (${response.status})` })); 
            throw new Error(d.message || `HTTP error! ${response.status}`); 
        }
        const data = await response.json();
        if (!data.user) throw new Error("Profile data missing in API response.");
        
        const fetchedProfile: ProfileDataFromApi = data.user; 
        setProfile(fetchedProfile);
        setFormData({ 
            name: fetchedProfile.name || '', 
            location: fetchedProfile.location || '', 
            mpesaPhoneNumber: fetchedProfile.mpesaPhoneNumber || '' 
        });
        setUploadedImageUrl(null); // Reset any temporarily uploaded image URL on new fetch/edit cancel

      } catch (err: any) {
          setError(err.message); 
      } finally { 
          setIsLoading(false); 
      }
    };
    fetchProfile();
  }, [status]); 

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // handleFileChange and handleImageUpload are replaced by UploadThing's callbacks

  const handleCancel = () => {
      setFormData({ 
          name: profile?.name || '', 
          location: profile?.location || '', 
          mpesaPhoneNumber: profile?.mpesaPhoneNumber || '' 
      });
      setUploadedImageUrl(null); // Clear any pending image upload URL
      setIsEditing(false); 
      setError(null);
  };

  const handleSave = async () => {
      setIsSaving(true); setError(null);
      
      const payload: Partial<Omit<ProfileDataFromApi, 'id' | 'createdAt' | 'updatedAt' | 'nameLastUpdatedAt'> & { image?: string }> = {};
      let changesDetected = false;

      if (formData.name.trim() && formData.name !== (profile?.name ?? '')) { 
          payload.name = formData.name.trim();
          changesDetected = true;
      }
      if (formData.location !== (profile?.location ?? '')) { 
          payload.location = formData.location.trim() === '' ? null : formData.location.trim(); 
          changesDetected = true;
      }
      if (formData.mpesaPhoneNumber !== (profile?.mpesaPhoneNumber ?? '')) { 
          payload.mpesaPhoneNumber = formData.mpesaPhoneNumber.trim() === '' ? null : formData.mpesaPhoneNumber.trim();
          changesDetected = true;
      }
      // Use uploadedImageUrl from UploadThing. `profile.image` is the current persisted image.
      if (uploadedImageUrl && uploadedImageUrl !== profile?.image) {
          payload.image = uploadedImageUrl;
          changesDetected = true;
      }

      if (!changesDetected) {
           toast({ title: "No Changes", description: "No modifications detected." });
           setIsSaving(false); setIsEditing(false); return;
      }
      if (payload.name !== undefined && !payload.name) {
          setError("Name cannot be empty.");
          toast({ title: "Save Failed", description: "Name cannot be empty.", variant: "destructive" });
          setIsSaving(false); return;
      }

      console.log("Saving profile with payload:", payload);
      try {
          const response = await fetch('/api/user/me', { 
              method: 'PATCH', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify(payload) 
          });
          const result = await response.json();
          if (!response.ok) {
              const errorMsg = result.errors ? JSON.stringify(result.errors) : (result.message || `Save error! ${response.status}`);
              throw new Error(errorMsg);
          }
          
          const updatedProfile: ProfileDataFromApi = result.user;
          setProfile(updatedProfile);
          setFormData({ 
              name: updatedProfile.name || '', 
              location: updatedProfile.location || '', 
              mpesaPhoneNumber: updatedProfile.mpesaPhoneNumber || '' 
          });
          setUploadedImageUrl(null); // Clear after successful save
          setIsEditing(false);
          toast({ title: "Success", description: "Profile updated." });

          if (payload.name || payload.image) {
                await updateSession(); // Request session update from NextAuth
          }
      } catch (err: any) {
          setError(err.message);
          toast({ title: "Save Failed", description: err.message, variant: "destructive" });
      } finally { 
          setIsSaving(false); 
      }
  };

  const canEditField = (lastUpdateTimestamp: string | null | undefined): boolean => {
      if (!lastUpdateTimestamp) return true;
      try { return differenceInDays(new Date(), parseISO(lastUpdateTimestamp)) >= 60; } // 60 days
      catch { return false; }
  };
  const isNameLocked = !!(isEditing && profile?.nameLastUpdatedAt && !canEditField(profile.nameLastUpdatedAt));
  const isLocationLocked = false; // No cooldown for location in current backend logic
  const isMpesaLocked = false;  // No cooldown for Mpesa in current backend logic

  const renderSkeleton = () => ( /* ... skeleton code remains the same ... */ 
      <Card className="w-full border-none shadow-none">
          <CardHeader className="items-center">
              <Skeleton className="h-24 w-24 rounded-full mb-3" />
              <Skeleton className="h-6 w-32 mb-1" />
              <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
              <div className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-full" /></div>
          </CardContent>
      </Card>
  );

  if (status === 'loading' || (isLoading && status === 'authenticated')) return renderSkeleton();
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
  if (status === 'unauthenticated') {
       return (
            <Card className="w-full border-none shadow-none">
                 <CardContent className="p-6 text-center text-muted-foreground">
                    <p>Please <a href="/auth" className="underline font-semibold">sign in</a> to view your profile.</p>
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
  
  // Use profile.image for current persisted image. uploadedImageUrl for newly uploaded one.
  const displayImageUrl = uploadedImageUrl || profile?.image || null;
  const fallbackChar = profile?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <Card className="w-full border-none shadow-none">
      <CardHeader className="items-center text-center">
          <div className="relative mb-3">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={displayImageUrl ?? undefined} alt={profile?.name ?? "User profile picture"} />
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                </Avatar>
                 {isEditing && (
                    <div className="absolute bottom-0 right-0">
                        <UploadButton<OurFileRouter, "profilePictureUploader">
                            endpoint="profilePictureUploader"
                            onClientUploadComplete={(res) => {
                                if (res && res.length > 0) {
                                    console.log("Upload Completed:", res);
                                    setUploadedImageUrl(res[0].url);
                                    toast({ title: "Image Ready", description: "New profile picture uploaded and ready to be saved." });
                                }
                                setIsUploadingImage(false);
                            }}
                            onUploadError={(error: Error) => {
                                console.error("UploadThing Error:", error);
                                setError(`Image Upload Failed: ${error.message}`);
                                toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
                                setIsUploadingImage(false);
                            }}
                            onUploadBegin={() => {
                                console.log("Upload beginning...");
                                setIsUploadingImage(true);
                                setError(null);
                                setUploadedImageUrl(null); // Clear previous temp url
                            }}
                            appearance={{
                                button: "rounded-full h-8 w-8 p-0 bg-primary text-primary-foreground",
                                // container: "",
                                // allowedContent: "hidden"
                            }}
                            content={{
                                button({ ready, isUploading }) {
                                    if (isUploading) return <Icons.spinner className="h-4 w-4 animate-spin" />;
                                    return <Icons.edit className="h-4 w-4" />;
                                },
                                allowedContent: () => null // Effectively hides allowed content text
                            }}
                        />
                   </div>
                )}
            </div>
            {isEditing && uploadedImageUrl && (
                 <p className="text-xs text-green-600 truncate max-w-[200px]"> 
                     New image uploaded. Click Save.
                </p>
             )}

        <CardTitle>{isEditing ? 'Editing Profile' : profile?.name || 'Username Not Set'}</CardTitle>
        <CardDescription>{profile?.email || 'Email Not Set'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
         {isEditing && error && (<p className="text-sm font-medium text-destructive text-center py-2">Error: {error}</p>)}

        <div className="space-y-1">
            <Label htmlFor="profile-name">Name <span className="text-red-500">*</span></Label>
            <Input 
                id="profile-name"
                name="name" 
                value={isEditing ? formData.name : profile?.name || ''} 
                onChange={handleInputChange}
                readOnly={!isEditing || isNameLocked} 
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="Enter your full name or username"
                className={isNameLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
             {isNameLocked && (<p className="text-xs text-yellow-600">You can change your name again in {60 - differenceInDays(new Date(), parseISO(profile!.nameLastUpdatedAt!))} days.</p>)}        </div>
         <div className="space-y-1"> <Label>Email</Label><Input value={profile?.email || ''} readOnly disabled /><p className="text-xs text-muted-foreground">Email cannot be changed.</p></div>
         <div className="space-y-1"> <Label>Phone Number</Label><Input value={profile?.phoneNumber || 'Not Set'} readOnly disabled /><p className="text-xs text-muted-foreground">Contact support to change phone number.</p></div>
        
         <div className="space-y-1">
            <Label htmlFor="profile-location">Location <span className="text-muted-foreground text-xs">(Optional)</span></Label>
            <Input 
                id="profile-location" 
                name="location"
                value={isEditing ? formData.location : profile?.location || ''} 
                onChange={handleInputChange}
                readOnly={!isEditing || isLocationLocked}
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="e.g., Nairobi - Westlands" 
                 className={isLocationLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
        </div>
        
         <div className="space-y-1">
            <Label htmlFor="profile-mpesa">M-Pesa Payout Number <span className="text-muted-foreground text-xs">(Optional)</span></Label>
            <Input 
                id="profile-mpesa" 
                name="mpesaPhoneNumber"
                value={isEditing ? formData.mpesaPhoneNumber : profile?.mpesaPhoneNumber || ''} 
                onChange={handleInputChange}
                readOnly={!isEditing || isMpesaLocked}
                disabled={isSaving || (!isEditing && isLoading)} 
                placeholder="e.g., 0712345678" 
                 className={isMpesaLocked ? "border-yellow-500 focus-visible:ring-yellow-400" : ""}
            />
             <p className="text-xs text-muted-foreground">Used for receiving payouts. Optional.</p>
        </div>
        
         <div className="space-y-1"> <Label>Member Since</Label><Input value={formatDate(profile?.createdAt)} readOnly disabled /></div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            {isEditing ? (
                <>
                    <Button variant="outline" onClick={handleCancel} disabled={isSaving || isUploadingImage}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving || isUploadingImage}> 
                         {isSaving && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} 
                         {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </>
            ) : (
                <Button variant="outline" onClick={() => { setIsEditing(true); setError(null); }} disabled={isLoading}>Edit Profile</Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
