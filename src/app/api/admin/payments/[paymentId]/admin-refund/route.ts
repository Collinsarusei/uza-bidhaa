// src/app/api/admin/payments/[paymentId]/admin-refund/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item, UserProfile } from '@/lib/types'; // Ensure all necessary types are imported
import { createNotification } from '@/lib/notifications';

// Role-based admin check
async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId || !adminDb) { 
        console.error("isAdmin check failed: Missing userId or adminDb is null.");
        return false;
    }
    try {
        const userDoc = await adminDb!.collection('users').doc(userId).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role for refund:", error);
        return false;
    }
}

interface RouteContext {
    params: {
      paymentId?: string;
    };
}

export async function POST(req: Request, context: RouteContext) {
    const paymentId = context.params?.paymentId;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-refund START ---`);

    if (!paymentId) {
        return NextResponse.json({ message: 'Missing payment ID' }, { status: 400 });
    }
    if (!adminDb) {
        console.error(`Admin Refund ${paymentId}: Firebase Admin DB not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !(await isAdmin(session.user.id))) {
        console.warn(`Admin Refund ${paymentId}: Unauthorized attempt by user ${session?.user?.id}.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = session.user.id; // For logging/audit if needed
    console.log(`Admin Refund ${paymentId}: Authenticated admin action by ${adminUserId}.`);

    try {
        const paymentRef = adminDb.collection('payments').doc(paymentId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            // Check if payment is in a state that can be refunded by admin
            if (!['disputed', 'admin_review', 'paid_to_platform'].includes(paymentData.status)) {
                throw new Error(`Cannot refund payment with status: ${paymentData.status}.`);
            }
            if (paymentData.status === 'refunded') {
                throw new Error('Payment has already been refunded.');
            }

            const buyerId = paymentData.buyerId;
            const buyerRef = adminDb!.collection('users').doc(buyerId);
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);

            // 1. Update Payment Status
            transaction.update(paymentRef, {
                status: 'refunded',
                updatedAt: FieldValue.serverTimestamp(),
                isDisputed: false, // Clear dispute flag if it was set
                disputeReason: FieldValue.delete(), // Clear dispute reason
                disputeFiledBy: FieldValue.delete(),
                disputeSubmittedAt: FieldValue.delete(),
                // refundReasonAdmin: "Admin processed refund." // Optional: admin note for refund
            });

            // 2. Update Item Status (e.g., back to available or a specific admin-managed state)
            transaction.update(itemRef, {
                status: 'available', // Or 'cancelled', 'admin_removed' etc., depending on policy
                updatedAt: FieldValue.serverTimestamp(),
            });

            // 3. Credit Buyer's Internal Wallet/Balance
            const buyerDoc = await transaction.get(buyerRef);
            if (buyerDoc.exists) {
                 transaction.update(buyerRef, {
                     availableBalance: FieldValue.increment(paymentData.amount)
                 });
                 console.log(`Admin Refund: Credited KES ${paymentData.amount} to buyer ${buyerId} internal balance.`);
            } else {
                console.warn(`Admin Refund: Buyer profile ${buyerId} not found. Cannot credit internal balance.`);
                // Decide if this should halt the transaction. For now, it proceeds but logs a warning.
                // throw new Error(`Buyer profile ${buyerId} not found. Cannot credit internal balance.`); 
            }
            
            // Note: The actual financial refund (Paystack to buyer's card/bank) 
            // still needs to be done MANUALLY by the admin in the Paystack dashboard.
            return { 
                success: true, 
                buyerId: paymentData.buyerId,
                sellerId: paymentData.sellerId, 
                amountRefunded: paymentData.amount, 
                itemId: paymentData.itemId,
                itemTitle: paymentData.itemTitle || 'Item' // Ensure itemTitle is available
            };
        });

        if (result?.success) {
            console.log(`Admin Refund: Payment ${paymentId} processed for refund to buyer ${result.buyerId}.`);
            // Send notifications
            try {
                await createNotification({
                    userId: result.buyerId,
                    type: 'admin_action', // Consider a more specific 'refund_processed' type
                    message: `Admin has processed a refund of KES ${result.amountRefunded.toLocaleString()} for your order of "${result.itemTitle}". The amount has been credited to your platform balance. The financial refund from Paystack will be processed separately. `,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
                await createNotification({
                    userId: result.sellerId,
                    type: 'admin_action', // Consider 'order_refunded'
                    message: `Admin has processed a refund to the buyer for item "${result.itemTitle}". Payment ID: ${paymentId}. Your listing may be re-activated or reviewed. `,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
            } catch (notifyError) {
                console.error(`Admin Refund ${paymentId}: Failed to send notifications:`, notifyError);
            }
            return NextResponse.json({ message: 'Refund processed successfully. Buyer balance updated. Remember to process financial refund via Paystack.' }, { status: 200 });
        }
        throw new Error('Transaction failed to return expected result.');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-refund FAILED --- Error:`, error);
        const status = error.message?.startsWith('Forbidden') ? 403 :
                       error.message?.includes('not found') ? 404 :
                       error.message?.includes('already been refunded') ? 409 : // Conflict for already refunded
                       400; // Default bad request
        return NextResponse.json({ message: error.message || 'Failed to process refund.' }, { status });
    }
}
