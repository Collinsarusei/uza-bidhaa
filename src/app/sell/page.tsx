'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { Progress } from "@/components/ui/progress";

const categories = [
    "Electronics", "Mobile Phones", "Laptops & Computers", "TVs & Audio",
    "Home Appliances", "Furniture", "Home & Garden",
    "Fashion & Clothing", "Shoes", "Bags & Accessories", "Jewelry & Watches",
    "Health & Beauty",
    "Vehicles", "Cars", "Motorcycles", "Vehicle Parts",
    "Property", "For Rent", "For Sale", "Land & Plots",
    "Services", "Business Services", "Repair Services", "Events Services",
    "Jobs",
    "Babies & Kids", "Toys", "Kids Clothing",
    "Pets", "Pet Supplies",
    "Books, Sports & Hobbies",
    "Food & Agriculture",
    "Other"
];

const kenyanLocations = [
    "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret",
    "Ruiru", "Kikuyu", "Kangundo-Tala", "Malindi", "Naivasha",
    "Kitui", "Machakos", "Thika", "Athi River", "Karuri",
    "Nyeri", "Kitale", "Kericho", "Kisii", "Garissa",
    "Kakamega", "Bungoma", "Meru", "Kilifi", "Wajir",
    "Mandera", "Embu", "Migori", "Homa Bay", "Isiolo",
    "Nyahururu", "Lamu", "Nanyuki", "Narok", "Voi",
    "Mumias", "Webuye", "Maralal", "Gilgil", "Molo",
];

