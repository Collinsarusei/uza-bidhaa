'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
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
// --- Import Select components ---
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// --------------------------------
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";

// --- Define Options ---
// (Customize these lists according to your marketplace needs)
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
    "Nyeri", "Machakos", "Meru", "Kisii", "Kakamega",
    "Thika", "Malindi", "Kitale", "Garissa", "Kericho", "Naivasha",
    "Kiambu", "Isiolo", "Lamu", "Narok", "Voi", "Embu", "Kitui",
    "Bungoma", "Homa Bay", "Migori", "Busia", "Nanyuki",
    // Consider adding "Countywide" options or sub-locations if needed
    "Other Location (Specify)" // Optional: Keep an "Other" if you need manual input sometimes
];
// ----------------------


export default function SellPage() {
  const router = useRouter();
  const { toast } = useToast();

  // --- Form State ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(""); // State remains string
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState(""); // State remains string
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [acceptsInstallments, setAcceptsInstallments] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [mediaFiles, setMediaFiles] = useState<FileList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMediaFiles(e.target.files);
  };

  // --- Handle Submit (No changes needed here for Select) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setServerError(null);

    if (!title || !description || !category || !price || !location || location === "Other Location (Specify)") {
         let missing = [];
         if (!title) missing.push("Title");
         if (!description) missing.push("Description");
         if (!category) missing.push("Category");
         if (!price) missing.push("Price");
         if (!location || location === "Other Location (Specify)") missing.push("Location");
         toast({ title: "Missing Required Fields", description: `Please provide: ${missing.join(', ')}.`, variant: "destructive" });
         setIsLoading(false);
         return;
    }
    if (!mediaFiles || mediaFiles.length === 0) {
      toast({ title: "Missing Media", description: "Please select at least one photo or video.", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    // Upload logic placeholder (remains the same)
    const uploadedMediaUrls = Array.from(mediaFiles).map((_, i) => `mock/item-media-${Date.now()}-${i}.jpg`);

    const itemData = {
      title,
      description,
      category, // Category state already holds the selected string value
      price: parseFloat(price) || 0,
      location, // Location state already holds the selected string value
      offersDelivery,
      acceptsInstallments,
      discountPercentage: discountPercentage ? Math.max(0, Math.min(100, parseInt(discountPercentage))) : undefined,
      mediaUrls: uploadedMediaUrls,
    };

    console.log("Submitting item data:", itemData);

    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || `HTTP error! status: ${response.status}`);
      }
      console.log("Item created successfully:", responseData);
      toast({ title: "Success!", description: "Your item has been listed successfully." });
      router.push('/dashboard');
    } catch (error) {
      console.error("Failed to submit item:", error);
      let errorMessage = "Failed to list item. Please try again later.";
      if (error instanceof Error) { errorMessage = error.message; }
      setServerError(errorMessage);
      toast({ title: "Listing Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Component Render ---
  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <Card className="w-full max-w-2xl shadow-lg dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">List a New Item</CardTitle>
          <CardDescription>
            Fill in the details below to put your item up for sale on the marketplace.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="grid gap-5">
            {/* Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="title">Item Title <span className="text-red-500">*</span></Label>
              <Input id="title" placeholder="e.g., Gently Used Sofa Set" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isLoading} />
            </div>
             {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
              <Textarea id="description" placeholder="Describe condition, features, dimensions..." value={description} onChange={(e) => setDescription(e.target.value)} required disabled={isLoading} rows={4} />
            </div>

            {/* --- Category Dropdown --- */}
            <div className="grid gap-1.5">
              <Label htmlFor="category-select">Category <span className="text-red-500">*</span></Label>
              <Select
                  // The 'value' prop controls the displayed value
                  value={category}
                  // The 'onValueChange' prop updates the state when an item is selected
                  onValueChange={(value) => setCategory(value)}
                  required // Native required might not work directly, validation handled in submit
                  disabled={isLoading}
              >
                  <SelectTrigger id="category-select" className="w-full">
                      {/* Shows the selected value or the placeholder */}
                      <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                      {/* Map over the categories array to create SelectItem components */}
                      {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                              {cat}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>
            {/* ------------------------- */}

             {/* Price */}
            <div className="grid gap-1.5">
              <Label htmlFor="price">Price (KES) <span className="text-red-500">*</span></Label>
              <Input id="price" type="number" placeholder="e.g., 15000" value={price} onChange={(e) => setPrice(e.target.value)} required min="0" step="any" disabled={isLoading} />
            </div>

            {/* --- Location Dropdown --- */}
            <div className="grid gap-1.5">
                <Label htmlFor="location-select">Item Location <span className="text-red-500">*</span></Label>
                <Select
                    value={location}
                    onValueChange={(value) => setLocation(value)}
                    required
                    disabled={isLoading}
                >
                    <SelectTrigger id="location-select" className="w-full">
                        <SelectValue placeholder="Select item location..." />
                    </SelectTrigger>
                    <SelectContent>
                        {kenyanLocations.map((loc) => (
                            <SelectItem key={loc} value={loc}>
                                {loc}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {/* Optional: Show an input if 'Other' is selected */}
                {/* {location === "Other Location (Specify)" && (
                     <Input
                        className="mt-2"
                        placeholder="Please specify location"
                        // Add state and onChange handler for this specific input if needed
                        disabled={isLoading}
                     />
                )} */}
            </div>
            {/* ----------------------- */}


            {/* File Input for Media */}
            <div className="grid gap-1.5">
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
              <p className="text-xs text-muted-foreground">
                High-quality images/videos increase interest. Select at least one.
              </p>
              {mediaFiles && mediaFiles.length > 0 && (
                 <div className="text-sm text-muted-foreground mt-1 border p-2 rounded-md bg-secondary/50">
                    <span className="font-medium">Selected:</span> {Array.from(mediaFiles).map(f => f.name).join(', ')}
                 </div>
              )}
            </div>

            {/* Options Section */}
             <div className="border-t pt-4 mt-2">
                 <Label className="text-base font-semibold">Optional Details</Label>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mt-3">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="offersDelivery" checked={offersDelivery} onCheckedChange={(checked) => setOffersDelivery(checked as boolean)} disabled={isLoading} />
                        <Label htmlFor="offersDelivery" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Offers Delivery?</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="acceptsInstallments" checked={acceptsInstallments} onCheckedChange={(checked) => setAcceptsInstallments(checked as boolean)} disabled={isLoading} />
                        <Label htmlFor="acceptsInstallments" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Accepts Installments?</Label>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="discountPercentage">Discount (%)</Label>
                        <Input id="discountPercentage" type="number" placeholder="e.g., 10" value={discountPercentage} onChange={(e) => setDiscountPercentage(e.target.value)} min="0" max="100" disabled={isLoading} />
                    </div>
                </div>
             </div>

             {/* Display Server Error */}
             {serverError && (
                <p className="text-sm font-medium text-destructive text-center">{serverError}</p>
             )}

          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && (
                 <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isLoading ? "Submitting Listing..." : "List Item Now"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}