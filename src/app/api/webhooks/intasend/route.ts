// src/app/api/webhooks/intasend/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';
import { Earning } from '@/lib/types';

// --- Environment Variable Check --- 
const INTASEND_WEBHOOK_SECRET = process.env.INTASEND_WEBHOOK_SECRET;

if (!INTASEND_WEBHOOK_SECRET) {
    console.error("FATAL: Missing IntaSend Webhook Secret environment variable (INTASEND_WEBHOOK_SECRET) for unified webhook.");
}

// --- Helper: Process Payment Collection Event --- 
async function handlePaymentEvent(payload: any) {
    console.log("Webhook Handler: Processing Payment Event...", payload);
    const paymentStatus = payload.state || payload.status;
    const invoiceId = payload.invoice_id;
    const trackingId = payload.tracking_id;
    const apiRef = payload.api_ref; // Your internal paymentId
    const failureReason = payload.failure_reason || payload.error;

    if (!apiRef) {
        console.warn("Payment Event Ignored: Missing api_ref.");
        return; // Cannot process without internal ID
    }

    const paymentRef = adminDb!.collection('payments').doc(apiRef);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
        console.warn(`Payment Event Ignored: Payment record not found for api_ref: ${apiRef}`);
        return;
    }
    const paymentData = paymentDoc.data();
    if (!paymentData) {
        console.warn(`Payment Event Ignored: Payment data empty for api_ref: ${apiRef}`);
        return;
    }

    if (['paid_to_platform', 'released_to_seller_balance', 'failed', 'refunded'].includes(paymentData.status)) {
        console.log(`Payment Event Ignored: Payment ${apiRef} already in terminal state (${paymentData.status}).`);
        return;
    }

    if ((payload.event_name === 'checkout.complete' || payload.event_name === 'invoice.payment_received') && 
        (paymentStatus === 'COMPLETED' || paymentStatus === 'SUCCESSFUL')) {
        console.log(`Payment Event: SUCCESS for payment ${apiRef}.`);
        let itemTitle = 'Item';
        if (paymentData.itemId) {
            const itemDoc = await adminDb!.collection('items').doc(paymentData.itemId).get();
            if (itemDoc.exists) itemTitle = itemDoc.data()?.title || 'Item';
        }

        await adminDb!.runTransaction(async (transaction) => {
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            transaction.update(paymentRef, {
                status: 'paid_to_platform',
                intasendInvoiceId: invoiceId || paymentData.intasendInvoiceId,
                intasendTrackingId: trackingId,
                updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.update(itemRef, {
                status: 'paid_escrow',
                updatedAt: FieldValue.serverTimestamp()
            });
        });
        console.log(`Payment Event: Updated payment ${apiRef} to paid_to_platform and item ${paymentData.itemId} to paid_escrow.`);

        // Send Notifications (outside transaction is fine)
        try {
            await createNotification({ userId: paymentData.sellerId, type: 'payment_received', message: `Payment received for "${itemTitle}" and is held pending buyer confirmation.`, relatedItemId: paymentData.itemId, relatedPaymentId: apiRef });
            await createNotification({ userId: paymentData.buyerId, type: 'payment_received', message: `Your payment for "${itemTitle}" was successful.`, relatedItemId: paymentData.itemId, relatedPaymentId: apiRef });
            console.log(`Payment Event: Notifications sent for payment ${apiRef}.`);
        } catch (notifyError) {
            console.error(`Payment Event: Failed to send notifications for payment ${apiRef}:`, notifyError);
        }

    } else if (payload.event_name === 'checkout.failed' || paymentStatus === 'FAILED') {
        console.warn(`Payment Event: FAILED for payment ${apiRef}. Reason: ${failureReason}`);
        await paymentRef.update({
            status: 'failed',
            failureReason: failureReason || 'Unknown reason from IntaSend',
            intasendInvoiceId: invoiceId || paymentData.intasendInvoiceId,
            intasendTrackingId: trackingId,
            updatedAt: FieldValue.serverTimestamp(),
        });
    } else {
        console.log(`Payment Event: Received unhandled event type/status for payment ${apiRef}.`);
    }
}

// --- Helper: Process Send Money (Payout) Event --- 
async function handlePayoutEvent(payload: any) {
    console.log("Webhook Handler: Processing Payout Event...", payload);
    const trackingId = payload.tracking_id;
    const payoutStatus = payload.state || payload.status;
    const failureReason = payload.failure_reason || payload.error;

    if (!trackingId) {
        console.warn("Payout Event Ignored: Missing tracking_id.");
        return; 
    }

    const withdrawalsRef = adminDb!.collectionGroup('withdrawals');
    const withdrawalQuery = withdrawalsRef.where('intasendTransferId', '==', trackingId).limit(1);
    const snapshot = await withdrawalQuery.get();

    if (snapshot.empty) {
        console.warn(`Payout Event Ignored: Withdrawal record not found for IntaSend tracking_id: ${trackingId}`);
        return; 
    }

    const withdrawalDoc = snapshot.docs[0];
    const withdrawalRef = withdrawalDoc.ref;
    const withdrawalData = withdrawalDoc.data();
    const userId = withdrawalData.userId;
    const withdrawalId = withdrawalDoc.id;
    const withdrawalAmount = withdrawalData.amount;
    const userRef = adminDb!.collection('users').doc(userId);

    console.log(`Payout Event: Found withdrawal record ${withdrawalId} for user ${userId}.`);

    if (['completed', 'failed'].includes(withdrawalData.status)) {
        console.log(`Payout Event Ignored: Withdrawal ${withdrawalId} already in terminal state (${withdrawalData.status}).`);
        return; 
    }

    let notificationType: 'withdrawal_completed' | 'withdrawal_failed' | null = null;
    let notificationMessage = '';
    let finalStatus = withdrawalData.status;

    if (payoutStatus === 'COMPLETE' || payoutStatus === 'SUCCESSFUL') {
        console.log(`Payout Event: SUCCESS for withdrawal ${withdrawalId}.`);
        finalStatus = 'completed';
        await withdrawalRef.update({
            status: finalStatus,
            completedAt: FieldValue.serverTimestamp()
        });
        // TODO: Update related Earning statuses from 'withdrawal_pending' to 'withdrawn'
        notificationType = 'withdrawal_completed';
        notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} has been completed successfully.`;
    
    } else if (payoutStatus === 'FAILED') {
        console.warn(`Payout Event: FAILED for withdrawal ${withdrawalId}. Reason: ${failureReason}`);
        finalStatus = 'failed';
        console.log(`Payout Event: Attempting to revert balance/earnings for failed withdrawal ${withdrawalId}.`);
        try {
            await adminDb!.runTransaction(async (transaction) => {
                transaction.update(withdrawalRef, {
                    status: finalStatus,
                    failureReason: failureReason || 'Unknown failure reason from IntaSend'
                });
                transaction.update(userRef, {
                    availableBalance: FieldValue.increment(withdrawalAmount)
                });
                // TODO: Revert Earning statuses
            });
             console.log(`Payout Event: Balance/earnings reverted for failed withdrawal ${withdrawalId}.`);
        } catch(revertError) {
             console.error(`Payout Event: CRITICAL - Failed to revert balance for failed withdrawal ${withdrawalId}!`, revertError);
             // Consider adding monitoring/alerting here
        }
        notificationType = 'withdrawal_failed';
        notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} failed. Reason: ${failureReason || 'Unknown'}. The amount has been returned to your balance.`;
    
    } else {
        console.log(`Payout Event: Received non-terminal status '${payoutStatus}' for withdrawal ${withdrawalId}.`);
        finalStatus = 'processing';
        await withdrawalRef.update({ status: finalStatus });
    }

    if (notificationType && notificationMessage) {
        try {
            await createNotification({
                userId: userId,
                type: notificationType,
                message: notificationMessage,
                relatedWithdrawalId: withdrawalId
            });
             console.log(`Payout Event: Notification sent for withdrawal ${withdrawalId}.`);
        } catch (notifyError) {
            console.error(`Payout Event: Failed to send notification for ${withdrawalId}:`, notifyError);
        }
    }
}

