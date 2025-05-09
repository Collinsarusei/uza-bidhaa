// src/app/api/webhooks/paystack/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { Payment, UserProfile, Item, Withdrawal, AdminPlatformFeeWithdrawal } from '@/lib/types'; // Added Withdrawal, AdminPlatformFeeWithdrawal
import { createNotification } from '@/lib/notifications';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Paystack Secret Key not set in environment variables.");
}

// --- Helper: Process Charge Success Event ---
async function handleChargeSuccess(payload: any) {
    console.log("Paystack Webhook: Processing charge.success event...", payload);
    
    const paymentId = payload?.data?.metadata?.payment_id; 
    const paystackReference = payload?.data?.reference;
    const paystackTransactionId = payload?.data?.id; 
    const amountPaidKobo = payload?.data?.amount;
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
            transaction.update(paymentRef, {
                status: 'paid_to_platform',
                gatewayTransactionId: paystackTransactionId ? paystackTransactionId.toString() : null, 
                updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(itemRef, {
                status: 'paid_on_hold', 
                updatedAt: FieldValue.serverTimestamp()
            });
        });
        console.log(`Charge Success: Updated payment ${paymentId} to paid_to_platform and item ${paymentData.itemId} to paid_escrow. Paystack Ref: ${paystackReference}`);

        try {
            await createNotification({
                userId: paymentData.sellerId,
                type: 'item_sold',
                message: `Your item "${paymentData.itemTitle || 'Item'}" has been sold and payment is secured. Prepare for delivery/handover.`,
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

// --- Helper: Process Transfer Success Event ---
async function handleTransferSuccess(payload: any) {
    console.log("Paystack Webhook: Processing transfer.success event...", payload);
    const metadata = payload?.data?.recipient?.metadata; // Check metadata in recipient object first
    const transferData = payload?.data;
    
    const withdrawalId = metadata?.withdrawal_id || metadata?.admin_withdrawal_id;
    const userId = metadata?.user_id;
    const adminUserId = metadata?.admin_user_id;
    const paystackTransferCode = transferData?.transfer_code;
    const amount = transferData?.amount / 100; // Convert from kobo

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

        // Determine if it's a user or admin withdrawal
        if (userId) {
            withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);
            notificationUserId = userId;
            notificationMessage = `Your withdrawal of KES ${amount?.toLocaleString()} has been successfully completed.`;
            console.log(`Transfer Success: Identified as user withdrawal ${withdrawalId} for user ${userId}.`);
        } else if (adminUserId) {
            withdrawalRef = adminDb.collection('adminFeeWithdrawals').doc(withdrawalId);
            notificationUserId = adminUserId; // Notify the admin who initiated it
            notificationMessage = `Admin withdrawal of KES ${amount?.toLocaleString()} completed successfully.`;
            console.log(`Transfer Success: Identified as admin fee withdrawal ${withdrawalId} by admin ${adminUserId}.`);
        } else {
            console.warn(`Transfer Success Ignored: Could not determine user type (user/admin) for withdrawal ${withdrawalId}. Metadata:`, metadata);
            return;
        }

        // Update withdrawal status
        await withdrawalRef.update({
            status: 'completed',
            paystackTransferCode: paystackTransferCode,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp()
        });
        console.log(`Transfer Success: Updated withdrawal record ${withdrawalId} to completed.`);

        // Send notification if applicable
        if (notificationUserId) {
            try {
                await createNotification({
                    userId: notificationUserId,
                    type: 'withdrawal_completed',
                    message: notificationMessage,
                    relatedWithdrawalId: withdrawalId 
                });
            } catch (notifyError) {
                console.error(`Transfer Success: Failed to send notification for withdrawal ${withdrawalId}:`, notifyError);
            }
        }
    } catch (error) {
        console.error(`Transfer Success: Error processing withdrawal ${withdrawalId}:`, error);
    }
}

// --- Helper: Process Transfer Failed Event ---
async function handleTransferFailed(payload: any) {
    console.log("Paystack Webhook: Processing transfer.failed event...", payload);
    const metadata = payload?.data?.recipient?.metadata; // Check metadata in recipient object first
    const transferData = payload?.data;
    
    const withdrawalId = metadata?.withdrawal_id || metadata?.admin_withdrawal_id;
    const userId = metadata?.user_id;
    const adminUserId = metadata?.admin_user_id;
    const paystackTransferCode = transferData?.transfer_code;
    const failureReason = transferData?.failure_reason || "Transfer failed without specific reason from Paystack";
    const amount = transferData?.amount / 100; // Convert from kobo

    if (!adminDb) {
        console.error("Transfer Failed Error: DB not initialized.");
        return;
    }
    if (!withdrawalId) {
        console.warn("Transfer Failed Ignored: withdrawal_id or admin_withdrawal_id not found in webhook metadata.", metadata);
        return;
    }

    try {
        let withdrawalRef: FirebaseFirestore.DocumentReference | null = null;
        let userRef: FirebaseFirestore.DocumentReference | null = null;
        let settingsRef: FirebaseFirestore.DocumentReference | null = null;
        let notificationUserId: string | null = null;
        let notificationMessage = ``;
        let shouldRevertBalance = true; // Safety flag, might disable based on error reason

        // Determine if it's a user or admin withdrawal
        if (userId) {
            withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);
            userRef = adminDb.collection('users').doc(userId);
            notificationUserId = userId;
            notificationMessage = `Your withdrawal of KES ${amount?.toLocaleString()} failed. Reason: ${failureReason}`;
            console.log(`Transfer Failed: Identified as user withdrawal ${withdrawalId} for user ${userId}. Reason: ${failureReason}`);
        } else if (adminUserId) {
            withdrawalRef = adminDb.collection('adminFeeWithdrawals').doc(withdrawalId);
            settingsRef = adminDb.collection('settings').doc('platformFee');
            notificationUserId = adminUserId; // Notify the admin
            notificationMessage = `Admin withdrawal of KES ${amount?.toLocaleString()} failed. Reason: ${failureReason}`;
             console.log(`Transfer Failed: Identified as admin fee withdrawal ${withdrawalId} by admin ${adminUserId}. Reason: ${failureReason}`);
        } else {
            console.warn(`Transfer Failed Ignored: Could not determine user type (user/admin) for withdrawal ${withdrawalId}. Metadata:`, metadata);
            return;
        }
        
        // Check if withdrawal already failed/completed to avoid double processing/reverting
        const withdrawalDoc = await withdrawalRef.get();
        if (withdrawalDoc.exists && (withdrawalDoc.data()?.status === 'failed' || withdrawalDoc.data()?.status === 'completed')) {
            console.log(`Transfer Failed Ignored: Withdrawal ${withdrawalId} already in terminal state (${withdrawalDoc.data()?.status}).`);
            return;
        }

        // --- Transaction to update status and potentially revert balance ---
        await adminDb.runTransaction(async (transaction) => {
            // Update withdrawal status
            transaction.update(withdrawalRef!, {
                status: 'failed',
                failureReason: failureReason,
                paystackTransferCode: paystackTransferCode,
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Revert balance (Use with caution - ensure idempotency)
            if (shouldRevertBalance && amount > 0) { 
                if (userRef) {
                    transaction.update(userRef, { 
                        availableBalance: FieldValue.increment(amount)
                    });
                    console.log(`Transfer Failed: Reverted KES ${amount} to user ${userId} balance.`);
                } else if (settingsRef) {
                    transaction.update(settingsRef, { 
                         totalPlatformFees: FieldValue.increment(amount)
                    });
                     console.log(`Transfer Failed: Reverted KES ${amount} to totalPlatformFees.`);
                }
            }
        });
         console.log(`Transfer Failed: Updated withdrawal record ${withdrawalId} to failed.`);

        // Send notification if applicable
        if (notificationUserId) {
            try {
                await createNotification({
                    userId: notificationUserId,
                    type: 'withdrawal_failed',
                    message: notificationMessage,
                    relatedWithdrawalId: withdrawalId 
                });
            } catch (notifyError) {
                console.error(`Transfer Failed: Failed to send notification for withdrawal ${withdrawalId}:`, notifyError);
            }
        }
    } catch (error) {
        console.error(`Transfer Failed: Error processing withdrawal ${withdrawalId}:`, error);
    }
}

// --- Helper: Process Transfer Reversed Event ---
async function handleTransferReversed(payload: any) {
     console.warn("Paystack Webhook: Processing transfer.reversed event (Logic similar to failed, needs implementation)...", payload);
      // Similar logic to handleTransferFailed, potentially reverting balance and updating status.
      // Important to ensure idempotency to avoid double-reverting.
}


// --- Main POST Handler ---
export async function POST(req: Request) {
    console.log("--- API POST /api/webhooks/paystack START ---");

    if (!PAYSTACK_SECRET_KEY || !adminDb) { // Also check adminDb
        console.error("Webhook Error: Paystack Secret Key or DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const signature = req.headers.get('x-paystack-signature');
    const bodyText = await req.text(); 

    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                       .update(bodyText)
                       .digest('hex');

    if (hash !== signature) {
        console.warn("Paystack Webhook Handler: Invalid signature.");
        return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }
    console.log("Paystack Webhook Handler: Signature verified.");

    const payload = JSON.parse(bodyText);
    const eventType = payload.event;
    console.log(`Paystack Webhook Handler: Processing event type: ${eventType}`);

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
                console.log(`Paystack Webhook Handler: Unhandled event type: ${eventType}`);
        }
        
        console.log(`--- API POST /api/webhooks/paystack SUCCESS --- Event '${eventType}' processed.`);
        return NextResponse.json({ received: true }, { status: 200 });
    
    } catch (error: any) {
         console.error(`--- API POST /api/webhooks/paystack FAILED processing event ${eventType} --- Error:`, error);
         return NextResponse.json({ message: 'Webhook processing error', error: error.message }, { status: 500 });
    }
}

// --- GET Handler (Method Not Allowed) ---
export async function GET(req: Request) {
    console.log("--- API GET /api/webhooks/paystack Received (Not Allowed) ---");
    return NextResponse.json({ message: "Webhook endpoint expects POST requests." }, { status: 405 });
}