export default function SellPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  // --- Form State --- 
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [acceptsInstallments, setAcceptsInstallments] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [mediaFiles, setMediaFiles] = useState<FileList | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch Profile Location
  useEffect(() => {
      const fetchProfileLocation = async () => {
          if (status === 'authenticated') {
              setIsFetchingProfile(true);
              try {
                  const response = await fetch('/api/user/me');
                  if (response.ok) {
                      const data = await response.json();
                      const userLocation = data.user?.location;
                      if (userLocation && typeof userLocation === 'string') {
                          const parts = userLocation.split(' - ');
                          if (parts.length === 2 && kenyanLocations.includes(parts[0])) {
                              setLocation(parts[0]); setSpecificLocation(parts[1]);
                          } else if (kenyanLocations.includes(userLocation)) {
                              setLocation(userLocation); setSpecificLocation('');
                          }
                      }
                  } else { console.warn("Failed to fetch profile location"); }
              } catch (error) { console.error("Error fetching profile location:", error); }
              finally { setIsFetchingProfile(false); }
          } else if (status === 'unauthenticated') { setIsFetchingProfile(false); }
      };
      fetchProfileLocation();
  }, [status]);

  // Handle File Change and Create Previews
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setMediaFiles(files);
    previewUrls.forEach(url => URL.revokeObjectURL(url)); setPreviewUrls([]);
    if (files) { setPreviewUrls(Array.from(files).map(file => URL.createObjectURL(file))); }
  };

  // Clean up object URLs
   useEffect(() => {
       return () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); };
   }, [previewUrls]);

  // Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setServerError(null);
    setUploadProgress(null);

    // 1. Validation
    if (!title || !description || !category || !price || !location || !specificLocation.trim()) {
        let missing = [];
        if (!title) missing.push("Title");
        if (!description) missing.push("Description");
        if (!category) missing.push("Category");
        if (!price) missing.push("Price");
        if (!location) missing.push("City/Major Town");
        if (!specificLocation.trim()) missing.push("Specific Location/Area");
        toast({ title: "Missing Required Fields", description: `Please provide: ${missing.join(', ')}.`, variant: "destructive" });
        setIsLoading(false); return;
    }
    if (!mediaFiles || mediaFiles.length === 0) {
      toast({ title: "Missing Media", description: "Please select at least one photo or video.", variant: "destructive" });
      setIsLoading(false); return;
    }

    // 2. Upload Files
    let uploadedMediaUrls: string[] = [];
    try {
        setUploadProgress(0); 
        const formData = new FormData();
        Array.from(mediaFiles).forEach(file => { formData.append('files', file); });

        // --- Removed Simulated Progress --- 
        // await new Promise(resolve => setTimeout(resolve, 300)); setUploadProgress(30); 

        console.log("Uploading files..."); // Log before fetch
        const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
        console.log("Upload fetch completed. Status:", uploadResponse.status); // Log after fetch
        
        // --- Removed Simulated Progress --- 
        // await new Promise(resolve => setTimeout(resolve, 700)); setUploadProgress(100);
        // await new Promise(resolve => setTimeout(resolve, 200)); // Short delay after 100%

        // Still set progress to 100 if fetch is OK, before processing result
        if (uploadResponse.ok) {
            setUploadProgress(100);
        }

        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) { throw new Error(uploadResult.message || `Upload failed: ${uploadResponse.statusText}`); }
        if (!uploadResult.urls || uploadResult.urls.length === 0) { throw new Error("Upload succeeded but no URLs returned."); }
        uploadedMediaUrls = uploadResult.urls;
        console.log("Files uploaded:", uploadedMediaUrls);
        setUploadProgress(null); // Clear progress after success

    } catch (uploadError: any) {
        console.error("File upload error:", uploadError);
        setServerError(`Upload Failed: ${uploadError.message}`);
        toast({ title: "Upload Failed", description: uploadError.message, variant: "destructive" });
        setIsLoading(false); setUploadProgress(null); return; 
    }

    // 3. Create Item with Real URLs
    const combinedLocation = `${location} - ${specificLocation.trim()}`;
    const itemData = {
      title, description, category,
      price: parseFloat(price) || 0, location: combinedLocation,
      offersDelivery, acceptsInstallments,
      discountPercentage: discountPercentage ? parseInt(discountPercentage) : undefined,
      mediaUrls: uploadedMediaUrls, // Use REAL URLs
    };

    console.log("Submitting item data:", itemData);
    try {
      const response = await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itemData) });
      const responseData = await response.json();
      if (!response.ok) { throw new Error(responseData.message || `HTTP error! ${response.status}`); }
      toast({ title: "Success!", description: "Item listed successfully." });
      router.push('/dashboard'); // Redirect after success
    } catch (error) {
      console.error("Submit item error:", error);
      let msg = error instanceof Error ? error.message : "Listing creation failed.";
      setServerError(msg); toast({ title: "Listing Failed", description: msg, variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  // --- Loading/Auth States --- 
  if (status === 'loading' || isFetchingProfile) {
       return (
           <div className="flex justify-center items-center min-h-screen">
               <Icons.spinner className="h-10 w-10 animate-spin text-primary" />
           </div>
       );
  }
   if (status === 'unauthenticated') {
        router.replace('/auth'); 
        return null; 
    }
  // -------------------------

  // --- Component Render --- 
  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <Card className="w-full max-w-2xl shadow-lg dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">List a New Item</CardTitle>
          <CardDescription>Fill in the details below to put your item up for sale.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-5">
            
            {/* --- Input Fields --- */}
            <div className="grid gap-1.5">
              <Label htmlFor="title">Item Title <span className="text-red-500">*</span></Label>
              <Input id="title" placeholder="e.g., Gently Used Sofa Set" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isLoading} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
              <Textarea id="description" placeholder="Describe condition, features, dimensions..." value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isLoading} rows={4} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="category-select">Category <span className="text-red-500">*</span></Label>
              <Select value={category} onValueChange={(value) => setCategory(value)} required disabled={isLoading}>
                  <SelectTrigger id="category-select" className="w-full"><SelectValue placeholder="Select a category..." /></SelectTrigger>
                  <SelectContent>{categories.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price (KES) <span className="text-red-500">*</span></Label>
              <Input id="price" type="number" placeholder="e.g., 15000" value={price} onChange={(e) => setPrice(e.target.value)} required min="0" step="any" disabled={isLoading} />
            </div>
            <div className="grid gap-1.5">
                <Label htmlFor="location-select">City / Major Town <span className="text-red-500">*</span></Label>
                <Select value={location} onValueChange={(value) => setLocation(value)} required disabled={isLoading}>
                    <SelectTrigger id="location-select" className="w-full"><SelectValue placeholder="Select city or major town..." /></SelectTrigger>
                    <SelectContent>{kenyanLocations.map((loc) => (<SelectItem key={loc} value={loc}>{loc}</SelectItem>))}</SelectContent>
                </Select>
            </div>
             <div className="grid gap-1.5">
                <Label htmlFor="specific-location">Specific Location / Area <span className="text-red-500">*</span></Label>
                <Input id="specific-location" placeholder="e.g., Roysambu, CBD" value={specificLocation} onChange={(e) => setSpecificLocation(e.target.value)} required disabled={isLoading} />
                <p className="text-xs text-muted-foreground">Neighborhood, estate, or area within the selected city.</p>
             </div>
             {/* --- End Input Fields --- */}

            {/* --- Media Upload Section --- */} 
            <div className="grid gap-1.5 pt-4 border-t">
              <Label htmlFor="media">Photos / Videos <span className="text-red-500">*</span></Label>
              <Input
                id="media"
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileChange}
                disabled={isLoading}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
              <p className="text-xs text-muted-foreground">Max 5 files, 10MB each. Select at least one.</p>
              {/* Upload Progress */}
              {uploadProgress !== null && (
                  <div className="space-y-1 pt-2">
                      <Label className="text-sm font-medium">Upload Progress</Label>
                      <Progress value={uploadProgress} className="w-full h-2" />
                      {/* Show percentage only briefly at 100% before clearing */}
                      {/* <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p> */}
                  </div>
              )}
               {/* Previews */}
              {previewUrls.length > 0 && (
                 <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                     {previewUrls.map((url, index) => (
                         <div key={index} className="relative aspect-square overflow-hidden rounded-md border bg-secondary">
                             {mediaFiles && mediaFiles[index]?.type.startsWith('image/') ? (
                                 <img src={url} alt={`Preview ${index + 1}`} className="absolute inset-0 h-full w-full object-cover object-center" />
                             ) : (
                                 <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Icons.file className="h-6 w-6" /></div>
                             )}
                         </div>
                     ))}
                  </div>
              )}
            </div>
            {/* --- End Media Upload --- */}

            {/* --- Optional Details --- */}
             <div className="border-t pt-4 mt-2">
                 <Label className="text-base font-semibold">Optional Details</Label>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mt-3">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="offersDelivery" checked={offersDelivery} onCheckedChange={(checked) => setOffersDelivery(checked as boolean)} disabled={isLoading} />
                        <Label htmlFor="offersDelivery" className="text-sm font-medium leading-none">Offers Delivery?</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="acceptsInstallments" checked={acceptsInstallments} onCheckedChange={(checked) => setAcceptsInstallments(checked as boolean)} disabled={isLoading} />
                        <Label htmlFor="acceptsInstallments" className="text-sm font-medium leading-none">Accepts Installments?</Label>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="discountPercentage">Discount (%)</Label>
                        <Input id="discountPercentage" type="number" placeholder="e.g., 10" value={discountPercentage} onChange={(e) => setDiscountPercentage(e.target.value)} min="0" max="100" disabled={isLoading} />
                    </div>
                </div>
             </div>
             {/* --- End Optional Details --- */} 

             {/* Display Server Error */}
             {serverError && (<p className="text-sm font-medium text-destructive text-center">{serverError}</p>)}

          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
                 {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                 {uploadProgress !== null ? 'Uploading...' : isLoading ? 'Submitting... ' : 'List Item Now'}
             </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}