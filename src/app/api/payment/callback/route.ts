// src/app/api/payment/callback/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto'; // For webhook signature verification

// --- Environment Variable Check --- 
const INTASEND_WEBHOOK_SECRET = process.env.INTASEND_WEBHOOK_SECRET;

if (!INTASEND_WEBHOOK_SECRET) {
    console.error("FATAL: Missing IntaSend Webhook Secret environment variable (INTASEND_WEBHOOK_SECRET).");
}

// --- POST Handler for IntaSend Webhook --- 
export async function POST(req: NextRequest) {
    console.log("--- API POST /api/payment/callback START ---");

    // --- FIX: Add Null Check --- 
    if (!adminDb) {
        console.error("Payment Callback Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
    }
    // --- End Fix ---
    if (!INTASEND_WEBHOOK_SECRET) {
         console.error("Payment Callback Error: IntaSend Webhook Secret missing.");
        return NextResponse.json({ message: 'Webhook configuration error' }, { status: 500 });
    }

    try {
        // --- Verify Webhook Signature --- 
        const signature = req.headers.get('x-intasend-signature');
        const requestBody = await req.text(); // Read body as text for verification

        if (!signature) {
            console.warn("Payment Callback: Missing webhook signature.");
            return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
        }

        const hmac = crypto.createHmac('sha256', INTASEND_WEBHOOK_SECRET);
        const digest = Buffer.from(hmac.update(requestBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.warn("Payment Callback: Invalid webhook signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }
        console.log("Payment Callback: Webhook signature verified.");

        // --- Process Webhook Payload --- 
        const payload = JSON.parse(requestBody); // Parse body after verification
        console.log("Payment Callback: Received payload:", payload);

        const eventType = payload.event_name || payload.type; 
        const paymentStatus = payload.state || payload.status;
        const invoiceId = payload.invoice_id;
        const trackingId = payload.tracking_id;
        const apiRef = payload.api_ref; 
        const failureReason = payload.failure_reason || payload.error;

        if (!apiRef) {
             console.warn("Payment Callback: Missing api_ref (internal payment ID) in webhook payload.");
             return NextResponse.json({ received: true, message: 'Missing api_ref' }, { status: 200 }); 
        }

        // --- Find and Update Payment Record --- 
        // FIX: Use non-null assertion
        const paymentRef = adminDb!.collection('payments').doc(apiRef);
        // --- End Fix ---
        const paymentDoc = await paymentRef.get();

        if (!paymentDoc.exists) {
             console.warn(`Payment Callback: Payment record not found for api_ref: ${apiRef}`);
             return NextResponse.json({ received: true, message: 'Payment record not found' }, { status: 200 }); 
        }
        const paymentData = paymentDoc.data();
        if (!paymentData) {
            console.warn(`Payment Callback: Payment data empty for api_ref: ${apiRef}`);
             return NextResponse.json({ received: true, message: 'Payment data empty' }, { status: 200 }); 
        }

        if (['paid_to_platform', 'released_to_seller_balance', 'failed', 'refunded'].includes(paymentData.status)) {
             console.log(`Payment Callback: Payment ${apiRef} already in terminal state (${paymentData.status}). Ignoring webhook.`);
             return NextResponse.json({ received: true, message: 'Already processed' }, { status: 200 }); 
        }

        // --- Handle Successful Payment --- 
        if ((eventType === 'checkout.complete' || eventType === 'invoice.payment_received') && (paymentStatus === 'COMPLETED' || paymentStatus === 'SUCCESSFUL')) {
             console.log(`Payment Callback: Successful payment received for payment ${apiRef}.`);
            
            let itemTitle = 'Item';
            if (paymentData.itemId) {
                 // FIX: Use non-null assertion
                const itemDoc = await adminDb!.collection('items').doc(paymentData.itemId).get();
                // --- End Fix ---
                if (itemDoc.exists) itemTitle = itemDoc.data()?.title || 'Item';
            }

            // Update Payment and Item status in a transaction
             // FIX: Use non-null assertion
            await adminDb!.runTransaction(async (transaction) => {
                 // FIX: Use non-null assertion
                 const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
                 // --- End Fix ---
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
             // --- End Fix ---
            console.log(`Payment Callback: Updated payment ${apiRef} to paid_to_platform and item ${paymentData.itemId} to paid_escrow.`);

            // Send Notifications
             try {
                 await createNotification({
                     userId: paymentData.sellerId,
                     type: 'payment_received',
                     message: `Payment received for "${itemTitle}" and is held pending buyer confirmation.`,
                     relatedItemId: paymentData.itemId,
                     relatedPaymentId: apiRef,
                 });
                  await createNotification({
                     userId: paymentData.buyerId,
                     type: 'payment_received',
                     message: `Your payment for "${itemTitle}" was successful.`,
                     relatedItemId: paymentData.itemId,
                     relatedPaymentId: apiRef,
                 });
                 console.log(`Payment Callback: Notifications sent for payment ${apiRef}.`);
             } catch (notifyError) {
                 console.error(`Payment Callback: Failed to send notifications for payment ${apiRef}:`, notifyError);
             }

        } 
        // --- Handle Failed Payment --- 
        else if (eventType === 'checkout.failed' || paymentStatus === 'FAILED') {
            console.warn(`Payment Callback: Payment failed/failed event received for payment ${apiRef}. Reason: ${failureReason}`);
             await paymentRef.update({
                 status: 'failed',
                 failureReason: failureReason || 'Unknown reason from IntaSend',
                 intasendInvoiceId: invoiceId || paymentData.intasendInvoiceId,
                 intasendTrackingId: trackingId,
                 updatedAt: FieldValue.serverTimestamp(),
             });
        } 
        // --- Handle Other Events (Optional) --- 
        else {
             console.log(`Payment Callback: Received unhandled event type '${eventType}' or status '${paymentStatus}' for payment ${apiRef}.`);
             if (trackingId && trackingId !== paymentData.intasendTrackingId) {
                 await paymentRef.update({ intasendTrackingId: trackingId, updatedAt: FieldValue.serverTimestamp() });
             }
        }

        console.log("--- API POST /api/payment/callback SUCCESS ---");
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payment/callback FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to process webhook', error: error.message }, { status: 500 });
    }
}