// --- Main Webhook Handler (POST for events, GET maybe for challenge) --- 
export async function POST(req: NextRequest) {
    console.log("--- API POST /api/webhooks/intasend START ---");

    if (!adminDb) {
        console.error("Webhook Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
    }
    if (!INTASEND_WEBHOOK_SECRET) {
         console.error("Webhook Error: IntaSend Webhook Secret missing.");
        return NextResponse.json({ message: 'Webhook configuration error' }, { status: 500 });
    }

    let requestBody;
    try {
         requestBody = await req.text(); 
    } catch (err) {
        console.error("Webhook Error: Could not read request body.", err);
        return NextResponse.json({ message: 'Bad request' }, { status: 400 });
    }

    // --- Handle IntaSend Challenge (Commonly POST with challenge field) --- 
    try {
        const potentialChallenge = JSON.parse(requestBody);
        if (potentialChallenge && typeof potentialChallenge.challenge === 'string') {
            console.log("Webhook Handler: Responding to IntaSend challenge.");
            // Respond directly with the challenge value
            return NextResponse.json({ challenge: potentialChallenge.challenge });
            // Or as plain text if required by IntaSend:
            // return new Response(potentialChallenge.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } }); 
        }
    } catch (e) {
         // Not a JSON challenge payload, proceed to signature check
         console.log("Webhook Handler: Not a challenge payload, proceeding to signature check.");
    }
    // --- End Challenge Handling --- 

    try {
        // --- Verify Signature (using raw body) --- 
        const signature = req.headers.get('x-intasend-signature');
        if (!signature) {
            console.warn("Webhook Handler: Missing webhook signature.");
            return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
        }

        const hmac = crypto.createHmac('sha256', INTASEND_WEBHOOK_SECRET);
        const digest = Buffer.from(hmac.update(requestBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.warn("Webhook Handler: Invalid webhook signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }
        console.log("Webhook Handler: Signature verified.");

        // --- Process Verified Payload --- 
        const payload = JSON.parse(requestBody);
        const eventType = payload.event_name || payload.type; 
        console.log(`Webhook Handler: Processing event type: ${eventType}`);

        // --- Dispatch based on event type --- 
        // Add more specific event names from IntaSend docs if available
        if (eventType?.startsWith('checkout.') || eventType?.startsWith('invoice.')) {
             await handlePaymentEvent(payload);
        } else if (eventType?.startsWith('transfer.') || eventType === 'sendmoney.complete' || eventType === 'sendmoney.failed') { // Adjust based on actual send money event names
             await handlePayoutEvent(payload);
        } else {
             console.warn(`Webhook Handler: Received unhandled event type: ${eventType}`);
        }

        console.log("--- API POST /api/webhooks/intasend SUCCESS --- Event processed.");
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/webhooks/intasend FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to process webhook', error: error.message }, { status: 500 });
    }
}

// Optional: Handle GET request for challenge if IntaSend uses GET
export async function GET(req: NextRequest) {
    console.log("--- API GET /api/webhooks/intasend START ---");
    try {
        const { searchParams } = new URL(req.url);
        const challenge = searchParams.get('challenge');

        if (challenge) {
             console.log("Webhook Handler (GET): Responding to IntaSend challenge.");
             // Respond directly with the challenge value as plain text
             return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        } else {
             console.log("Webhook Handler (GET): No challenge parameter found.");
             return NextResponse.json({ message: 'GET request received, challenge parameter expected for verification.' }, { status: 400 });
        }
    } catch (error: any) {
         console.error("--- API GET /api/webhooks/intasend FAILED --- Error:", error);
         return NextResponse.json({ message: 'Failed to handle GET request', error: error.message }, { status: 500 });
    }
}
