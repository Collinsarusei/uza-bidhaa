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
  mpesaPhoneNumber?: string | null; // Ensure this exists for payouts
  createdAt: ApiTimestamp; 
  updatedAt: ApiTimestamp;
  nameLastUpdatedAt?: ApiTimestamp;
  usernameLastUpdatedAt?: ApiTimestamp;
  locationLastUpdatedAt?: ApiTimestamp;
  mpesaLastUpdatedAt?: ApiTimestamp;
  // Optional: Store available balance directly for quick display
  availableBalance?: number; // Store as number (e.g., 1000.50)
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
  // Added 'paid_escrow' for clarity in this flow
  status: 'available' | 'pending' | 'paid_escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled' | 'sold'; 
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'new_message' | 'item_listed' | 'payment_received' | 'payment_released' | 'unusual_activity' | 'item_sold' | 'kyc_approved' | 'kyc_rejected' | 'message_approved' | 'funds_available' | 'withdrawal_initiated' | 'withdrawal_completed' | 'withdrawal_failed'; // Added more types
  message: string;
  relatedItemId?: string | null;
  relatedPaymentId?: string | null; // Added for linking to payments
  relatedMessageId?: string | null;
  relatedUserId?: string | null;
  relatedWithdrawalId?: string | null; // Added for linking withdrawals
  isRead: boolean; 
  createdAt: ApiTimestamp;
  readAt?: ApiTimestamp;
}

export interface Payment {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number; // Amount buyer paid
  currency: string;
  // Updated statuses for platform-managed holding
  status: 'initiated' | 'paid_to_platform' | 'released_to_seller_balance' | 'failed' | 'cancelled' | 'refunded'; 
  intasendInvoiceId?: string | null;
  intasendTrackingId?: string | null;
  failureReason?: string | null; // Store IntaSend failure reason
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

// --- Added Earning and Withdrawal Types ---

export interface Earning {
    id: string; // Firestore document ID
    userId: string; // Seller's user ID
    amount: number; // Net amount earned by seller after fees
    relatedPaymentId: string; // Link back to the originating Payment doc
    relatedItemId: string; // Link back to the Item doc
    status: 'available' | 'withdrawal_pending' | 'withdrawn'; // Status of this specific earning
    createdAt: ApiTimestamp; // When the earning was made available
    withdrawalId?: string | null; // Link to the withdrawal transaction if applicable
}

export interface Withdrawal {
    id: string; // Firestore document ID
    userId: string; // Seller's user ID
    amount: number; // Amount requested for withdrawal
    status: 'pending' | 'processing' | 'completed' | 'failed';
    mpesaPhoneNumber: string; // Number funds were sent to
    intasendTransferId?: string | null; // ID from IntaSend Send Money API
    failureReason?: string | null; // Reason if failed
    requestedAt: ApiTimestamp;
    completedAt?: ApiTimestamp;
}

// -------------------------------------------

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: ApiTimestamp;
}

interface ParticipantData {
    name?: string | null;
    avatar?: string | null;
}

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
