
import { Prisma } from "@prisma/client";

// Enums mirroring Prisma enums for use in client-side logic
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum ItemStatus {
  AVAILABLE = 'AVAILABLE',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID_ESCROW = 'PAID_ESCROW',
  SOLD = 'SOLD',
  DELISTED = 'DELISTED',
  DISPUTED = 'DISPUTED'
}

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  SUCCESSFUL_ESCROW = 'SUCCESSFUL_ESCROW',
  RELEASED_TO_SELLER = 'RELEASED_TO_SELLER',
  REFUNDED_TO_BUYER = 'REFUNDED_TO_BUYER',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED'
}

// --- Model-based Types ---

export type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: UserRole;
  // Add other fields from your User model as needed
};

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: Date | null;
  role: UserRole;
  createdAt: Date;
  location: string | null;
  mpesaPhoneNumber: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  kycVerified: boolean;
};


export type Item = {
  id: string;
  sellerId: string;
  seller?: Partial<User>; // Seller info might not always be populated
  title: string;
  description: string;
  price: Prisma.Decimal;
  category: string;
  location?: string | null;
  quantity: number;
  status: ItemStatus;
  mediaUrls?: string[];
  offersDelivery: boolean;
  acceptsInstallments: boolean;
  discountPercentage?: number | null;
  createdAt: Date;
  updatedAt: Date;
  condition: string;
  // Add other item fields as needed
};

export type Payment = {
  id: string;
  itemId: string;
  itemTitle?: string | null;
  buyerId: string;
  sellerId: string;
  amount: Prisma.Decimal;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  itemDetails?: Partial<Item>; // Optional item details for display
  // Add other payment fields as needed
};

export type Order = {
    id: string;
    buyerId: string;
    sellerId: string;
    itemId: string;
    itemTitle: string;
    amount: Prisma.Decimal;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    itemDetails: {
        id: string;
        title: string;
        mediaUrls: string[];
        seller: { id: string; name: string };
    } | null;
}

export type DisputeRecord = {
  id: string;
  reason: string;
  status: string;
  createdAt: Date;
  item: {
    id: string;
    title: string;
    mediaUrls: string[];
  };
  payment: {
    id: string;
    amount: Prisma.Decimal;
  };
  filedByUser: {
    id: string;
    name: string | null;
  };
  otherPartyUser: {
    id: string;
    name: string | null;
  };
};
