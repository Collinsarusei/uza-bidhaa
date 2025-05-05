import { Timestamp } from 'firebase-admin/firestore'; // Keep for backend use if needed

// Base type for Firestore Timestamps (used in backend types)
type FirestoreTimestamp = Timestamp;
// Type for Timestamps as they arrive from API (serialized)
type ApiTimestamp = string | null; 

export interface UserProfile {
  id: string;
  name: string; 
  username?: string;
  email: string;
  phoneNumber: string;
  location?: string | null; 
  profilePictureUrl?: string | null;
  mpesaPhoneNumber?: string | null;
  // Use ApiTimestamp for consistency in what client expects
  createdAt: ApiTimestamp; 
  updatedAt: ApiTimestamp;
  nameLastUpdatedAt?: ApiTimestamp;
  usernameLastUpdatedAt?: ApiTimestamp;
  locationLastUpdatedAt?: ApiTimestamp;
  mpesaLastUpdatedAt?: ApiTimestamp;
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
  discountPercentage?: number | null;
  mediaUrls: string[];
  status: 'available' | 'pending' | 'paid_escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled' | 'sold'; 
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'new_message' | 'item_listed' | 'payment_received' | 'payment_released' | 'unusual_activity' | 'item_sold' | 'kyc_approved' | 'kyc_rejected' | 'message_approved';
  message: string;
  relatedItemId?: string | null;
  relatedMessageId?: string | null;
  relatedUserId?: string | null;
  isRead: boolean; 
  createdAt: ApiTimestamp;
  readAt?: ApiTimestamp;
}

export interface Payment {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: 'initiated' | 'escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled';
  intasendInvoiceId?: string | null;
  intasendTrackingId?: string | null;
  intasendPayoutId?: string | null;
  lastCallbackStatus?: string | null;
  payoutLastCallbackStatus?: string | null;
  payoutFailureReason?: string | null;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

// Represents a single message within a conversation
export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: ApiTimestamp; // Use ApiTimestamp
}

// Represents participant data stored within a conversation document
interface ParticipantData {
    name?: string | null;
    avatar?: string | null;
}

// Represents the main conversation document as expected by the client
export interface Conversation {
    id: string;
    participantIds: string[]; 
    itemId: string; 
    itemTitle?: string | null;
    itemImageUrl?: string | null;
    createdAt: ApiTimestamp;
    lastMessageTimestamp: ApiTimestamp;
    lastMessageSnippet?: string | null;
    approved: boolean;
    initiatorId: string;
    approvedAt?: ApiTimestamp;
    participantsData?: {
        [userId: string]: ParticipantData;
    };
    readStatus?: {
        [userId: string]: ApiTimestamp;
    };
}
