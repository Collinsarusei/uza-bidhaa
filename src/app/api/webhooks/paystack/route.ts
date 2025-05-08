// src/app/api/webhooks/paystack/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { Payment, UserProfile, Item } from '@/lib/types';
import { createNotification } from '@/lib/notifications';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Paystack Secret Key not set in environment variables.");
}

// --- Helper: Process Charge Success Event ---
async function handleChargeSuccess(payload: any) {
    console.log("Paystack Webhook: Processing charge.success event...", payload);
    
    // --- Use payment_id from metadata as the reliable document ID --- 
    const paymentId = payload?.data?.metadata?.payment_id; 
    const paystackReference = payload?.data?.reference; // Keep for logging/reference
    const paystackTransactionId = payload?.data?.id; 
    const amountPaidKobo = payload?.data?.amount;
    const paymentStatus = payload?.data?.status;

    if (!paymentId || !adminDb) {
        console.warn(`Charge Success Ignored: Missing payment_id in metadata or DB not init. Paystack Ref: ${paystackReference}`);
        return; // Cannot proceed without our internal payment ID
    }

    if (paymentStatus !== 'success') {
        console.warn(`Charge Success Ignored: Payment reference ${paystackReference} status is not 'success' (is '${paymentStatus}'). Payment ID: ${paymentId}`);
        // Optionally, update the payment record to 'failed' here if it was 'initiated'
        // const paymentRef = adminDb.collection('payments').doc(paymentId);
        // await paymentRef.update({ status: 'failed', failureReason: `Paystack reported status: ${paymentStatus}`, updatedAt: FieldValue.serverTimestamp() });
        return;
    }

    // --- Use paymentId (UUID) to find the Firestore document --- 
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

        // Idempotency check: If already processed, ignore.
        if (['paid_to_platform', 'released_to_seller_balance', 'failed', 'refunded'].includes(paymentData.status)) {
            console.log(`Charge Success Ignored: Payment ${paymentId} already in terminal state (${paymentData.status}). Paystack Ref: ${paystackReference}`);
            return;
        }

        // --- Perform Transaction to update Payment and Item --- 
        await adminDb.runTransaction(async (transaction) => {
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            // Update payment document
            transaction.update(paymentRef, {
                status: 'paid_to_platform',
                gatewayTransactionId: paystackTransactionId ? paystackTransactionId.toString() : null, // Store Paystack's ID
                updatedAt: FieldValue.serverTimestamp(),
            });
            // Update item document
            transaction.update(itemRef, {
                status: 'paid_escrow', // Mark item as paid
                updatedAt: FieldValue.serverTimestamp()
            });
        });
        console.log(`Charge Success: Updated payment ${paymentId} to paid_to_platform and item ${paymentData.itemId} to paid_escrow. Paystack Ref: ${paystackReference}`);

        // --- Send Notifications (Optional) ---
        try {
            // Notify Seller
            await createNotification({
                userId: paymentData.sellerId,
                type: 'item_sold',
                message: `Your item "${paymentData.itemTitle || 'Item'}" has been sold and payment is secured. Prepare for delivery/handover.`,
                relatedItemId: paymentData.itemId,
                relatedPaymentId: paymentId,
            });
             // Notify Buyer (Optional - maybe less necessary here, confirm receipt is more important)
            // await createNotification({
            //     userId: paymentData.buyerId,
            //     type: 'payment_received',
            //     message: `Your payment for "${paymentData.itemTitle || 'Item'}" was successful. Funds are held securely.`,
            //     relatedItemId: paymentData.itemId,
            //     relatedPaymentId: paymentId,
            // });
        } catch (notifyError) {
             console.error(`Charge Success: Failed to send notification for payment ${paymentId}:`, notifyError);
        }

    } catch (error) {
         console.error(`Charge Success Error processing paymentId ${paymentId} (Paystack Ref: ${paystackReference}):`, error);
         // Consider adding specific error handling or retry logic if needed
    }
}

