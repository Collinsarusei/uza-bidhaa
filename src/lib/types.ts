import { Timestamp } from 'firebase-admin/firestore';

export interface UserProfile {
  name: string;
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  location?: string;
  profilePictureUrl?: string;
  mpesaPhoneNumber?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  // Timestamps for specific field updates
  usernameLastUpdatedAt?: Timestamp | Date;
  locationLastUpdatedAt?: Timestamp | Date;
  mpesaLastUpdatedAt?: Timestamp | Date;
}

export interface Item {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  location: string;
  offersDelivery: boolean;
  acceptsInstallments: boolean;
  discountPercentage?: number;
  mediaUrls: string[];
  status: 'available' | 'pending' | 'paid_escrow' | 'sold' | 'cancelled';
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Notification {
  isRead: any;
  id: string;
  userId: string;
  type: 'new_message' | 'item_listed' | 'payment_received' | 'payment_released' | 'unusual_activity' | 'item_sold' | 'kyc_approved' | 'kyc_rejected';
  message: string;
  relatedItemId?: string;
  relatedMessageId?: string;
  relatedUserId?: string;
  readStatus: boolean;
  createdAt: Timestamp | Date;
}

export interface Payment {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: 'initiated' | 'escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled';
  intasendInvoiceId?: string;
  intasendTrackingId?: string;
  intasendPayoutId?: string;
  lastCallbackStatus?: string;
  payoutLastCallbackStatus?: string;
  payoutFailureReason?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}
