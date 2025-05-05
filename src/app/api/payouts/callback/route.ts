// src/app/api/payouts/callback/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';

// --- Environment Variable Check --- 
const INTASEND_WEBHOOK_SECRET = process.env.INTASEND_WEBHOOK_SECRET;

if (!INTASEND_WEBHOOK_SECRET) {
    console.error("FATAL: Missing IntaSend Webhook Secret environment variable (INTASEND_WEBHOOK_SECRET).");
}

// --- POST Handler for IntaSend Payout Webhook --- 
export async function POST(req: NextRequest) {
    console.log("--- API POST /api/payouts/callback START ---");

    if (!adminDb) {
        console.error("Payout Callback Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error' }, { status: 500 });
    }
    if (!INTASEND_WEBHOOK_SECRET) {
         console.error("Payout Callback Error: IntaSend Webhook Secret missing.");
        return NextResponse.json({ message: 'Webhook configuration error' }, { status: 500 });
    }

    try {
        // --- Verify Webhook Signature --- 
        const signature = req.headers.get('x-intasend-signature');
        const requestBody = await req.text(); 

        if (!signature) {
            console.warn("Payout Callback: Missing webhook signature.");
            return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
        }

        const hmac = crypto.createHmac('sha256', INTASEND_WEBHOOK_SECRET);
        const digest = Buffer.from(hmac.update(requestBody).digest('hex'), 'utf8');
        const checksum = Buffer.from(signature, 'utf8');

        if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
            console.warn("Payout Callback: Invalid webhook signature.");
            return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
        }
        console.log("Payout Callback: Webhook signature verified.");

        // --- Process Webhook Payload --- 
        const payload = JSON.parse(requestBody);
        console.log("Payout Callback: Received payload:", payload);

        // Identify Send Money events (structure might vary slightly)
        const eventType = payload.event_name || payload.type; 
        const trackingId = payload.tracking_id; // IntaSend ID for the transfer
        const payoutStatus = payload.state || payload.status; // e.g., SUCCESSFUL, FAILED
        const failureReason = payload.failure_reason || payload.error;
        // We need a way to link this back to our internal Withdrawal record.
        // Ideally, IntaSend includes a reference you provided during initiation,
        // or you might need to query Withdrawals by `intasendTransferId`.
        // Let's assume we need to query by `intasendTransferId`.
        
        if (!trackingId) {
            console.warn("Payout Callback: Webhook missing tracking_id.");
            return NextResponse.json({ received: true, message: 'Missing tracking_id' }, { status: 200 });
        }

        // --- Find Withdrawal Record --- 
        // This query requires an index on `intasendTransferId` in the withdrawals subcollection
        const withdrawalsRef = adminDb.collectionGroup('withdrawals'); // Query across all users
        const withdrawalQuery = withdrawalsRef.where('intasendTransferId', '==', trackingId).limit(1);
        const snapshot = await withdrawalQuery.get();

        if (snapshot.empty) {
             console.warn(`Payout Callback: Withdrawal record not found for IntaSend tracking_id: ${trackingId}`);
             // Acknowledge receipt, but can't process
             return NextResponse.json({ received: true, message: 'Withdrawal record not found' }, { status: 200 }); 
        }
        
        const withdrawalDoc = snapshot.docs[0];
        const withdrawalRef = withdrawalDoc.ref;
        const withdrawalData = withdrawalDoc.data();
        const userId = withdrawalData.userId;
        const withdrawalId = withdrawalDoc.id;
        const withdrawalAmount = withdrawalData.amount;

        console.log(`Payout Callback: Found withdrawal record ${withdrawalId} for user ${userId}.`);

        // Avoid processing updates for already completed/failed states
        if (['completed', 'failed'].includes(withdrawalData.status)) {
             console.log(`Payout Callback: Withdrawal ${withdrawalId} already in terminal state (${withdrawalData.status}). Ignoring webhook.`);
             return NextResponse.json({ received: true, message: 'Already processed' }, { status: 200 }); 
        }

        let notificationType: 'withdrawal_completed' | 'withdrawal_failed' | null = null;
        let notificationMessage = '';
        let finalStatus = withdrawalData.status;

        // --- Handle Successful Payout --- 
        if (payoutStatus === 'COMPLETE' || payoutStatus === 'SUCCESSFUL') {
            console.log(`Payout Callback: Successful payout confirmed for withdrawal ${withdrawalId}.`);
            finalStatus = 'completed';
            await withdrawalRef.update({
                status: finalStatus,
                completedAt: FieldValue.serverTimestamp()
            });
            // TODO: Update related Earning statuses from 'withdrawal_pending' to 'withdrawn'
            notificationType = 'withdrawal_completed';
            notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} has been completed successfully.`;
        } 
        // --- Handle Failed Payout --- 
        else if (payoutStatus === 'FAILED') {
            console.warn(`Payout Callback: Payout FAILED for withdrawal ${withdrawalId}. Reason: ${failureReason}`);
            finalStatus = 'failed';
             // --- Revert Balance and Earning Status --- 
             console.log(`Payout Callback: Attempting to revert balance/earnings for failed withdrawal ${withdrawalId}.`);
             const userRef = adminDb.collection('users').doc(userId);
             await adminDb.runTransaction(async (transaction) => {
                 // 1. Update Withdrawal
                 transaction.update(withdrawalRef, {
                     status: finalStatus,
                     failureReason: failureReason || 'Unknown failure reason from IntaSend'
                 });
                 // 2. Increment user's availableBalance
                 transaction.update(userRef, {
                      availableBalance: FieldValue.increment(withdrawalAmount)
                  });
                 // 3. TODO: Find related Earning docs marked as 'withdrawal_pending' for this withdrawal 
                 //    and revert their status back to 'available'. This requires linking 
                 //    earnings to withdrawals when initiating.
                 // Example (needs refinement based on your data model):
                 // const earningsToRevertQuery = userRef.collection('earnings').where('withdrawalId', '==', withdrawalId);
                 // const earningsSnapshot = await transaction.get(earningsToRevertQuery);
                 // earningsSnapshot.docs.forEach(doc => transaction.update(doc.ref, { status: 'available', withdrawalId: FieldValue.delete() })); 
             });
             console.log(`Payout Callback: Balance/earnings reverted for failed withdrawal ${withdrawalId}.`);
             // ----------------------------------------
            notificationType = 'withdrawal_failed';
            notificationMessage = `Your withdrawal of KES ${withdrawalAmount.toLocaleString()} failed. Reason: ${failureReason || 'Unknown'}. The amount has been returned to your balance.`;
        } 
        // --- Handle Other Statuses (e.g., Pending, Processing) --- 
        else {
             console.log(`Payout Callback: Received non-terminal status '${payoutStatus}' for withdrawal ${withdrawalId}. Updating status.`);
             finalStatus = 'processing'; // Or map IntaSend statuses if needed
             await withdrawalRef.update({ status: finalStatus });
        }

        // --- Send Notification (if status changed to terminal state) --- 
        if (notificationType && notificationMessage) {
             try {
                 await createNotification({
                     userId: userId,
                     type: notificationType,
                     message: notificationMessage,
                     relatedWithdrawalId: withdrawalId
                 });
                  console.log(`Payout Callback: Notification sent for withdrawal ${withdrawalId}.`);
             } catch (notifyError) {
                 console.error(`Payout Callback: Failed to send notification for ${withdrawalId}:`, notifyError);
             }
        }

        console.log("--- API POST /api/payouts/callback SUCCESS ---");
        return NextResponse.json({ received: true }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/callback FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to process webhook', error: error.message }, { status: 500 });
    }
}
