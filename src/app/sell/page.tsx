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

import { useUploadThing } from "@/lib/uploadthing"; // Changed import to use helper
import type { OurFileRouter } from "@/app/api/uploadthing/core"; 

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [acceptsInstallments, setAcceptsInstallments] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState("");
  
  const [mediaFiles, setMediaFiles] = useState<File[]>([]); 
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  
  const [isSubmittingForm, setIsSubmittingForm] = useState(false); 
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null); 
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { startUpload, isUploading: isUploadThingUploading } = useUploadThing(
    "mediaUploader", 
    {
      onClientUploadComplete: (res) => {
        console.log("UploadThing: All files uploaded client-side:", res);
        setUploadProgress(100);
        setIsUploading(false);
      },
      onUploadError: (error: Error) => {
        console.error("UploadThing: onUploadError callback", error);
        setServerError(`Upload Failed: ${error.message}`);
        toast({ 
          title: "Upload Failed", 
          description: error.message, 
          variant: "destructive",
          duration: 5000 // Show for 5 seconds
        });
        setIsSubmittingForm(false);
        setIsUploading(false);
        setUploadProgress(null);
      },
      onUploadProgress: (progress) => {
        setUploadProgress(progress);
      },
      onUploadBegin: (fileName) => {
        console.log("UploadThing: Upload starting for:", fileName);
        setUploadProgress(0);
        setServerError(null);
        setIsUploading(true);
      }
    }
  );

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = e.target.files;
    if (newFiles) {
        const newFileArray = Array.from(newFiles);
        // You might want to limit the number of files here based on `maxFileCount` in your UploadThing config
        // For example, if maxFileCount is 5 for mediaUploader:
         if (newFileArray.length > 5) {
             toast({ title: "Too many files", description: "You can upload a maximum of 5 files.", variant: "destructive" });
             return;
        }
        setMediaFiles(newFileArray); 

        previewUrls.forEach(url => URL.revokeObjectURL(url));
        setPreviewUrls(newFileArray.map(file => URL.createObjectURL(file)));
    } else {
        setMediaFiles([]);
        previewUrls.forEach(url => URL.revokeObjectURL(url));
        setPreviewUrls([]);
    }
    // Clear the input value to allow re-selecting the same file(s) if needed
    if (e.target) {
        e.target.value = '';
    }
  };

  const handleRemoveFile = (indexToRemove: number) => {
    if (previewUrls[indexToRemove]) {
        URL.revokeObjectURL(previewUrls[indexToRemove]);
    }
    setMediaFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    setPreviewUrls(prevUrls => prevUrls.filter((_, index) => index !== indexToRemove));
  };

   useEffect(() => {
       return () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); };
   }, [previewUrls]); // Dependency array ensures cleanup when component unmounts or previewUrls changes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingForm(true);
    setServerError(null);

    // Validate required fields
    const requiredFields = {
      title: "Title",
      description: "Description",
      category: "Category",
      price: "Price",
      quantity: "Quantity",
      location: "City/Major Town",
      specificLocation: "Specific Location/Area"
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key]) => {
        const value = key === 'specificLocation' ? specificLocation.trim() : eval(key);
        return !value;
      })
      .map(([_, label]) => label);

    if (missingFields.length > 0) {
      toast({ 
        title: "Missing Required Fields", 
        description: `Please provide: ${missingFields.join(', ')}.`, 
        variant: "destructive",
        duration: 5000
      });
      setIsSubmittingForm(false);
      return;
    }

    if (parseInt(quantity) <= 0) {
      toast({ 
        title: "Invalid Quantity", 
        description: "Quantity must be at least 1.", 
        variant: "destructive",
        duration: 5000
      });
      setIsSubmittingForm(false);
      return;
    }

    if (mediaFiles.length === 0) {
      toast({ 
        title: "Missing Media", 
        description: "Please select at least one photo or video.", 
        variant: "destructive",
        duration: 5000
      });
      setIsSubmittingForm(false);
      return;
    }

    let uploadedMediaUrls: string[] = [];
    if (mediaFiles.length > 0) {
      try {
        console.log("Starting file upload with UploadThing for", mediaFiles.length, "files...");
        const uploadResults = await startUpload(mediaFiles);

        if (!uploadResults || uploadResults.length !== mediaFiles.length) {
          throw new Error("Some files may not have uploaded successfully or no URLs were returned.");
        }
        uploadedMediaUrls = uploadResults.map(file => file.url);
      } catch (uploadError: any) {
        console.error("UploadThing startUpload error block:", uploadError);
        setServerError(`Upload Failed: ${uploadError.message || 'An unexpected error occurred during upload.'}`);
        toast({ 
          title: "Upload Failed", 
          description: uploadError.message || 'Please try again.', 
          variant: "destructive",
          duration: 5000
        });
        setIsSubmittingForm(false);
        setUploadProgress(null);
        return;
      }
    }

    const combinedLocation = `${location} - ${specificLocation.trim()}`;
    const itemData = {
      title,
      description,
      category,
      price: parseFloat(price) || 0,
      quantity: parseInt(quantity) || 1,
      location: combinedLocation,
      offersDelivery,
      acceptsInstallments,
      discountPercentage: discountPercentage ? parseFloat(discountPercentage) : null,
      mediaUrls: uploadedMediaUrls,
    };

    console.log("Submitting item data to /api/items:", itemData);
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.message || `HTTP error! ${response.status}`);
      }
      
      toast({ 
        title: "Success!", 
        description: "Item listed successfully.",
        duration: 3000
      });
      router.push(`/item/${responseData.id}`);
    } catch (error: any) {
      console.error("Submit item error:", error);
      setServerError(error.message || "Listing creation failed.");
      toast({ 
        title: "Listing Failed", 
        description: error.message || "Please try again.", 
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsSubmittingForm(false);
      setUploadProgress(null);
    }
  };

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

  const currentCombinedLoadingState = isSubmittingForm || isUploadThingUploading;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">List an Item for Sale</CardTitle>
          <CardDescription className="text-center">
            Fill out the form below to list your item. All fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a descriptive title"
                className="w-full"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item in detail"
                className="w-full min-h-[100px]"
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={category} onValueChange={setCategory} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price and Quantity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price (KES) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Enter price"
                  className="w-full"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="w-full"
                  required
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">City/Major Town *</Label>
              <Select value={location} onValueChange={setLocation} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a city" />
                </SelectTrigger>
                <SelectContent>
                  {kenyanLocations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specific Location */}
            <div className="space-y-2">
              <Label htmlFor="specificLocation">Specific Location/Area *</Label>
              <Input
                id="specificLocation"
                value={specificLocation}
                onChange={(e) => setSpecificLocation(e.target.value)}
                placeholder="Enter specific location or area"
                className="w-full"
                required
              />
            </div>

            {/* Media Upload */}
            <div className="space-y-2">
              <Label>Photos/Videos *</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {previewUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={url}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <Icons.x className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <label className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-gray-400">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="text-center">
                    <Icons.plus className="h-8 w-8 mx-auto text-gray-400" />
                    <span className="text-sm text-gray-500">Add Media</span>
                  </div>
                </label>
              </div>
              {uploadProgress !== null && (
                <div className="mt-2">
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-sm text-gray-500 mt-1">
                    Uploading... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
            </div>

            {/* Additional Options */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="offersDelivery"
                  checked={offersDelivery}
                  onCheckedChange={(checked) => setOffersDelivery(checked as boolean)}
                />
                <Label htmlFor="offersDelivery">I offer delivery for this item</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="acceptsInstallments"
                  checked={acceptsInstallments}
                  onCheckedChange={(checked) => setAcceptsInstallments(checked as boolean)}
                />
                <Label htmlFor="acceptsInstallments">I accept installment payments</Label>
              </div>
            </div>

            {/* Discount Percentage */}
            <div className="space-y-2">
              <Label htmlFor="discountPercentage">Discount Percentage (Optional)</Label>
              <Input
                id="discountPercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(e.target.value)}
                placeholder="Enter discount percentage"
                className="w-full"
              />
            </div>

            {/* Error Display */}
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                {serverError}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmittingForm || isUploading}
            >
              {isSubmittingForm || isUploading ? (
                <>
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  {isUploading ? "Uploading..." : "Creating Listing..."}
                </>
              ) : (
                "Create Listing"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
