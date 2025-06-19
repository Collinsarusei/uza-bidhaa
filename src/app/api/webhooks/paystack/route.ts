// src/app/api/webhooks/paystack/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
const PaymentStatus = {
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCESSFUL_ESCROW: 'SUCCESSFUL_ESCROW',
  PAID_ESCROW: 'PAID_ESCROW',
  RELEASED_TO_SELLER: 'RELEASED_TO_SELLER',
  REFUNDED_TO_BUYER: 'REFUNDED_TO_BUYER',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  DISPUTED: 'DISPUTED'
} as const;

const ItemStatus = {
  AVAILABLE: 'AVAILABLE',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID_ESCROW: 'PAID_ESCROW',
  SOLD: 'SOLD',
  DELISTED: 'DELISTED',
  DISPUTED: 'DISPUTED'
} as const;

const AdminFeeWithdrawalStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

const UserWithdrawalStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN'
} as const;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Paystack Secret Key not set in environment variables.");
}

async function handleChargeSuccess(payload: any) {
    console.log("Paystack Webhook: Processing charge.success event (Prisma V3 - Corrected Item Logic)...", payload);
    
    const prismaPaymentId = payload?.data?.metadata?.payment_id_prisma; 
    const paystackReference = payload?.data?.reference;
    const paystackTransactionId = payload?.data?.id;
    const paymentStatusFromPaystack = payload?.data?.status; 

    if (!prismaPaymentId) {
        console.warn(`Webhook charge.success: Missing payment_id_prisma in metadata. Paystack Ref: ${paystackReference}`);
        return; 
    }
    if (paymentStatusFromPaystack !== 'success') {
        console.warn(`Webhook charge.success: Paystack status is not 'success' (is '${paymentStatusFromPaystack}') for Prisma Payment ID: ${prismaPaymentId}.`);
        return;
    }

    try {
        const payment = await prisma.payment.findUnique({
            where: { id: prismaPaymentId },
            include: { item: { select: { id: true, title: true, quantity: true, status: true, sellerId: true } } } // Include item details
        });

        if (!payment) {
            console.warn(`Webhook charge.success: Payment record not found for ID: ${prismaPaymentId}.`);
            return;
        }

        const terminalStatuses = [PaymentStatus.SUCCESSFUL_ESCROW, PaymentStatus.RELEASED_TO_SELLER, PaymentStatus.REFUNDED_TO_BUYER, PaymentStatus.FAILED];
        if (terminalStatuses.includes(payment.status as typeof terminalStatuses[number])) {
            console.log(`Webhook charge.success: Payment ${prismaPaymentId} already in terminal state (${payment.status}). Skipping.`);
            return;
        }
        
        try {
            await prisma.$transaction(async (tx) => {
                // 1. Update Payment status
                await tx.payment.update({
                    where: { id: prismaPaymentId },
                    data: {
                        status: PaymentStatus.SUCCESSFUL_ESCROW, 
                        gatewayTransactionId: paystackTransactionId ? paystackTransactionId.toString() : null,
                    }
                });
                console.log(`Webhook charge.success: Payment ${prismaPaymentId} status updated to SUCCESSFUL_ESCROW.`);

                // 2. Handle Item status and quantity
                if (payment.item) {
                    if (payment.item.status === ItemStatus.AVAILABLE) {
                        if (payment.item.quantity === 1) {
                            // This is the last unit, mark as PAID_ESCROW (no longer available for others to buy)
                            await tx.item.update({
                                where: { id: payment.itemId },
                                data: { status: ItemStatus.PAID_ESCROW }
                            });
                            console.log(`Webhook charge.success: Item ${payment.itemId} (last unit, quantity: 1) status updated to PAID_ESCROW.`);
                        } else if (payment.item.quantity > 1) {
                            // Quantity > 1, decrement quantity and optionally create a line item
                            await tx.item.update({
                                where: { id: payment.itemId },
                                data: { quantity: payment.item.quantity - 1 }
                            });
                            console.log(`Webhook charge.success: Item ${payment.itemId} quantity decremented to ${payment.item.quantity - 1}.`);
                        } else {
                            // Quantity is 0 or less, but status was AVAILABLE. This is an inconsistent state.
                            // Log this, but proceed with payment. Item should ideally not be buyable if quantity <= 0.
                            console.warn(`Webhook charge.success: Item ${payment.itemId} has quantity ${payment.item.quantity} but status was AVAILABLE. Proceeding with payment update.`);
                        }

                        // 3. Create Order record
                        await tx.order.create({
                            data: {
                                buyerId: payment.buyerId,
                                sellerId: payment.item.sellerId,
                                itemId: payment.itemId,
                                paymentId: prismaPaymentId,
                                itemTitle: payment.itemTitle || '',
                                amount: payment.amount,
                                status: 'PENDING_FULFILLMENT', // Or any other relevant initial status
                            }
                        });
                        console.log(`Webhook charge.success: Order created for buyer ${payment.buyerId}, item ${payment.itemId}.`);

                    }
                } else {
                    console.warn(`Webhook charge.success: Item data not found for payment ${prismaPaymentId}. Cannot update item status or create order.`);
                }
            });
        } catch (error: any) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                console.warn(`Webhook charge.success: Order for payment ${prismaPaymentId} already exists. Skipping.`);
                return;
            }
            throw error;
        }

        // Notifications
        if (payment.item) {
            await createNotification({
                userId: payment.sellerId,
                type: 'payment_secured',
                message: `Payment secured for "${payment.itemTitle || payment.item.title}". Awaiting buyer confirmation.`,
                relatedPaymentId: prismaPaymentId,
                relatedItemId: payment.itemId,
            });
            await createNotification({
                userId: payment.buyerId,
                type: 'payment_successful',
                message: `Your payment for "${payment.itemTitle || payment.item.title}" is successful and held securely.`,
                relatedPaymentId: prismaPaymentId,
                relatedItemId: payment.itemId,
            });
        }
    } catch (error) {
         console.error(`Webhook charge.success: Error processing Prisma Payment ID ${prismaPaymentId}:`, error);
    }
}

