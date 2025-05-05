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
import { UserProfile as BaseUserProfile } from "@/lib/types"; // Keep for reference if needed elsewhere
import { format, differenceInDays, parseISO } from 'date-fns';

// Interface for data received from the /api/user/me endpoint
// Defined independently based on actual API response structure
interface ProfileDataFromApi {
  id: string; // Ensure id is always present
  name: string | null; // Directly defined based on API
  email: string | null;
  phoneNumber: string | null;
  location: string | null;
  profilePictureUrl: string | null;
  mpesaPhoneNumber: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  nameLastUpdatedAt?: string | null; // Keep as optional
  locationLastUpdatedAt?: string | null; // Keep as optional
  mpesaLastUpdatedAt?: string | null; // Keep as optional
}

// Interface for the form state
interface ProfileFormData {
    name: string; // Keep as string for the input value
    location: string;
    mpesaPhoneNumber: string;
}

export function ProfileContent() {
  const { data: session, status, update: updateSession } = useSession();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileDataFromApi | null>(null); // State uses the corrected interface
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({ name: '', location: '', mpesaPhoneNumber: '' });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (status === 'unauthenticated') { setIsLoading(false); setError("Authentication required to view profile."); return; }
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
        
        // Type assertion here ensures the fetched data matches our interface
        const fetchedProfile: ProfileDataFromApi = data.user; 
        setProfile(fetchedProfile);
        
        setFormData({ 
            name: fetchedProfile.name || '', // Handle null from API
            location: fetchedProfile.location || '', 
            mpesaPhoneNumber: fetchedProfile.mpesaPhoneNumber || '' 
        });
        setUploadedImageUrl(null); 
        setSelectedFile(null);

      } catch (err: any) {
          console.error("Fetch Profile Error:", err);
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            console.log("File selected:", file.name);
            setSelectedFile(file);
            setUploadedImageUrl(null);
            handleImageUpload(file); 
        }
    };

   const handleImageUpload = async (fileToUpload: File) => {
        if (!fileToUpload) return;
        setIsUploadingImage(true);
        setError(null);
        const uploadFormData = new FormData();
        uploadFormData.append('files', fileToUpload);

        try {
            console.log("Uploading profile picture...");
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: uploadFormData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Image upload failed: ${response.statusText}`);
            }
            if (!result.urls || result.urls.length === 0) {
                 throw new Error("Image URL missing in upload response.");
            }
            const imageUrl = result.urls[0];
            console.log("Image uploaded successfully:", imageUrl);
            setUploadedImageUrl(imageUrl);
            toast({ title: "Image Uploaded", description: "Ready to save with profile." });
        } catch (err: any) {
            console.error("Image Upload Error:", err);
            setError(`Image Upload Failed: ${err.message}`);
            toast({ title: "Image Upload Failed", description: err.message, variant: "destructive" });
            setSelectedFile(null);
            setUploadedImageUrl(null);
        } finally {
            setIsUploadingImage(false);
        }
    };

  const handleCancel = () => {
      setFormData({ 
          name: profile?.name || '', 
          location: profile?.location || '', 
          mpesaPhoneNumber: profile?.mpesaPhoneNumber || '' 
      });
      setSelectedFile(null);
      setUploadedImageUrl(null);
      setIsEditing(false); 
      setError(null);
  };

  const handleSave = async () => {
      setIsSaving(true); setError(null);
      
      const payload: Partial<ProfileDataFromApi> = {}; // Use Partial for the update payload
      let changesDetected = false;

      // Compare and add changed fields
      // Use profile?.name which can be null, compare with formData.name (string)
      if (formData.name.trim() && formData.name !== (profile?.name ?? '')) { 
          payload.name = formData.name.trim();
          changesDetected = true;
      }
      if (formData.location !== (profile?.location ?? '')) { 
          payload.location = formData.location.trim(); 
          changesDetected = true;
      }
      if (formData.mpesaPhoneNumber !== (profile?.mpesaPhoneNumber ?? '')) { 
          payload.mpesaPhoneNumber = formData.mpesaPhoneNumber.trim();
          changesDetected = true;
      }
      if (uploadedImageUrl && uploadedImageUrl !== (profile?.profilePictureUrl ?? null)) {
          payload.profilePictureUrl = uploadedImageUrl;
          changesDetected = true;
      }

      if (!changesDetected) {
           toast({ title: "No Changes", description: "No modifications detected to save." });
           setIsSaving(false);
           setIsEditing(false);
           return;
      }
      if (payload.name !== undefined && !payload.name) {
          setError("Name cannot be empty.");
          toast({ title: "Save Failed", description: "Name cannot be empty.", variant: "destructive" });
          setIsSaving(false);
          return;
      }

      console.log("Sending PATCH request to /api/user/me with payload:", payload);

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
          
          console.log("Profile updated successfully, API response:", result.user);
          const updatedProfile: ProfileDataFromApi = result.user;
          setProfile(updatedProfile);
          setFormData({ 
              name: updatedProfile.name || '', 
              location: updatedProfile.location || '', 
              mpesaPhoneNumber: updatedProfile.mpesaPhoneNumber || '' 
          });
          setSelectedFile(null); 
          setUploadedImageUrl(null); 
          setIsEditing(false);
          toast({ title: "Success", description: "Profile updated." });

          if (payload.name || payload.profilePictureUrl) {
               console.log("Updating session...");
                await updateSession({ 
                   ...session, 
                   user: { 
                       ...session?.user,
                       name: updatedProfile.name || session?.user?.name, 
                       image: updatedProfile.profilePictureUrl || session?.user?.image 
                    } 
               });
                console.log("Session updated.");
          }

      } catch (err: any) {
          console.error("Save Profile Error:", err);
          setError(err.message);
          toast({ title: "Save Failed", description: err.message, variant: "destructive" });
      } finally { 
          setIsSaving(false); 
      }
  };

  const canEditField = (lastUpdateTimestamp: string | null | undefined): boolean => {
      if (!lastUpdateTimestamp) return true;
      try { return differenceInDays(new Date(), parseISO(lastUpdateTimestamp)) >= 60; }
      catch (e) { console.error("Error parsing date for cooldown:", e); return false; }
  };
  const isNameLocked = !!(isEditing && profile?.nameLastUpdatedAt && !canEditField(profile.nameLastUpdatedAt));
  const isLocationLocked = false; 
  const isMpesaLocked = false;  

  const renderSkeleton = () => (
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
  
  const currentProfileImageUrl = uploadedImageUrl || profile?.profilePictureUrl || null;
  const fallbackChar = profile?.name?.charAt(0)?.toUpperCase() || 'U';

  return (
    <Card className="w-full border-none shadow-none">
      <CardHeader className="items-center text-center">
          <div className="relative mb-3">
                <Avatar className="h-24 w-24">
                    <AvatarImage src={currentProfileImageUrl ?? undefined} alt={profile?.name ?? "User profile picture"} />
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                </Avatar>
                 {isEditing && (
                    <div className="absolute bottom-0 right-0">
                       <input 
                           type="file" 
                           ref={fileInputRef} 
                           onChange={handleFileChange} 
                           accept="image/png, image/jpeg, image/webp" 
                           className="hidden" 
                           id="profile-picture-upload"
                       />
                        <Button 
                            type="button"
                            size="icon" 
                            className="rounded-full h-8 w-8" 
                            onClick={() => fileInputRef.current?.click()} 
                            disabled={isUploadingImage || isSaving}
                            title="Upload new profile picture"
                        >
                            {isUploadingImage ? <Icons.spinner className="h-4 w-4 animate-spin"/> : <Icons.edit className="h-4 w-4"/>}
                        </Button>
                   </div>
                )}
            </div>
            {isEditing && selectedFile && (
                 <p className="text-xs text-muted-foreground truncate max-w-[200px]"> 
                     {isUploadingImage ? `Uploading: ${selectedFile.name}` : uploadedImageUrl ? `Uploaded: ${selectedFile.name}` : `Selected: ${selectedFile.name}`}
                </p>
             )}

        <CardTitle>{isEditing ? 'Editing Profile' : profile?.name || 'Username Not Set'}</CardTitle>
        <CardDescription>{profile?.email || 'Email Not Set'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
         {isEditing && error && (<p className="text-sm font-medium text-destructive text-center">{error}</p>)}

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
             {isNameLocked && (<p className="text-xs text-yellow-600">You can change your name again after 60 days from the last update.</p>)}
        </div>
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
