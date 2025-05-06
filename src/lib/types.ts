// src/lib/types.ts
import { Timestamp } from 'firebase-admin/firestore'; // Keep for backend use if needed

// Base type for Firestore Timestamps (used in backend types)
type FirestoreTimestamp = Timestamp;
// Type for Timestamps as they arrive from API (serialized)
export type ApiTimestamp = string | null;

export interface UserProfile {
  id: string;
  name: string;
  username?: string;
  email: string;
  phoneNumber: string; // General phone
  location?: string | null;
  profilePictureUrl?: string | null;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  nameLastUpdatedAt?: ApiTimestamp;
  usernameLastUpdatedAt?: ApiTimestamp;
  locationLastUpdatedAt?: ApiTimestamp;
  mpesaLastUpdatedAt?: ApiTimestamp;

  // --- Paystack Payout Specific Fields ---
  mpesaPhoneNumber?: string | null; // For M-Pesa payouts (can be used by Paystack or Intasend)
  bankName?: string | null;         // For bank payouts via Paystack
  bankAccountNumber?: string | null;// For bank payouts via Paystack
  bankCode?: string | null;         // Paystack specific bank code
  paystackRecipientCode?: string | null; // Store Paystack's recipient code
  lastVerifiedMpesa?: string | null; // To track if Paystack recipient (Mpesa) needs update
  lastVerifiedBankAcc?: string | null;// To track if Paystack recipient (Bank) needs update
  lastVerifiedBankCode?: string | null;// To track if Paystack recipient (Bank) needs update
  // ------------------------------------

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
  status: 'available' | 'pending' | 'paid_escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled' | 'sold';
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'new_message' | 'item_listed' | 'payment_received' | 'payment_released' | 'unusual_activity' | 'item_sold' | 'kyc_approved' | 'kyc_rejected' | 'message_approved' | 'funds_available' | 'withdrawal_initiated' | 'withdrawal_completed' | 'withdrawal_failed';
  message: string;
  relatedItemId?: string | null;
  relatedPaymentId?: string | null;
  relatedMessageId?: string | null;
  relatedUserId?: string | null;
  relatedWithdrawalId?: string | null;
  isRead: boolean;
  createdAt: ApiTimestamp;
  readAt?: ApiTimestamp;
}

export interface Payment {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number; // Amount buyer paid (in KES or your primary currency)
  currency: string;
  status: 'initiated' | 'paid_to_platform' | 'released_to_seller_balance' | 'failed' | 'cancelled' | 'refunded';
  
  // --- Gateway Specific Fields ---
  paymentGateway?: 'intasend' | 'paystack' | string; // To identify the gateway used

  // Intasend specific (keep for historical data or if you might switch back/support both)
  intasendInvoiceId?: string | null;
  intasendTrackingId?: string | null;

  // Paystack specific
  gatewayTransactionId?: string | null;   // Paystack's transaction ID (from charge.success)
  gatewayReference?: string | null;       // Your reference sent to Paystack (should match 'id')
  // -------------------------------

  failureReason?: string | null; // General failure reason
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

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
    id: string; // Your internal ID for the withdrawal request
    userId: string; // Seller's user ID
    amount: number; // Amount requested for withdrawal (in KES or your primary currency)
    status: 'pending_approval' | 'pending_gateway' | 'processing' | 'completed' | 'failed'; // Added pending_gateway & pending_approval
    
    // --- Payout Method Details ---
    payoutMethod?: 'mobile_money' | 'bank_account' | string; // e.g., 'mpesa', 'paystack_bank'
    payoutDetailsMasked?: string; // e.g., "MTN-****123" or "058-****5678"
    mpesaPhoneNumber?: string | null; // Store the Mpesa number used for THIS withdrawal (Paystack or Intasend)

    // --- Gateway Specific Fields for this Withdrawal ---
    paymentGateway?: 'intasend' | 'paystack' | string; // Which gateway processed this withdrawal

    // Intasend specific (keep for historical data or if you might switch back/support both)
    intasendTransferId?: string | null;

    // Paystack specific
    paystackRecipientCode?: string | null;      // Recipient code used for this transfer
    paystackTransferReference?: string | null; // Your unique reference sent to Paystack for this transfer
    paystackTransferCode?: string | null;      // Paystack's ID for the transfer attempt
    // --------------------------------------

    failureReason?: string | null; // Reason if the withdrawal failed
    requestedAt: ApiTimestamp;
    updatedAt?: ApiTimestamp; // When the withdrawal record was last updated
    completedAt?: ApiTimestamp; // When the withdrawal was successfully completed
}

// Message, ParticipantData, Conversation remain unchanged from your provided code
export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: ApiTimestamp;
}

export interface ParticipantData {
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