// src/lib/types.ts

import { PaymentStatus } from '@prisma/client';

export type ApiTimestamp = string | null;

// --- Enums (matching Prisma string values) ---
export type UserRoleType = 'USER' | 'ADMIN';
export type UserStatusType = 'ACTIVE' | 'SUSPENDED' | 'BANNED';
export type ItemStatusType = 'AVAILABLE' | 'PENDING_PAYMENT' | 'PAID_ESCROW' | 'SOLD' | 'DELISTED' | 'DISPUTED';
export type PaymentStatusType = 'INITIATED' | 'PENDING_CONFIRMATION' | 'SUCCESSFUL_ESCROW' | 'RELEASED_TO_SELLER' | 'REFUNDED_TO_BUYER' | 'FAILED' | 'CANCELLED' | 'DISPUTED';
export type DisputeStatusType = 'PENDING_BUYER' | 'PENDING_SELLER' | 'PENDING_ADMIN' | 'RESOLVED_REFUND' | 'RESOLVED_RELEASE_PAYMENT' | 'CLOSED';
export type UserWithdrawalStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type AdminFeeWithdrawalStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type EarningStatusType = 'AVAILABLE' // Add more if needed, e.g., REVERSED

// --- Main Data Structures ---

export interface UserProfile { // For general user profile display, often from /api/user/me
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null; // Was profilePictureUrl, maps to Prisma 'image'
  phoneNumber: string | null;
  location?: string | null;
  mpesaPhoneNumber?: string | null;
  
  role?: UserRoleType;
  status?: UserStatusType;
  kycVerified?: boolean;
  phoneVerified?: boolean;
  availableBalance?: number | string; // Prisma Decimal becomes number, then potentially string in JSON

  // Payout related fields from Prisma User model
  paystackRecipientCode?: string | null;
  lastVerifiedPayoutMethod?: string | null; 
  lastVerifiedMpesa?: string | null; 
  lastVerifiedBankAcc?: string | null; 
  lastVerifiedBankCode?: string | null; 
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankCode?: string | null;

  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  nameLastUpdatedAt?: ApiTimestamp;
  // Add other LastUpdatedAt fields if implemented with cooldowns (e.g., locationLastUpdatedAt)
}

export interface Item {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number | string; // Prisma Decimal
  category: string;
  location?: string | null;
  quantity: number;
  status: ItemStatusType;
  mediaUrls: string[];
  offersDelivery: boolean;
  acceptsInstallments: boolean;
  discountPercentage?: number | null; // Prisma Float
  condition: string;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  seller?: Partial<UserProfile>; // Optional: if seller details are embedded
  // For API responses that include item counts from user profile:
  _count?: {
    items?: number;
    paymentsAsBuyer?: number;
    paymentsAsSeller?: number;
    disputesFiled?: number;
  }
}

export interface Payment {
  id: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  amount: number | string; // Prisma Decimal
  platformFeeCharged?: number | string | null; // Prisma Decimal
  currency: string;
  status: PaymentStatusType;
  paymentGateway: string;
  gatewayTransactionId?: string | null;
  paystackReference?: string | null;
  paystackAccessCode?: string | null;
  paystackAuthorizationUrl?: string | null;
  failureReason?: string | null;
  activeDisputeId?: string | null;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  itemTitle?: string | null;
  item?: Partial<Pick<Item, 'id' | 'title' | 'mediaUrls'>>; // Often included in order lists
}

export interface ConversationParticipantInfo {
    userId: string;
    lastReadAt: ApiTimestamp;
    // user details can be added if needed by client
}

export interface Conversation {
  unreadCount: number;
  id: string;
  itemId: string;
  initiatorId: string;
  approved: boolean;
  approvedAt?: ApiTimestamp;
  createdAt: ApiTimestamp;
  lastMessageSnippet?: string | null;
  lastMessageTimestamp?: ApiTimestamp;
  hasShownPaymentWarning: boolean;
  itemTitle?: string | null;
  itemImageUrl?: string | null;

  // From API responses, these are often enriched:
  participants?: Partial<UserProfile>[]; // Basic info of participants
  item?: Partial<Pick<Item, 'id' | 'title' | 'mediaUrls' | 'sellerId'>>;
  unread?: boolean; // Calculated field for current user
  lastMessageSenderId?: string | null;
  participantsInfo?: ConversationParticipantInfo[]; // Raw participant info for read status
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isSystemMessage?: boolean | null;
  createdAt: ApiTimestamp;
  sender?: Partial<Pick<UserProfile, 'id' | 'name' | 'image'>>; // Often included
}