async function handleTransferSuccess(payload: any) {
    console.log("Paystack Webhook: Processing transfer.success event (Prisma)...", payload);
    const metadata = payload?.data?.recipient?.metadata;
    const transferData = payload?.data;
    
    const adminWithdrawalId = metadata?.admin_withdrawal_id;
    const userWithdrawalId = metadata?.user_withdrawal_id; 
    const userIdForNotification = metadata?.user_id; 

    const paystackTransferCode = transferData?.transfer_code;
    const amountDecimal = new Decimal(transferData?.amount / 100); 

    if (adminWithdrawalId) {
        try {
            const withdrawal = await prisma.adminFeeWithdrawal.findUnique({ where: { id: adminWithdrawalId } });
            if (!withdrawal || withdrawal.status === AdminFeeWithdrawalStatus.COMPLETED || withdrawal.status === AdminFeeWithdrawalStatus.FAILED) {
                console.log(`Webhook transfer.success: AdminFeeWithdrawal ${adminWithdrawalId} not found or already processed. Skipping.`);
                return;
            }
            await prisma.adminFeeWithdrawal.update({
                where: { id: adminWithdrawalId },
                data: {
                    status: AdminFeeWithdrawalStatus.COMPLETED,
                    paystackTransferCode: paystackTransferCode,
                    completedAt: new Date(),
                }
            });
            console.log(`Webhook transfer.success: AdminFeeWithdrawal ${adminWithdrawalId} COMPLETED.`);
            await createNotification({
                userId: withdrawal.adminUserId,
                type: 'admin_withdrawal_completed',
                message: `Admin withdrawal of KES ${amountDecimal.toFixed(2)} completed.`,
                relatedWithdrawalId: adminWithdrawalId 
            });
        } catch (error) {
            console.error(`Webhook transfer.success: Error AdminFeeWithdrawal ${adminWithdrawalId}:`, error);
        }
    } else if (userWithdrawalId && userIdForNotification) {
        try {
            const withdrawal = await prisma.userWithdrawal.findUnique({ where: { id: userWithdrawalId } });
            if (!withdrawal || withdrawal.status === UserWithdrawalStatus.COMPLETED || withdrawal.status === UserWithdrawalStatus.FAILED) {
                console.log(`Webhook transfer.success: UserWithdrawal ${userWithdrawalId} not found or already processed. Skipping.`);
                return;
            }
            await prisma.userWithdrawal.update({
                where: { id: userWithdrawalId },
                data: {
                    status: UserWithdrawalStatus.COMPLETED,
                    paystackTransferCode: paystackTransferCode,
                    completedAt: new Date(),
                }
            });
            console.log(`Webhook transfer.success: UserWithdrawal ${userWithdrawalId} COMPLETED for user ${userIdForNotification}.`);
            await createNotification({
                userId: userIdForNotification,
                type: 'user_withdrawal_completed',
                message: `Your withdrawal of KES ${amountDecimal.toFixed(2)} has been completed.`,
                relatedWithdrawalId: userWithdrawalId 
            });
        } catch (error) {
            console.error(`Webhook transfer.success: Error UserWithdrawal ${userWithdrawalId}:`, error);
        }
    } else {
        console.warn("Webhook transfer.success: No identifiable admin or user withdrawal ID in metadata.", metadata);
    }
}

