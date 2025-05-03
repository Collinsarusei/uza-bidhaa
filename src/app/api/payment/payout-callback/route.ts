import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin'; // Import Firebase Admin
import { FieldValue } from 'firebase-admin/firestore'; // For Timestamps

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
// We might need itemsCollection if payout failure requires reverting item status
// const itemsCollection = adminDb.collection('items');

// --- Intasend Secret Key ---
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;

export async function POST(req: Request) {
    console.log("Received Intasend Payout callback request...");

    if (!INTASEND_SECRET_KEY) {
        console.error("Payout Callback Error: INTASEND_SECRET_KEY is not configured.");
        return NextResponse.json({ message: 'Server configuration error: Secret key missing.' }, { status: 500 });
    }

    let rawBody;
    try {
        const signature = headers().get('X-Intasend-Signature');
        if (!signature) {
            console.warn("Payout Callback Warning: Missing X-Intasend-Signature header.");
            return NextResponse.json({ message: 'Missing signature header' }, { status: 400 });
        }

        // --- Verify Signature ---
        rawBody = await req.text(); // Read raw body ONCE

        const hmac = crypto.createHmac('sha256', INTASEND_SECRET_KEY);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.error("Payout Callback Error: Invalid signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
        }

        console.log("Payout Callback Signature Verified Successfully.");

        const payload = JSON.parse(rawBody);
        console.log("Intasend Payout Callback Payload:", payload);

        // Extract relevant details (adjust based on actual Intasend Payout webhook payload)
        // Common fields: transaction_id, status, state, failure_code, failure_reason, reference, amount, currency, name, account
        const { transaction_id, status, state, failure_code, failure_reason, reference } = payload;

        // --- Find Payment Record in Firestore ---
        // Use the Intasend Payout Transaction ID (or reference) to find our internal payment record.
        // We stored this ID in the 'intasendPayoutId' field during the release step.
        const paymentIdentifier = transaction_id || reference; // Use transaction_id if present

        if (!paymentIdentifier) {
             console.error("Payout Callback Error: Missing transaction_id or reference in payload.");
             return NextResponse.json({ message: 'Missing payment identifier in callback' }, { status: 400 });
        }

        const paymentQuery = paymentsCollection.where('intasendPayoutId', '==', paymentIdentifier).limit(1);
        // Alternative: If you passed paymentId in callback_url, parse it from the URL.
        // Or use the `reference` field if it uniquely identifies your payment record.

        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            console.error(`Payout Callback Error: Payment record not found in Firestore for Intasend Payout ID/Reference: ${paymentIdentifier}`);
            // Return 200 OK to Intasend to prevent retries
            return NextResponse.json({ received: true, message: 'Payment record not found internally for this payout' }, { status: 200 });
        }

        const paymentDocRef = paymentSnapshot.docs[0].ref;
        const paymentData = paymentSnapshot.docs[0].data();
        const internalPaymentId = paymentData?.id; // Our internal payment ID

        // --- Process the Callback based on Payout Status ---
        const finalStatus = state || status; // Use 'state' if available
        let dbUpdateData: FirebaseFirestore.UpdateData = {
            payoutLastCallbackStatus: finalStatus, // Store the latest payout status
            payoutFailureReason: failure_reason || failure_code || null, // Store failure reason if present
            updatedAt: FieldValue.serverTimestamp()
        };
         let notificationNeeded = false;

        // Intasend payout statuses might include: ACKNOWLEDGED, PROCESSING, COMPLETE, FAILED
        if (finalStatus === 'COMPLETE') {
            console.log(`Payout ${paymentIdentifier} completed successfully for payment ${internalPaymentId}.`);
             // Only update if not already marked as released
             if (paymentData?.status !== 'released') {
                dbUpdateData.status = 'released'; // Mark payment as fully released
                 notificationNeeded = true; // Notify seller on success
             } else {
                 console.log(`Payout Callback Info: Payment ${internalPaymentId} already marked as 'released'. Ignoring COMPLETE callback.`);
             }

        } else if (finalStatus === 'FAILED') {
            console.warn(`Payout ${paymentIdentifier} failed for payment ${internalPaymentId}. Status: ${finalStatus}, Reason: ${dbUpdateData.payoutFailureReason}`);
             // Only update if not already marked as failed
             if (paymentData?.status !== 'payout_failed') {
                 dbUpdateData.status = 'payout_failed'; // Mark payment as failed payout
                 notificationNeeded = true; // Notify admin/seller on failure
                 // Consider: Should the item status be reverted from 'sold'? Depends on business logic.
             } else {
                  console.log(`Payout Callback Info: Payment ${internalPaymentId} already marked as 'payout_failed'. Ignoring FAILED callback.`);
             }

        } else {
            console.log(`Received Intasend payout callback for ${internalPaymentId} with unhandled status/state: ${finalStatus}. Acknowledging receipt.`);
            // Statuses like ACKNOWLEDGED, PROCESSING usually don't require a DB status change here,
            // but you might log them or update a 'last checked' timestamp.
        }

        // --- Perform Database Update ---
         if (dbUpdateData.status) { // Only update if status changed
             console.log(`Payout Callback: Updating payment ${internalPaymentId} with data:`, dbUpdateData);
             await paymentDocRef.update(dbUpdateData);
             console.log(`Payout Callback: Payment ${internalPaymentId} status updated successfully.`);

             // --- Trigger Notifications (Optional) ---
             if (notificationNeeded) {
                 if (dbUpdateData.status === 'released') {
                     console.log(`Simulating notification to seller ${paymentData?.sellerId} about successful payout for payment ${internalPaymentId}.`);
                 } else if (dbUpdateData.status === 'payout_failed') {
                     console.log(`Simulating notification to admin/seller ${paymentData?.sellerId} about failed payout for payment ${internalPaymentId}. Reason: ${dbUpdateData.payoutFailureReason}`);
                 }
             }
         }

        // --- Acknowledge Receipt ---
        console.log(`Acknowledging receipt for Intasend Payout callback (ID: ${paymentIdentifier}, Status: ${finalStatus}).`);
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error('Intasend Payout Callback API Error:', error);
        if (error instanceof SyntaxError && rawBody) {
             console.error("Payout Callback Error: Failed to parse request body as JSON. Body:", rawBody);
             return NextResponse.json({ message: 'Invalid request body format' }, { status: 400 });
        } else {
             console.error(`Unexpected Error: ${error.message}`);
        }
        return NextResponse.json({ message: 'Internal Server Error processing payout callback' }, { status: 500 });
    }
}
