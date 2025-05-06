// src/app/api/webhooks/paystack/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';
import { Earning, Payment } from '@/lib/types'; // Ensure Payment type is updated

// --- Environment Variable Checks ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
// You can set a webhook secret in Paystack dashboard for extra security, then verify it.
// For now, we'll use the primary API secret key for HMAC verification.

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}

// --- Helper: Process Charge Success Event ---
async function handleChargeSuccess(payload: any) {
    console.log("Paystack Webhook: Processing charge.success event...", payload);
    const paymentReference = payload.data.reference; // This is YOUR reference (paymentId)
    const paystackTransactionId = payload.data.id; // Paystack's internal transaction ID
    const amountPaidKobo = payload.data.amount;
    const amountPaidKES = amountPaidKobo / 100; // Convert back to KES
    const paymentStatus = payload.data.status; // Should be 'success'

    if (!paymentReference || !adminDb) {
        console.warn("Charge Success Ignored: Missing reference or DB not init.");
        return;
    }

    if (paymentStatus !== 'success') {
        console.warn(`Charge Success Ignored: Payment reference ${paymentReference} status is not 'success' (is '${paymentStatus}').`);
        return;
    }

    const paymentRef = adminDb.collection('payments').doc(paymentReference);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
        console.warn(`Charge Success Ignored: Payment record not found for reference: ${paymentReference}`);
        return;
    }
    const paymentData = paymentDoc.data() as Payment;
    if (!paymentData) {
        console.warn(`Charge Success Ignored: Payment data empty for reference: ${paymentReference}`);
        return;
    }

    if (['paid_to_platform', 'released_to_seller_balance', 'failed', 'refunded'].includes(paymentData.status)) {
        console.log(`Charge Success Ignored: Payment ${paymentReference} already in terminal state (${paymentData.status}).`);
        return;
    }

    // Verify amount (optional but good practice)
    if (Math.round(paymentData.amount * 100) !== amountPaidKobo) {
        console.warn(`Charge Success Warning: Amount mismatch for payment ${paymentReference}. Expected ${paymentData.amount * 100} Kobo, got ${amountPaidKobo} Kobo.`);
        // Decide how to handle: log, flag for review, or proceed if minor diff
    }

    console.log(`Charge Success: Successful payment received for payment ${paymentReference}.`);
    let itemTitle = 'Item';
    if (paymentData.itemId) {
        const itemDoc = await adminDb.collection('items').doc(paymentData.itemId).get();
        if (itemDoc.exists) itemTitle = itemDoc.data()?.title || 'Item';
    }

    await adminDb.runTransaction(async (transaction) => {
        const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
        transaction.update(paymentRef, {
            status: 'paid_to_platform',
            gatewayTransactionId: paystackTransactionId.toString(), // Store Paystack's ID
            updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(itemRef, {
            status: 'paid_escrow',
            updatedAt: FieldValue.serverTimestamp()
        });
    });
    console.log(`Charge Success: Updated payment ${paymentReference} to paid_to_platform and item ${paymentData.itemId} to paid_escrow.`);

    try {
        await createNotification({ userId: paymentData.sellerId, type: 'payment_received', message: `Payment received for "${itemTitle}" and is held pending buyer confirmation.`, relatedItemId: paymentData.itemId, relatedPaymentId: paymentReference });
        await createNotification({ userId: paymentData.buyerId, type: 'payment_received', message: `Your payment for "${itemTitle}" was successful.`, relatedItemId: paymentData.itemId, relatedPaymentId: paymentReference });
        console.log(`Charge Success: Notifications sent for payment ${paymentReference}.`);
    } catch (notifyError) {
        console.error(`Charge Success: Failed to send notifications for payment ${paymentReference}:`, notifyError);
    }
}

// --- Helper: Process Transfer (Payout) Event ---
async function handleTransferEvent(payload: any) {
    console.log("Paystack Webhook: Processing transfer event...", payload);
    const transferCode = payload.data.transfer_code; // Paystack's transfer code
    const transferStatus = payload.data.status; // e.g., 'success', 'failed', 'reversed'
    const internalWithdrawalReference = payload.data.reference; // YOUR reference for the withdrawal
    // Paystack might also send the recipient_code and other details

    if (!internalWithdrawalReference || !adminDb) { // If you used a reference when initiating transfer
        console.warn("Transfer Event Ignored: Missing reference or DB not init.");
        return;
    }

    // Query your withdrawals collection using the 'internalWithdrawalReference'
    // This reference should have been set when you initiated the transfer (payout)
    const withdrawalsRef = adminDb.collectionGroup('withdrawals');
    const withdrawalQuery = withdrawalsRef.where('paystackTransferReference', '==', internalWithdrawalReference).limit(1);
    // Or if you store transfer_code: .where('paystackTransferCode', '==', transferCode)
    const snapshot = await withdrawalQuery.get();

    if (snapshot.empty) {
        console.warn(`Transfer Event Ignored: Withdrawal record not found for Paystack reference: ${internalWithdrawalReference}`);
        return;
    }

    const withdrawalDoc = snapshot.docs[0];
    const withdrawalRef = withdrawalDoc.ref;
    const withdrawalData = withdrawalDoc.data();
    const userId = withdrawalData.userId;
    const withdrawalId = withdrawalDoc.id; // Your internal withdrawal ID
    const withdrawalAmount = withdrawalData.amount;
    const userRef = adminDb.collection('users').doc(userId);

    console.log(`Transfer Event: Found withdrawal record ${withdrawalId} for user ${userId}. Paystack status: ${transferStatus}`);

    if (['completed', 'failed'].includes(withdrawalData.status) && withdrawalData.paystackTransferCode === transferCode) {
        console.log(`Transfer Event Ignored: Withdrawal ${withdrawalId} already in terminal state (${withdrawalData.status}) for this transfer_code.`);
        return;
    }

    let notificationType: 'withdrawal_completed' | 'withdrawal_failed' | null = null;
    let notificationMessage = '';

    if (transferStatus === 'success') {
        console.log(`Transfer Event: SUCCESS for withdrawal ${withdrawalId}.`);
        await withdrawalRef.update({
            status: 'completed',
            paystackTransferCode: transferCode, // Store Paystack's transfer code
            completedAt: FieldValue.serverTimestamp(),
            failureReason: FieldValue.delete() // Clear any previous failure reason
        });
        notificationType = 'withdrawal_completed';
        notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} has been completed successfully.`;

    } else if (transferStatus === 'failed' || transferStatus === 'reversed') {
        const failureReason = payload.data.reason || 'Transfer failed or was reversed by Paystack.';
        console.warn(`Transfer Event: FAILED/REVERSED for withdrawal ${withdrawalId}. Reason: ${failureReason}`);
        
        // Only revert balance if this is the first failure/reversal for this specific transfer attempt
        if (withdrawalData.status !== 'failed' || withdrawalData.paystackTransferCode !== transferCode) {
            console.log(`Transfer Event: Attempting to revert balance/earnings for failed withdrawal ${withdrawalId}.`);
            try {
                await adminDb.runTransaction(async (transaction) => {
                    transaction.update(withdrawalRef, {
                        status: 'failed',
                        paystackTransferCode: transferCode,
                        failureReason: failureReason,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    // Increment user's availableBalance
                    transaction.update(userRef, {
                        availableBalance: FieldValue.increment(withdrawalAmount)
                    });
                    // TODO: Revert Earning statuses if applicable
                });
                console.log(`Transfer Event: Balance/earnings reverted for failed withdrawal ${withdrawalId}.`);
            } catch (revertError) {
                console.error(`Transfer Event: CRITICAL - Failed to revert balance for failed withdrawal ${withdrawalId}!`, revertError);
            }
        } else {
             console.log(`Transfer Event: Withdrawal ${withdrawalId} already marked as failed for this transfer. No balance reversion.`);
        }
        notificationType = 'withdrawal_failed';
        notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} failed. Reason: ${failureReason}. The amount has been returned to your balance.`;

    } else {
        // e.g., pending, processing by Paystack
        console.log(`Transfer Event: Received non-terminal status '${transferStatus}' for withdrawal ${withdrawalId}.`);
        await withdrawalRef.update({ 
            status: 'processing', // Or map Paystack statuses if needed
            paystackTransferCode: transferCode,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    if (notificationType && notificationMessage) {
        try {
            await createNotification({
                userId: userId,
                type: notificationType,
                message: notificationMessage,
                relatedWithdrawalId: withdrawalId
            });
             console.log(`Transfer Event: Notification sent for withdrawal ${withdrawalId}.`);
        } catch (notifyError) {
            console.error(`Transfer Event: Failed to send notification for ${withdrawalId}:`, notifyError);
        }
    }
}

// --- Main Webhook Handler ---
export async function POST(req: NextRequest) {
    console.log("--- API POST /api/webhooks/paystack START ---");

    if (!adminDb) {
        console.error("Paystack Webhook Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
    }
    if (!PAYSTACK_SECRET_KEY) {
         console.error("Paystack Webhook Error: Paystack Secret Key missing.");
        return NextResponse.json({ message: 'Webhook configuration error' }, { status: 500 });
    }

    let requestBodyText;
    try {
         requestBodyText = await req.text();
    } catch (err) {
        console.error("Paystack Webhook Error: Could not read request body.", err);
        return NextResponse.json({ message: 'Bad request' }, { status: 400 });
    }

    try {
        // --- Verify Signature (using raw body text) ---
        const signature = req.headers.get('x-paystack-signature');
        if (!signature) {
            console.warn("Paystack Webhook Handler: Missing webhook signature.");
            return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
        }

        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                           .update(requestBodyText)
                           .digest('hex');

        if (hash !== signature) {
            console.warn("Paystack Webhook Handler: Invalid webhook signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }
        console.log("Paystack Webhook Handler: Signature verified.");

        // --- Process Verified Payload ---
        const payload = JSON.parse(requestBodyText);
        const eventType = payload.event; // Paystack event type (e.g., 'charge.success')
        console.log(`Paystack Webhook Handler: Processing event type: ${eventType}`);

        // --- Dispatch based on event type ---
        if (eventType === 'charge.success') {
             await handleChargeSuccess(payload);
        } else if (eventType === 'transfer.success' || eventType === 'transfer.failed' || eventType === 'transfer.reversed') {
             await handleTransferEvent(payload);
        }
        // Add other event types if needed (e.g., 'subscription.create', 'invoice.update')
        else {
             console.warn(`Paystack Webhook Handler: Received unhandled event type: ${eventType}`);
        }

        console.log(`--- API POST /api/webhooks/paystack SUCCESS --- Event '${eventType}' processed.`);
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API POST /api/webhooks/paystack FAILED (Event: ${JSON.parse(requestBodyText || '{}').event || 'unknown'}) --- Error processing event:`, error);
        return NextResponse.json({ message: 'Failed to process webhook', error: error.message }, { status: 500 });
    }
}

// Paystack webhook verification does not typically use a GET challenge.
export async function GET(req: NextRequest) {
    console.log("--- API GET /api/webhooks/paystack Received --- (Should be POST)");
    return NextResponse.json({ message: 'Webhook endpoint expects POST requests.' }, { status: 405 });
}