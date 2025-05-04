import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, UpdateData } from 'firebase-admin/firestore'; // Import UpdateData
import { createNotification } from '@/lib/notifications';
import type { Payment } from '@/lib/types'; // Import the Payment type

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
const itemsCollection = adminDb.collection('items');
const usersCollection = adminDb.collection('users');

// --- Intasend Secret Key ---
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;

export async function POST(req: Request) {
    console.log("Received Intasend callback request...");

    if (!INTASEND_SECRET_KEY) {
        console.error("Callback Error: INTASEND_SECRET_KEY is not configured.");
        return NextResponse.json({ message: 'Server configuration error: Secret key missing.' }, { status: 500 });
    }

    let rawBody;
    try {
        const signature = (await headers()).get('X-Intasend-Signature');
        if (!signature) {
            console.warn("Callback Warning: Missing X-Intasend-Signature header.");
            return NextResponse.json({ message: 'Missing signature header' }, { status: 400 });
        }

        rawBody = await req.text();
        const hmac = crypto.createHmac('sha256', INTASEND_SECRET_KEY);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.error("Callback Error: Invalid signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
        }

        console.log("Callback Signature Verified Successfully.");
        const payload = JSON.parse(rawBody);
        console.log("Intasend Callback Payload:", payload);

        const { invoice_id, status, tracking_id, state, metadata: metadataString } = payload;

        if (!invoice_id) {
             console.error("Callback Error: Missing invoice_id in payload.");
             return NextResponse.json({ message: 'Missing invoice_id' }, { status: 400 });
        }

        const paymentQuery = paymentsCollection.where('intasendInvoiceId', '==', invoice_id).limit(1);
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            console.error(`Callback Error: Payment record not found in Firestore for Intasend invoice_id: ${invoice_id}`);
            return NextResponse.json({ received: true, message: 'Payment record not found internally' }, { status: 200 });
        }

        const paymentDocRef = paymentSnapshot.docs[0].ref;
        const paymentData = paymentSnapshot.docs[0].data() as Payment; // Cast to Payment type
        const internalPaymentId = paymentData?.id;

         let metadata = null;
         try {
             if (metadataString) metadata = JSON.parse(metadataString);
         } catch (parseError) {
             console.warn(`Callback Warning: Could not parse metadata string: ${metadataString}`, parseError);
         }
         const itemId = metadata?.item_id;
         const buyerId = metadata?.buyer_id;
         const buyerName = metadata?.buyer_name || 'A buyer';

        const finalStatus = state || status;
        // Use UpdateData<Payment> here
        let dbUpdateData: UpdateData<Payment> = {
             updatedAt: FieldValue.serverTimestamp(),
             intasendTrackingId: tracking_id || null,
             lastCallbackStatus: finalStatus
        };
         let itemStatusUpdatePromise: Promise<any> | null = null;
         let notificationPromise: Promise<any> | null = null;
         let statusChanged = false; // Flag to track if the core status needs updating

        if (finalStatus === 'COMPLETE') {
            console.log(`Payment ${invoice_id} completed successfully.`);
             if (paymentData?.status === 'initiated') {
                 dbUpdateData.status = 'escrow'; // Update status to 'escrow'
                 statusChanged = true;
                 if (itemId) {
                      const itemRef = itemsCollection.doc(itemId);
                      itemStatusUpdatePromise = itemRef.update({ status: 'paid_escrow', updatedAt: FieldValue.serverTimestamp() });
                      console.log(`Callback: Queuing item ${itemId} status update to 'paid_escrow'.`);

                      notificationPromise = itemRef.get().then(itemDoc => {
                          if (itemDoc.exists) {
                              const itemData = itemDoc.data();
                              const sellerId = itemData?.sellerId;
                              const itemTitle = itemData?.title || 'your item';
                              if (sellerId) {
                                  return createNotification({
                                      userId: sellerId,
                                      type: 'payment_received',
                                      message: `${buyerName} has paid for "${itemTitle}". Funds are held in escrow.`,
                                      relatedItemId: itemId,
                                      relatedUserId: buyerId
                                  });
                              } else {
                                  console.error(`Callback Error: Seller ID not found on item ${itemId}. Cannot notify seller.`);
                              }
                          } else {
                              console.error(`Callback Error: Item ${itemId} not found after payment completion. Cannot notify seller.`);
                          }
                      }).catch(err => {
                          console.error(`Callback Error: Failed to fetch item ${itemId} to notify seller:`, err);
                      });
                  } else {
                       console.warn(`Callback Warning: Item ID missing in metadata for invoice ${invoice_id}. Cannot update item status or notify seller.`);
                  }
             } else {
                  console.log(`Callback Info: Payment ${internalPaymentId} (Invoice ${invoice_id}) already processed (status: ${paymentData?.status}). Ignoring COMPLETE callback.`);
             }

        } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED') {
             console.warn(`Payment ${invoice_id} failed or was cancelled. Status: ${finalStatus}`);
             if (paymentData?.status === 'initiated') {
                 // Ensure the status matches the Payment type enum
                 dbUpdateData.status = finalStatus.toLowerCase() as Payment['status'];
                 statusChanged = true;
                 // Optionally notify seller/buyer of failure
             } else {
                 console.log(`Callback Info: Payment ${internalPaymentId} (Invoice ${invoice_id}) already processed (status: ${paymentData?.status}). Ignoring ${finalStatus} callback.`);
             }

        } else {
            console.log(`Received Intasend callback with unhandled status/state: ${finalStatus}. Acknowledging receipt.`);
        }

        // --- Perform Database Updates & Notification ---
         if (statusChanged) { // Only perform major update if status changed
             console.log(`Callback: Updating payment ${internalPaymentId} with data:`, dbUpdateData);
             const updatePromises = [paymentDocRef.update(dbUpdateData)];
             if (itemStatusUpdatePromise) updatePromises.push(itemStatusUpdatePromise);
             if (notificationPromise) updatePromises.push(notificationPromise);

             await Promise.all(updatePromises);
             console.log(`Callback: Payment ${internalPaymentId} and related updates processed successfully.`);
         } else {
             // Only update tracking/status fields if main status didn't change
             await paymentDocRef.update({
                 updatedAt: dbUpdateData.updatedAt,
                 intasendTrackingId: dbUpdateData.intasendTrackingId,
                 lastCallbackStatus: dbUpdateData.lastCallbackStatus
             });
             console.log(`Callback: Updated tracking details for payment ${internalPaymentId}.`);
         }

        console.log(`Acknowledging receipt for Intasend callback (Invoice ID: ${invoice_id}, Status: ${finalStatus}).`);
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error('Intasend Callback API Error:', error);
        if (error instanceof SyntaxError && rawBody) {
             console.error("Callback Error: Failed to parse request body as JSON. Body:", rawBody);
             return NextResponse.json({ message: 'Invalid request body format' }, { status: 400 });
        } else {
             console.error(`Unexpected Error: ${error.message}`);
        }
        return NextResponse.json({ message: 'Internal Server Error processing callback' }, { status: 500 });
    }
}