// --- Helper: Process Transfer Success Event ---
async function handleTransferSuccess(payload: any) {
    // ... logic for successful payouts ...
    console.log("Paystack Webhook: Processing transfer.success event...", payload);
    const transferReference = payload?.data?.reference; // Your wdrl_... reference
    const withdrawalId = transferReference?.startsWith('wdrl_') ? transferReference.substring(5) : null;
    const paystackTransferCode = payload?.data?.transfer_code;

     if (!withdrawalId || !adminDb) {
         console.warn(`Transfer Success Ignored: Could not parse withdrawalId from reference ${transferReference} or DB not init.`);
         return;
     }
    // TODO: Find the user associated with this withdrawal to update their record
    // You might need to query the withdrawals collection across all users, or include userId in metadata/reference
    // For now, assuming withdrawals are stored under the user:
    // const withdrawalRef = adminDb.collectionGroup('withdrawals').where('id', '==', withdrawalId).limit(1);
    // const snapshot = await withdrawalRef.get(); 
     // ... find userRef and update withdrawal status to 'completed' ...
     console.log(`Transfer Success: Need to implement logic to find user and update withdrawal ${withdrawalId} to completed.`);
}

// --- Helper: Process Transfer Failed Event ---
async function handleTransferFailed(payload: any) {
    // ... logic for failed payouts ...
     console.log("Paystack Webhook: Processing transfer.failed event...", payload);
     const transferReference = payload?.data?.reference;
     const withdrawalId = transferReference?.startsWith('wdrl_') ? transferReference.substring(5) : null;
     const failureReason = payload?.data?.failure_reason || "Transfer failed without specific reason from Paystack";

     if (!withdrawalId || !adminDb) {
         console.warn(`Transfer Failed Ignored: Could not parse withdrawalId from reference ${transferReference} or DB not init.`);
         return;
     }
    // TODO: Find user and withdrawal record, update status to 'failed', maybe revert balance (carefully!)
     console.log(`Transfer Failed: Need to implement logic to find user and update withdrawal ${withdrawalId} to failed. Reason: ${failureReason}`);
}

// --- Helper: Process Transfer Reversed Event ---
async function handleTransferReversed(payload: any) {
    // ... logic for reversed payouts ...
     console.log("Paystack Webhook: Processing transfer.reversed event...", payload);
      const transferReference = payload?.data?.reference;
     const withdrawalId = transferReference?.startsWith('wdrl_') ? transferReference.substring(5) : null;
     // ... logic similar to failed, potentially reverting balance ...
     console.log(`Transfer Reversed: Need to implement logic for reversal of withdrawal ${withdrawalId}.`);
}


// --- Main POST Handler ---
export async function POST(req: Request) {
    console.log("--- API POST /api/webhooks/paystack START ---");

    if (!PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const signature = req.headers.get('x-paystack-signature');
    const bodyText = await req.text(); // Read body as text ONCE

    // Verify webhook signature
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                       .update(bodyText)
                       .digest('hex');

    if (hash !== signature) {
        console.warn("Paystack Webhook Handler: Invalid signature.");
        return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    }
    console.log("Paystack Webhook Handler: Signature verified.");

    // Parse the verified body
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
            // Add other events you want to handle (e.g., transfer.otp)
            default:
                console.log(`Paystack Webhook Handler: Unhandled event type: ${eventType}`);
        }
        
        console.log(`--- API POST /api/webhooks/paystack SUCCESS --- Event '${eventType}' processed.`);
        return NextResponse.json({ received: true }, { status: 200 });
    
    } catch (error: any) {
         console.error(`--- API POST /api/webhooks/paystack FAILED processing event ${eventType} --- Error:`, error);
         // Return 500 but don't necessarily ask Paystack to retry unless it's a transient issue
         return NextResponse.json({ message: 'Webhook processing error', error: error.message }, { status: 500 });
    }
}

// --- GET Handler (Method Not Allowed) ---
export async function GET(req: Request) {
    console.log("--- API GET /api/webhooks/paystack Received (Not Allowed) ---");
    return NextResponse.json({ message: "Webhook endpoint expects POST requests." }, { status: 405 });
}
