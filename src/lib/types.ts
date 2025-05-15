// src/lib/types.ts
import { Timestamp } from 'firebase-admin/firestore';

export type ApiTimestamp = string | null;

export interface UserProfile {
  lastVerifiedPayoutMethod: string;
  id: string;
  name: string;
  username?: string;
  email: string;
  phoneNumber: string;
  location?: string | null;
  profilePictureUrl?: string | null;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  nameLastUpdatedAt?: ApiTimestamp;
  usernameLastUpdatedAt?: ApiTimestamp;
  locationLastUpdatedAt?: ApiTimestamp;
  mpesaLastUpdatedAt?: ApiTimestamp;
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
  quantity?: number;
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
  'dispute_filed' | 
  'new_dispute_admin';

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
  relatedDisputeId?: string | null;
  isRead: boolean;
  createdAt: ApiTimestamp;
  readAt?: ApiTimestamp;
}

export interface Payment {
  itemTitle: string; // Consider making optional if itemDetails is always fetched
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
  isDisputed?: boolean;
  disputeReason?: string | null;
  disputeSubmittedAt?: ApiTimestamp | null;
  disputeFiledBy?: string | null;
  disputeId?: string | null; // Added to link payment to a specific dispute record
}

// Interface for displaying orders, often Payments augmented with Item details
export interface OrderDisplayItem extends Payment {
    itemDetails?: Partial<Item>; // Partial to allow for cases where details might be minimal or missing
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

export type DisputeStatus = 'open' | 'pending_admin' | 'pending_buyer_response' | 'pending_seller_response' | 'resolved_refund' | 'resolved_release' | 'closed_other';

export interface DisputeRecord {
    id: string;
    paymentId: string;
    itemId: string;
    filedByUserId: string;
    otherPartyUserId: string;
    reason: string;
    description: string;
    status: DisputeStatus;
    resolutionNotes?: string | null;
    createdAt: ApiTimestamp;
    updatedAt: ApiTimestamp;
    resolvedAt?: ApiTimestamp | null;
}

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
    participantsData?: { [userId: string]: ParticipantData; };
    readStatus?: { [userId:string]: ApiTimestamp; };
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