async function handleTransferFailedOrReversed(payload: any, eventType: 'transfer.failed' | 'transfer.reversed') {
    console.log(`Paystack Webhook: Processing ${eventType} (Prisma)...`, payload);
    const metadata = payload?.data?.recipient?.metadata;
    const transferData = payload?.data;

    const adminWithdrawalId = metadata?.admin_withdrawal_id;
    const userWithdrawalId = metadata?.user_withdrawal_id; 
    const userIdForReversal = metadata?.user_id; 

    const paystackTransferCode = transferData?.transfer_code;
    const failureReason = transferData?.failure_reason || `${eventType} by Paystack`;
    const amountDecimal = new Decimal(transferData?.amount / 100);

    if (adminWithdrawalId) {
        try {
            const withdrawal = await prisma.adminFeeWithdrawal.findUnique({ where: { id: adminWithdrawalId }});
            if (!withdrawal || withdrawal.status === AdminFeeWithdrawalStatus.COMPLETED || withdrawal.status === AdminFeeWithdrawalStatus.FAILED) {
                console.log(`Webhook ${eventType}: AdminFeeWithdrawal ${adminWithdrawalId} not found or already processed. Skipping.`);
                return;
            }
            await prisma.$transaction(async (tx) => {
                await tx.adminFeeWithdrawal.update({
                    where: { id: adminWithdrawalId },
                    data: {
                        status: AdminFeeWithdrawalStatus.FAILED,
                        failureReason: failureReason,
                        paystackTransferCode: paystackTransferCode,
                    }
                });
                if (amountDecimal.gt(0)) {
                    await tx.platformSetting.update({
                        where: { id: "global_settings" },
                        data: { totalPlatformFees: { increment: amountDecimal } }
                    });
                    console.log(`Webhook ${eventType}: Reverted KES ${amountDecimal.toFixed(2)} to totalPlatformFees for AdminFeeWithdrawal ${adminWithdrawalId}.`);
                }
            });
            console.log(`Webhook ${eventType}: AdminFeeWithdrawal ${adminWithdrawalId} FAILED.`);
            await createNotification({
                userId: withdrawal.adminUserId,
                type: 'admin_withdrawal_failed',
                message: `Admin withdrawal of KES ${amountDecimal.toFixed(2)} ${eventType === 'transfer.failed' ? 'failed' : 'reversed'}. Reason: ${failureReason}`,
                relatedWithdrawalId: adminWithdrawalId 
            });
        } catch (error) {
            console.error(`Webhook ${eventType}: Error AdminFeeWithdrawal ${adminWithdrawalId}:`, error);
        }
    } else if (userWithdrawalId && userIdForReversal) {
        try {
            const withdrawal = await prisma.userWithdrawal.findUnique({ where: { id: userWithdrawalId }});
            if (!withdrawal || withdrawal.status === UserWithdrawalStatus.COMPLETED || withdrawal.status === UserWithdrawalStatus.FAILED) {
                 console.log(`Webhook ${eventType}: UserWithdrawal ${userWithdrawalId} not found or already processed. Skipping.`);
                return;
            }
            await prisma.$transaction(async (tx) => {
                await tx.userWithdrawal.update({
                    where: { id: userWithdrawalId },
                    data: {
                        status: UserWithdrawalStatus.FAILED,
                        failureReason: failureReason,
                        paystackTransferCode: paystackTransferCode,
                    }
                });
                if (amountDecimal.gt(0)) {
                    await tx.user.update({
                        where: { id: userIdForReversal },
                        data: { availableBalance: { increment: amountDecimal } }
                    });
                    console.log(`Webhook ${eventType}: Reverted KES ${amountDecimal.toFixed(2)} to user ${userIdForReversal} availableBalance for UserWithdrawal ${userWithdrawalId}.`);
                }
            });
            console.log(`Webhook ${eventType}: UserWithdrawal ${userWithdrawalId} FAILED for user ${userIdForReversal}.`);
             await createNotification({
                userId: userIdForReversal,
                type: 'user_withdrawal_failed',
                message: `Your withdrawal of KES ${amountDecimal.toFixed(2)} ${eventType === 'transfer.failed' ? 'failed' : 'reversed'}. Reason: ${failureReason}`,
                relatedWithdrawalId: userWithdrawalId 
            });
        } catch (error) {
            console.error(`Webhook ${eventType}: Error UserWithdrawal ${userWithdrawalId}:`, error);
        }
    } else {
        console.warn(`Webhook ${eventType}: No identifiable admin or user withdrawal ID in metadata. Reversal/failure not fully processed. Amount: ${amountDecimal.toFixed(2)}`, metadata);
    }
}

