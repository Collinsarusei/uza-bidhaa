import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, UpdateData } from 'firebase-admin/firestore'; // Correct import
import { createNotification } from '@/lib/notifications';
import type { Payment } from '@/lib/types'; // Import Payment type

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
const itemsCollection = adminDb.collection('items');

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
        const signature = (await headers()).get('X-Intasend-Signature');
        if (!signature) {
            console.warn("Payout Callback Warning: Missing X-Intasend-Signature header.");
            return NextResponse.json({ message: 'Missing signature header' }, { status: 400 });
        }

        rawBody = await req.text();
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

        const { transaction_id, status, state, failure_code, failure_reason, reference, amount, currency } = payload;
        const paymentIdentifier = transaction_id || reference;

        if (!paymentIdentifier) {
             console.error("Payout Callback Error: Missing transaction_id or reference in payload.");
             return NextResponse.json({ message: 'Missing payment identifier in callback' }, { status: 400 });
        }

        const paymentQuery = paymentsCollection.where('intasendPayoutId', '==', paymentIdentifier).limit(1);
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            console.error(`Payout Callback Error: Payment record not found in Firestore for Intasend Payout ID/Reference: ${paymentIdentifier}`);
            return NextResponse.json({ received: true, message: 'Payment record not found internally for this payout' }, { status: 200 });
        }

        const paymentDocRef = paymentSnapshot.docs[0].ref;
        const paymentData = paymentSnapshot.docs[0].data() as Payment; // Cast to Payment
        const internalPaymentId = paymentData?.id;
        const sellerId = paymentData?.sellerId;
        const itemId = paymentData?.itemId;

        const finalStatus = state || status;
        // Corrected: Added <Payment> type argument to UpdateData
        let dbUpdateData: UpdateData<Payment> = {
            payoutLastCallbackStatus: finalStatus,
            payoutFailureReason: failure_reason || failure_code || null,
            updatedAt: FieldValue.serverTimestamp()
        };
         let notificationPromise: Promise<any> | null = null;
         let statusChanged = false;

        if (finalStatus === 'COMPLETE') {
            console.log(`Payout ${paymentIdentifier} completed successfully for payment ${internalPaymentId}.`);
             if (paymentData?.status !== 'released') {
                dbUpdateData.status = 'released';
                statusChanged = true;
                if (sellerId && itemId) {
                    notificationPromise = itemsCollection.doc(itemId).get().then(itemDoc => {
                         // Corrected: Use itemDoc.exists property, not function
                         const itemTitle = itemDoc.exists ? itemDoc.data()?.title : 'your item';
                         const paymentAmount = amount || paymentData?.amount;
                         const paymentCurrency = currency || paymentData?.currency || 'KES';
                         return createNotification({
                             userId: sellerId,
                             type: 'payment_released',
                             message: `Funds (${paymentCurrency} ${paymentAmount}) for "${itemTitle}" have been successfully sent to your account.`,
                             relatedItemId: itemId,
                         });
                    }).catch(err => console.error("Error creating payout success notification:", err));
                }
             } else {
                 console.log(`Payout Callback Info: Payment ${internalPaymentId} already marked as 'released'. Ignoring COMPLETE callback.`);
             }

        } else if (finalStatus === 'FAILED') {
            console.warn(`Payout ${paymentIdentifier} failed for payment ${internalPaymentId}. Status: ${finalStatus}, Reason: ${dbUpdateData.payoutFailureReason}`);
             if (paymentData?.status !== 'payout_failed') {
                 dbUpdateData.status = 'payout_failed';
                 statusChanged = true;
                  if (sellerId && itemId) {
                      notificationPromise = itemsCollection.doc(itemId).get().then(itemDoc => {
                           // Corrected: Use itemDoc.exists property, not function
                           const itemTitle = itemDoc.exists ? itemDoc.data()?.title : 'your item';
                           return createNotification({
                               userId: sellerId,
                               type: 'unusual_activity',
                               message: `Payout for "${itemTitle}" failed. Reason: ${dbUpdateData.payoutFailureReason || 'Unknown'}. Please check your payout details or contact support.`,
                               relatedItemId: itemId,
                           });
                      }).catch(err => console.error("Error creating payout failure notification:", err));
                  }
             } else {
                  console.log(`Payout Callback Info: Payment ${internalPaymentId} already marked as 'payout_failed'. Ignoring FAILED callback.`);
             }

        } else {
            console.log(`Received Intasend payout callback for ${internalPaymentId} with unhandled status/state: ${finalStatus}. Acknowledging receipt.`);
        }

        if (statusChanged) {
            console.log(`Payout Callback: Updating payment ${internalPaymentId} with data:`, dbUpdateData);
            const updatePromises = [paymentDocRef.update(dbUpdateData)];
            if (notificationPromise) updatePromises.push(notificationPromise);

            await Promise.all(updatePromises);
            console.log(`Payout Callback: Payment ${internalPaymentId} status and notification processed.`);
        } else {
            await paymentDocRef.update({
                payoutLastCallbackStatus: dbUpdateData.payoutLastCallbackStatus,
                payoutFailureReason: dbUpdateData.payoutFailureReason,
                updatedAt: dbUpdateData.updatedAt
            });
        }

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
