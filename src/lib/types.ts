export interface UserProfile {
  id: string; // Or number, depending on your DB
  username: string;
  email: string;
  phoneNumber: string;
  location?: string;
  profilePictureUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Item {
  id: string; // Or number
  sellerId: string; // Foreign key to UserProfile
  title: string;
  description: string;
  category: string; // Consider using an enum or separate Category table later
  price: number;
  location: string;
  offersDelivery: boolean;
  acceptsInstallments: boolean;
  discountPercentage?: number; // Optional discount
  mediaUrls: string[]; // Array of URLs for photos/videos
  status: 'available' | 'pending' | 'sold'; // Status of the listing
  createdAt: Date;
  updatedAt: Date;
}