export async function POST(req: Request) {
    console.log("--- API POST /api/webhooks/paystack (Prisma) START ---");

    if (!PAYSTACK_SECRET_KEY) {
        console.error("Webhook Error: Paystack Secret Key not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const signature = req.headers.get('x-paystack-signature');
    const bodyText = await req.text(); 

    try {
        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                           .update(Buffer.from(bodyText, 'utf-8')) 
                           .digest('hex');

        if (hash !== signature) {
            console.warn("Paystack Webhook: Invalid signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
        }
        console.log("Paystack Webhook: Signature verified.");

        const payload = JSON.parse(bodyText);
        const eventType = payload.event;
        console.log(`Paystack Webhook: Processing event: ${eventType}`);

        switch (eventType) {
            case 'charge.success':
                await handleChargeSuccess(payload);
                break;
            case 'transfer.success':
                await handleTransferSuccess(payload);
                break;
            case 'transfer.failed':
                await handleTransferFailedOrReversed(payload, 'transfer.failed');
                break;
            case 'transfer.reversed':
                await handleTransferFailedOrReversed(payload, 'transfer.reversed');
                break;
            default:
                console.log(`Paystack Webhook: Unhandled event: ${eventType}`);
        }
        
        console.log(`--- API POST /api/webhooks/paystack (Prisma) SUCCESS --- Event '${eventType}' processed.`);
        return NextResponse.json({ received: true }, { status: 200 });
    
    } catch (error: any) {
         console.error(`--- API POST /api/webhooks/paystack (Prisma) FAILED --- Error:`, error);
         return NextResponse.json({ message: 'Webhook processing error', error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    console.log("--- API GET /api/webhooks/paystack (Prisma) Received (Not Allowed) ---");
    return NextResponse.json({ message: "Webhook endpoint expects POST requests." }, { status: 405 });
}
