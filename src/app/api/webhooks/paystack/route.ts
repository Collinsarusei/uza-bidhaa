// src/app/api/webhooks/paystack/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { Payment, UserProfile, Item, Withdrawal, AdminPlatformFeeWithdrawal } from '@/lib/types';
import { createNotification } from '@/lib/notifications';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Paystack Secret Key not set in environment variables.");
}

async function handleChargeSuccess(payload: any) {
    console.log("Paystack Webhook: Processing charge.success event...", payload);
    
    const paymentId = payload?.data?.metadata?.payment_id; 
    const paystackReference = payload?.data?.reference;
    const paystackTransactionId = payload?.data?.id; 
    const paymentStatus = payload?.data?.status;

    if (!paymentId || !adminDb) {
        console.warn(`Charge Success Ignored: Missing payment_id in metadata or DB not init. Paystack Ref: ${paystackReference}`);
        return; 
    }

    if (paymentStatus !== 'success') {
        console.warn(`Charge Success Ignored: Payment reference ${paystackReference} status is not 'success' (is '${paymentStatus}'). Payment ID: ${paymentId}`);
        return;
    }

    const paymentRef = adminDb.collection('payments').doc(paymentId);
    
    try {
        const paymentDoc = await paymentRef.get();

        if (!paymentDoc.exists) {
            console.warn(`Charge Success Ignored: Payment record not found for paymentId: ${paymentId} (Paystack Ref: ${paystackReference})`);
            return;
        }
        const paymentData = paymentDoc.data() as Payment;
        if (!paymentData) {
            console.warn(`Charge Success Ignored: Payment data empty for paymentId: ${paymentId}`);
            return;
        }

        if (['paid_to_platform', 'released_to_seller_balance', 'failed', 'refunded'].includes(paymentData.status)) {
            console.log(`Charge Success Ignored: Payment ${paymentId} already in terminal state (${paymentData.status}). Paystack Ref: ${paystackReference}`);
            return;
        }

        await adminDb.runTransaction(async (transaction) => {
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            const itemDoc = await transaction.get(itemRef);
            
            let currentItemStatus: Item['status'] = 'available';
            let currentItemQuantity: number = 1; // Default if not found or no quantity

            if(itemDoc.exists) {
                const itemData = itemDoc.data() as Item;
                currentItemStatus = itemData.status;
                currentItemQuantity = itemData.quantity !== undefined ? itemData.quantity : 1;
            }

            transaction.update(paymentRef, {
                status: 'paid_to_platform',
                gatewayTransactionId: paystackTransactionId ? paystackTransactionId.toString() : null, 
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Logic for item status based on quantity and current status
            if (currentItemStatus === 'available') {
                if (currentItemQuantity === 1) {
                    // This is the last unit, so mark as paid_escrow
                    transaction.update(itemRef, {
                        status: 'paid_escrow', 
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    console.log(`Charge Success: Item ${paymentData.itemId} (last unit) status updated to paid_escrow. Payment ${paymentId} to paid_to_platform.`);
                } else {
                    // Quantity > 1, item remains available. No status change needed here.
                    // Quantity itself is not decremented here.
                    console.log(`Charge Success: Item ${paymentData.itemId} has quantity > 1. Status remains '${currentItemStatus}'. Payment ${paymentId} to paid_to_platform.`);
                }
            } else {
                // Item not 'available' (e.g., disputed, or already in paid_escrow from a previous transaction attempt)
                // Do not change item status further in this case from webhook.
                console.log(`Charge Success: Item ${paymentData.itemId} status is '${currentItemStatus}'. Not changing item status. Payment ${paymentId} to paid_to_platform.`);
            }
        });

        try {
            await createNotification({
                userId: paymentData.sellerId,
                type: 'payment_received',
                message: `Payment secured for "${paymentData.itemTitle || 'Item'}". Prepare for delivery/handover once buyer confirms receipt or admin releases.`,
                relatedItemId: paymentData.itemId,
                relatedPaymentId: paymentId,
            });
             await createNotification({
                userId: paymentData.buyerId,
                type: 'payment_received',
                message: `Your payment for "${paymentData.itemTitle || 'Item'}" has been successfully processed and is held securely. Item Seller ID: ${paymentData.sellerId.substring(0,6)}`,
                relatedItemId: paymentData.itemId,
                relatedPaymentId: paymentId,
            });
        } catch (notifyError) {
             console.error(`Charge Success: Failed to send notification for payment ${paymentId}:`, notifyError);
        }

    } catch (error) {
         console.error(`Charge Success Error processing paymentId ${paymentId} (Paystack Ref: ${paystackReference}):`, error);
    }
}

async function handleTransferSuccess(payload: any) {
    console.log("Paystack Webhook: Processing transfer.success event...", payload);
    const metadata = payload?.data?.recipient?.metadata;
    const transferData = payload?.data;
    
    const withdrawalId = metadata?.withdrawal_id || metadata?.admin_withdrawal_id;
    const userId = metadata?.user_id;
    const adminUserId = metadata?.admin_user_id;
    const paystackTransferCode = transferData?.transfer_code;
    const amount = transferData?.amount / 100;

    if (!adminDb) {
        console.error("Transfer Success Error: DB not initialized.");
        return;
    }
    if (!withdrawalId) {
        console.warn("Transfer Success Ignored: withdrawal_id or admin_withdrawal_id not found in webhook metadata.", metadata);
        return;
    }

    try {
        let withdrawalRef: FirebaseFirestore.DocumentReference | null = null;
        let notificationUserId: string | null = null;
        let notificationMessage = ``;

        if (userId) {
            withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);
            notificationUserId = userId;
            notificationMessage = `Your withdrawal of KES ${amount?.toLocaleString()} has been successfully completed.`;
            console.log(`Transfer Success: User withdrawal ${withdrawalId} for user ${userId}.`);
        } else if (adminUserId) {
            withdrawalRef = adminDb.collection('adminFeeWithdrawals').doc(withdrawalId);
            notificationUserId = adminUserId; 
            notificationMessage = `Admin withdrawal of KES ${amount?.toLocaleString()} completed successfully.`;
            console.log(`Transfer Success: Admin fee withdrawal ${withdrawalId} by admin ${adminUserId}.`);
        } else {
            console.warn(`Transfer Success Ignored: Could not determine user type for withdrawal ${withdrawalId}.`);
            return;
        }

        await withdrawalRef.update({
            status: 'completed',
            paystackTransferCode: paystackTransferCode,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp()
        });
        console.log(`Transfer Success: Updated withdrawal ${withdrawalId} to completed.`);

        if (notificationUserId) {
            try {
                await createNotification({
                    userId: notificationUserId,
                    type: 'withdrawal_completed',
                    message: notificationMessage,
                    relatedWithdrawalId: withdrawalId 
                });
            } catch (notifyError) {
                console.error(`Transfer Success: Notification error for withdrawal ${withdrawalId}:`, notifyError);
            }
        }
    } catch (error) {
        console.error(`Transfer Success: Error processing withdrawal ${withdrawalId}:`, error);
    }
}

async function handleTransferFailed(payload: any) {
    console.log("Paystack Webhook: Processing transfer.failed event...", payload);
    const metadata = payload?.data?.recipient?.metadata;
    const transferData = payload?.data;
    
    const withdrawalId = metadata?.withdrawal_id || metadata?.admin_withdrawal_id;
    const userId = metadata?.user_id;
    const adminUserId = metadata?.admin_user_id;
    const paystackTransferCode = transferData?.transfer_code;
    const failureReason = transferData?.failure_reason || "Transfer failed (Paystack)";
    const amount = transferData?.amount / 100;

    if (!adminDb) {
        console.error("Transfer Failed Error: DB not initialized.");
        return;
    }
    if (!withdrawalId) {
        console.warn("Transfer Failed Ignored: withdrawal_id or admin_withdrawal_id not found.", metadata);
        return;
    }

    try {
        let withdrawalRef: FirebaseFirestore.DocumentReference | null = null;
        let userRef: FirebaseFirestore.DocumentReference | null = null;
        let settingsRef: FirebaseFirestore.DocumentReference | null = null;
        let notificationUserId: string | null = null;
        let notificationMessage = ``;

        if (userId) {
            withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);
            userRef = adminDb.collection('users').doc(userId);
            notificationUserId = userId;
            notificationMessage = `Your withdrawal of KES ${amount?.toLocaleString()} failed. Reason: ${failureReason}`;
            console.log(`Transfer Failed: User withdrawal ${withdrawalId} for ${userId}. Reason: ${failureReason}`);
        } else if (adminUserId) {
            withdrawalRef = adminDb.collection('adminFeeWithdrawals').doc(withdrawalId);
            settingsRef = adminDb.collection('settings').doc('platformFee');
            notificationUserId = adminUserId;
            notificationMessage = `Admin withdrawal of KES ${amount?.toLocaleString()} failed. Reason: ${failureReason}`;
             console.log(`Transfer Failed: Admin fee withdrawal ${withdrawalId} by ${adminUserId}. Reason: ${failureReason}`);
        } else {
            console.warn(`Transfer Failed Ignored: Could not determine user type for withdrawal ${withdrawalId}.`);
            return;
        }
        
        const withdrawalDoc = await withdrawalRef.get();
        if (withdrawalDoc.exists && (withdrawalDoc.data()?.status === 'failed' || withdrawalDoc.data()?.status === 'completed')) {
            console.log(`Transfer Failed Ignored: Withdrawal ${withdrawalId} already in terminal state.`);
            return;
        }

        await adminDb.runTransaction(async (transaction) => {
            transaction.update(withdrawalRef!, {
                status: 'failed',
                failureReason: failureReason,
                paystackTransferCode: paystackTransferCode,
                updatedAt: FieldValue.serverTimestamp(),
            });

            if (amount > 0) { 
                if (userRef) {
                    transaction.update(userRef, { availableBalance: FieldValue.increment(amount) });
                    console.log(`Transfer Failed: Reverted KES ${amount} to user ${userId} balance.`);
                } else if (settingsRef) {
                    transaction.update(settingsRef, { totalPlatformFees: FieldValue.increment(amount) });
                     console.log(`Transfer Failed: Reverted KES ${amount} to totalPlatformFees.`);
                }
            }
        });
         console.log(`Transfer Failed: Updated withdrawal ${withdrawalId} to failed.`);

        if (notificationUserId) {
            try {
                await createNotification({
                    userId: notificationUserId,
                    type: 'withdrawal_failed',
                    message: notificationMessage,
                    relatedWithdrawalId: withdrawalId 
                });
            } catch (notifyError) {
                console.error(`Transfer Failed: Notification error for withdrawal ${withdrawalId}:`, notifyError);
            }
        }
    } catch (error) {
        console.error(`Transfer Failed: Error processing withdrawal ${withdrawalId}:`, error);
    }
}

async function handleTransferReversed(payload: any) {
     console.warn("Paystack Webhook: transfer.reversed event received. Logic similar to transfer.failed.", payload);
     // For now, reuse handleTransferFailed logic as the outcome (reverting funds) is similar.
     await handleTransferFailed(payload); 
}

export async function POST(req: Request) {
    console.log("--- API POST /api/webhooks/paystack START ---");

    if (!PAYSTACK_SECRET_KEY || !adminDb) {
        console.error("Webhook Error: Paystack Secret Key or DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const signature = req.headers.get('x-paystack-signature');
    const bodyText = await req.text(); 

    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                       .update(bodyText)
                       .digest('hex');

    if (hash !== signature) {
        console.warn("Paystack Webhook: Invalid signature.");
        return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }
    console.log("Paystack Webhook: Signature verified.");

    const payload = JSON.parse(bodyText);
    const eventType = payload.event;
    console.log(`Paystack Webhook: Processing event: ${eventType}`);

    try {
        switch (eventType) {
            case 'charge.success':
                await handleChargeSuccess(payload);
                break;
             case 'transfer.success':
                 await handleTransferSuccess(payload);
                 break;
             case 'transfer.failed':
                 await handleTransferFailed(payload);
                 break;
            case 'transfer.reversed':
                 await handleTransferReversed(payload);
                 break;
            default:
                console.log(`Paystack Webhook: Unhandled event: ${eventType}`);
        }
        
        console.log(`--- API POST /api/webhooks/paystack SUCCESS --- Event '${eventType}' processed.`);
        return NextResponse.json({ received: true }, { status: 200 });
    
    } catch (error: any) {
         console.error(`--- API POST /api/webhooks/paystack FAILED processing event ${eventType} --- Error:`, error);
         return NextResponse.json({ message: 'Webhook processing error', error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    console.log("--- API GET /api/webhooks/paystack Received (Not Allowed) ---");
    return NextResponse.json({ message: "Webhook endpoint expects POST requests." }, { status: 405 });
}