export interface Dispute {
  id: string;
  itemId: string;
  paymentId: string;
  filedByUserId: string;
  otherPartyUserId: string;
  reason: string;
  description: string;
  status: DisputeStatusType;
  resolutionNotes?: string | null;
  resolvedAt?: ApiTimestamp;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;

  // Enriched data often included for admin views:
  paymentDetails?: Partial<Payment>; 
  itemDetails?: Partial<Item>;
  filedByUserPublic?: Partial<Pick<UserProfile, 'id' | 'name' | 'email'>>;
  otherPartyUserPublic?: Partial<Pick<UserProfile, 'id' | 'name' | 'email'>>;
}

export interface FeeRule {
  id: string;
  name: string;
  description?: string | null;
  minAmount: number | string; // Prisma Decimal
  maxAmount?: number | string | null; // Prisma Decimal
  feePercentage: number | string; // Prisma Decimal
  isActive: boolean;
  priority: number;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export interface PlatformSettingData { // Renamed from PlatformSettings to avoid conflict if it was a class
  id: string;
  defaultFeePercentage: number | string; // Prisma Decimal
  totalPlatformFees: number | string; // Prisma Decimal
  updatedAt: ApiTimestamp;
}

export interface PlatformFee {
  id: string;
  relatedPaymentId: string;
  relatedItemId: string;
  sellerId: string;
  amount: number | string; // Prisma Decimal
  appliedFeePercentage?: number | string | null; // Prisma Decimal
  appliedFeeRuleId?: string | null;
  createdAt: ApiTimestamp;
  // Enriched data for admin views:
  payment?: Partial<Pick<Payment, 'id' | 'amount' | 'createdAt'>>;
  item?: Partial<Pick<Item, 'id' | 'title'>>;
  seller?: Partial<Pick<UserProfile, 'id' | 'name' | 'email'>>;
  appliedFeeRule?: Partial<Pick<FeeRule, 'id' | 'name' | 'feePercentage'>>;
}

export interface UserWithdrawal {
  id: string;
  userId: string;
  amount: number | string; // Prisma Decimal
  currency: string;
  status: UserWithdrawalStatusType;
  payoutMethod?: string | null;
  payoutDetailsMasked?: string | null;
  initiatedAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  completedAt?: ApiTimestamp;
  failureReason?: string | null;
  paymentGateway: string;
  paystackTransferCode?: string | null;
  paystackRecipientCode?: string | null;
  paystackTransferReference?: string | null;
}

export interface AdminFeeWithdrawal {
  id: string;
  adminUserId: string;
  amount: number | string; // Prisma Decimal
  currency: string;
  initiatedAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  paymentGateway: string;
  payoutMethod: string;
  status: AdminFeeWithdrawalStatusType;
  completedAt?: ApiTimestamp;
  failureReason?: string | null;
  paystackRecipientCode?: string | null;
  paystackTransferCode?: string | null;
  paystackTransferReference?: string | null;
}

export interface Earning {
  id: string;
  userId: string;
  amount: number | string; // Prisma Decimal (net amount for seller)
  relatedPaymentId: string;
  relatedItemId: string;
  itemTitleSnapshot?: string | null;
  status: EarningStatusType;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
  // Optional: include partial payment or item details if needed by frontend
  // payment?: Partial<Pick<Payment, 'id' | 'amount'>>;
  // item?: Partial<Pick<Item, 'id' | 'title'>>;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  message: string;
  relatedItemId?: string | null;
  relatedMessageId?: string | null;
  relatedUserId?: string | null;
  isRead: boolean;
  createdAt: string | null;
  readAt: string | null;
}

export interface OrderDisplayItem extends Omit<Payment, 'status'> {
    status: PaymentStatus;
    itemDetails?: Partial<Item>;
}

export interface DisputeRecord {
    id: string;
    paymentId: string;
    itemId: string;
    filedByUserId: string;
    otherPartyUserId: string;
    reason: string;
    description: string;
    status: 'PENDING_ADMIN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    createdAt: string;
    updatedAt: string;
}

export interface PlatformFeeRecord {
    id: string;
    relatedPaymentId: string;
    relatedItemId: string;
    sellerId: string;
    amount: number;
    appliedFeePercentage: number;
    appliedFeeRuleId: string | null;
    createdAt: Date;
    updatedAt: Date;
    payment?: {
        id: string;
        amount: number;
        createdAt: Date;
        item?: {
            id: string;
            title: string;
        };
    };
    item?: {
        id: string;
        title: string;
    };
    seller?: {
        id: string;
        name: string | null;
        email: string | null;
    };
    appliedFeeRule?: {
        id: string;
        name: string;
        feePercentage: number;
    };
}

// You might have more types, e.g., for API request bodies or specific UI components.
