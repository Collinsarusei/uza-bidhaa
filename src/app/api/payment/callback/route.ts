import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin'; // Import Firebase Admin
import { FieldValue } from 'firebase-admin/firestore'; // For Timestamps

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
const itemsCollection = adminDb.collection('items'); // Need this to update item status

// --- Intasend Secret Key ---
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;

export async function POST(req: Request) {
    console.log("Received Intasend callback request...");

    if (!INTASEND_SECRET_KEY) {
        console.error("Callback Error: INTASEND_SECRET_KEY is not configured.");
        return NextResponse.json({ message: 'Server configuration error: Secret key missing.' }, { status: 500 });
    }

    let rawBody; // Define rawBody outside try block to access in catch
    try {
        const signature = headers().get('X-Intasend-Signature');
        if (!signature) {
            console.warn("Callback Warning: Missing X-Intasend-Signature header.");
            return NextResponse.json({ message: 'Missing signature header' }, { status: 400 });
        }

        // --- Verify Signature ---
        rawBody = await req.text(); // Read raw body ONCE

        const hmac = crypto.createHmac('sha256', INTASEND_SECRET_KEY);
        const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.error("Callback Error: Invalid signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
        }

        console.log("Callback Signature Verified Successfully.");

        // Parse the verified body
        const payload = JSON.parse(rawBody);
        console.log("Intasend Callback Payload:", payload);

        const { invoice_id, status, tracking_id, state, metadata: metadataString } = payload;

        // --- Validate Payload ---
        if (!invoice_id) {
             console.error("Callback Error: Missing invoice_id in payload.");
             return NextResponse.json({ message: 'Missing invoice_id' }, { status: 400 });
        }

        // --- Find Payment Record in Firestore ---
        // Use the Intasend invoice ID to find our internal payment record
        const paymentQuery = paymentsCollection.where('intasendInvoiceId', '==', invoice_id).limit(1);
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            console.error(`Callback Error: Payment record not found in Firestore for Intasend invoice_id: ${invoice_id}`);
            // Return 200 OK to Intasend to prevent retries for a record we don't have, but log the issue.
            return NextResponse.json({ received: true, message: 'Payment record not found internally' }, { status: 200 });
        }

        const paymentDocRef = paymentSnapshot.docs[0].ref;
        const paymentData = paymentSnapshot.docs[0].data();
        const internalPaymentId = paymentData?.id; // Our internal payment ID

         // Parse metadata if available
         let metadata = null;
         try {
             if (metadataString) metadata = JSON.parse(metadataString);
         } catch (parseError) {
             console.warn(`Callback Warning: Could not parse metadata string: ${metadataString}`, parseError);
         }
         const itemId = metadata?.item_id; // Get item ID from metadata


        // --- Process the Callback based on Status ---
        // Use 'state' as primary status indicator if available, otherwise 'status'
        const finalStatus = state || status;
        let dbUpdateData: FirebaseFirestore.UpdateData = {
             updatedAt: FieldValue.serverTimestamp(),
             intasendTrackingId: tracking_id || null, // Store tracking ID if present
             lastCallbackStatus: finalStatus // Store the latest status received
        };
         let itemStatusUpdate = null;

        if (finalStatus === 'COMPLETE') {
            console.log(`Payment ${invoice_id} completed successfully.`);
            // Only update if current status is not already 'escrow' or beyond
             if (paymentData?.status === 'initiated') {
                 dbUpdateData.status = 'escrow'; // Update status to 'escrow'
                 // Update the corresponding item's status to 'paid_escrow'
                  if (itemId) {
                      itemStatusUpdate = itemsCollection.doc(itemId).update({ status: 'paid_escrow', updatedAt: FieldValue.serverTimestamp() });
                      console.log(`Callback: Queuing item ${itemId} status update to 'paid_escrow'.`);
                  } else {
                       console.warn(`Callback Warning: Item ID missing in metadata for invoice ${invoice_id}. Cannot update item status.`);
                  }
                 // TODO: Notify Seller
             } else {
                  console.log(`Callback Info: Payment ${internalPaymentId} (Invoice ${invoice_id}) already processed (status: ${paymentData?.status}). Ignoring COMPLETE callback.`);
             }

        } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED') {
             console.warn(`Payment ${invoice_id} failed or was cancelled. Status: ${finalStatus}`);
             // Only update if the payment wasn't already completed/failed
             if (paymentData?.status === 'initiated') {
                 dbUpdateData.status = finalStatus.toLowerCase(); // Update status to 'failed' or 'cancelled'
             } else {
                 console.log(`Callback Info: Payment ${internalPaymentId} (Invoice ${invoice_id}) already processed (status: ${paymentData?.status}). Ignoring ${finalStatus} callback.`);
             }
             // TODO: Consider notifying buyer/seller

        } else {
            console.log(`Received Intasend callback with unhandled status/state: ${finalStatus}. Acknowledging receipt.`);
        }

        // --- Perform Database Updates ---
         if (Object.keys(dbUpdateData).length > 2) { // Check if more than just timestamp and tracking ID were added
             console.log(`Callback: Updating payment ${internalPaymentId} with data:`, dbUpdateData);
             await paymentDocRef.update(dbUpdateData);
             if (itemStatusUpdate) {
                  await itemStatusUpdate; // Execute the item status update if queued
                  console.log(`Callback: Item ${itemId} status updated.`);
             }
              console.log(`Callback: Payment ${internalPaymentId} status updated successfully.`);
         }


        // --- Acknowledge Receipt ---
        console.log(`Acknowledging receipt for Intasend callback (Invoice ID: ${invoice_id}, Status: ${finalStatus}).`);
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error('Intasend Callback API Error:', error);
        if (error instanceof SyntaxError && rawBody) { // Check if rawBody was read
             console.error("Callback Error: Failed to parse request body as JSON. Body:", rawBody);
             return NextResponse.json({ message: 'Invalid request body format' }, { status: 400 });
        } else {
             console.error(`Unexpected Error: ${error.message}`);
        }
        // Return 500 for unexpected server errors to encourage retry,
        // but be mindful of potential retry loops if the error is persistent.
        return NextResponse.json({ message: 'Internal Server Error processing callback' }, { status: 500 });
    }
}
