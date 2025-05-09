// src/lib/types.ts
import { Timestamp } from 'firebase-admin/firestore'; // Keep for backend use if needed

// Base type for Firestore Timestamps (used in backend types)
type FirestoreTimestamp = Timestamp;
// Type for Timestamps as they arrive from API (serialized)
export type ApiTimestamp = string | null;

export interface UserProfile {
  lastVerifiedPayoutMethod: string;
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
  mpesaPhoneNumber?: string | null; 
  bankName?: string | null;        
  bankAccountNumber?: string | null;
  bankCode?: string | null;        
  paystackRecipientCode?: string | null; 
  lastVerifiedMpesa?: string | null; 
  lastVerifiedBankAcc?: string | null;
  lastVerifiedBankCode?: string | null;

  availableBalance?: number; 
  isSuspended?: boolean; 
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
  status: 'available' | 'pending' | 'paid_escrow' | 'releasing' | 'released' | 'release_failed' | 'payout_initiated' | 'payout_failed' | 'failed' | 'cancelled' | 'sold' | 'disputed' | 'under_review';
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export type NotificationType = 
  'new_message' | 
  'item_listed' | 
  'payment_received' | 
  'payment_released' | 
  'unusual_activity' | 
  'item_sold' | 
  'kyc_approved' | 
  'kyc_rejected' | 
  'message_approved' | 
  'funds_available' | 
  'withdrawal_initiated' | 
  'withdrawal_completed' | 
  'withdrawal_failed' | 
  'admin_action' | 
  'dispute_filed' | // Added for when a user files a dispute
  'new_dispute_admin'; // Added for notifying admin of a new dispute

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  relatedItemId?: string | null;
  relatedPaymentId?: string | null;
  relatedMessageId?: string | null;
  relatedUserId?: string | null;
  relatedWithdrawalId?: string | null;
  relatedDisputeId?: string | null; // Optional: link to a dispute record
  isRead: boolean;
  createdAt: ApiTimestamp;
  readAt?: ApiTimestamp;
}

export interface Payment {
  itemTitle: string;
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number; 
  currency: string;
  status: 'initiated' | 'paid_to_platform' | 'released_to_seller_balance' | 'failed' | 'cancelled' | 'refunded' | 'disputed' | 'refund_pending' | 'admin_review';
  
  paymentGateway?: 'intasend' | 'paystack' | string; 
  intasendInvoiceId?: string | null;
  intasendTrackingId?: string | null;
  gatewayTransactionId?: string | null;   
  paystackReference?: string; 
  paystackAuthorizationUrl?: string;
  paystackAccessCode?: string;
  failureReason?: string | null; 
  createdAt: ApiTimestamp; 
  updatedAt: ApiTimestamp;

  // Fields for dispute management
  isDisputed?: boolean; 
  disputeReason?: string | null; 
  disputeSubmittedAt?: ApiTimestamp | null; 
  disputeFiledBy?: string | null; // ID of the user (buyer/seller) who filed the dispute
  // disputeResolvedAt?: ApiTimestamp | null;
  // disputeResolution?: string | null;
}

export interface Earning {
    id: string; 
    userId: string; 
    amount: number; 
    relatedPaymentId: string; 
    relatedItemId: string; 
    status: 'available' | 'withdrawal_pending' | 'withdrawn'; 
    createdAt: ApiTimestamp; 
    withdrawalId?: string | null; 
}

export interface Withdrawal {
    id: string; 
    userId: string; 
    amount: number; 
    status: 'pending_approval' | 'pending_gateway' | 'processing' | 'completed' | 'failed'; 
    payoutMethod?: 'mobile_money' | 'bank_account' | string; 
    payoutDetailsMasked?: string; 
    mpesaPhoneNumber?: string | null; 
    paymentGateway?: 'intasend' | 'paystack' | string; 
    intasendTransferId?: string | null;
    paystackRecipientCode?: string | null;      
    paystackTransferReference?: string | null; 
    paystackTransferCode?: string | null;      
    failureReason?: string | null; 
    requestedAt: ApiTimestamp;
    updatedAt?: ApiTimestamp; 
    completedAt?: ApiTimestamp; 
}

export interface AdminPlatformFeeWithdrawal {
    id: string; 
    adminUserId: string; 
    amount: number; 
    currency: string; 
    status: 'pending_gateway' | 'processing' | 'completed' | 'failed';
    payoutMethod: 'mpesa' | 'bank_account';
    destinationDetails: {
        accountName?: string | null; 
        accountNumber: string; 
        bankCode?: string | null; 
        bankName?: string | null; 
    };
    paymentGateway: 'paystack';
    paystackTransferReference?: string; 
    paystackTransferCode?: string;
    failureReason?: string | null;
    initiatedAt: ApiTimestamp;
    updatedAt: ApiTimestamp;
    completedAt?: ApiTimestamp;
}

// --- Dispute Management Types ---
export type DisputeStatus = 'open' | 'pending_admin' | 'pending_buyer_response' | 'pending_seller_response' | 'resolved_refund' | 'resolved_release' | 'closed_other';

export interface DisputeRecord {
    id: string; // Dispute ID (matches the one from the API route)
    paymentId: string;
    itemId: string;
    filedByUserId: string; // User who initiated the dispute
    otherPartyUserId: string; // The other user involved in the transaction
    reason: string; // Initial reason from the user
    description: string; // Detailed description from the user
    status: DisputeStatus;
    resolutionNotes?: string | null; // Admin notes on resolution
    createdAt: ApiTimestamp;
    updatedAt: ApiTimestamp;
    resolvedAt?: ApiTimestamp | null;
    // Optional: for communication related to this dispute
    // messages: Array<{ senderId: string; text: string; timestamp: ApiTimestamp }>; 
}
// -------------------------------

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
        [userId:string]: ApiTimestamp;
    };
}

export interface PlatformSettings {
    id?: string; 
    feePercentage: number; 
    totalPlatformFees?: number; 
    updatedAt?: ApiTimestamp;
}

export interface PlatformFeeRecord {
    id: string; 
    amount: number; 
    relatedPaymentId: string; 
    relatedItemId: string; 
    sellerId: string; 
    createdAt: ApiTimestamp; 
}
