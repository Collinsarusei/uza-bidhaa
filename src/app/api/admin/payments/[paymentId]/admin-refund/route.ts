// src/app/api/admin/payments/[paymentId]/admin-refund/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item } from '@/lib/types';
import { createNotification } from '@/lib/notifications';

// TODO: Import Paystack SDK or fetch for refund API calls

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const adminUserEmail = process.env.ADMIN_EMAIL;
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    return !!userId; // Fallback, NOT SECURE for production
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
    if (!(await isAdmin(session?.user?.id))) {
        console.warn(`Admin Refund ${paymentId}: Unauthorized attempt by user ${session?.user?.id}.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = session?.user?.id;
    console.log(`Admin Refund ${paymentId}: Authenticated admin action by ${adminUserId}.`);

    try {
        const paymentRef = adminDb.collection('payments').doc(paymentId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.status === 'refunded') {
                throw new Error('Payment has already been refunded.');
            }
            // Allow refund from 'paid_to_platform', 'disputed', or 'admin_review'
            if (!['paid_to_platform', 'disputed', 'admin_review'].includes(paymentData.status)) {
                throw new Error(`Cannot refund payment with status: ${paymentData.status}.`);
            }

            // --- TODO: Actual Paystack Refund Logic ---
            // 1. Check if paymentData.gatewayTransactionId exists (this is Paystack's transaction ID)
            // 2. If yes, call Paystack's refund API.
            //    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
            //    if (paymentData.gatewayTransactionId && PAYSTACK_SECRET_KEY) {
            //      const refundResponse = await fetch(`https://api.paystack.co/refund`, {
            //        method: 'POST',
            //        headers: {
            //          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            //          'Content-Type': 'application/json',
            //        },
            //        body: JSON.stringify({
            //          transaction: paymentData.gatewayTransactionId,
            //          // amount: paymentData.amount * 100, // Optional: specify amount for partial refund
            //          // currency: "KES",
            //          // reason: "Admin initiated refund for disputed order."
            //        })
            //      });
            //      const refundResult = await refundResponse.json();
            //      if (!refundResponse.ok || !refundResult.status) {
            //         console.error("Paystack Refund API Error:", refundResult);
            //         throw new Error(`Paystack refund failed: ${refundResult.message || 'Unknown Paystack error'}`);
            //      }
            //      console.log(`Paystack refund initiated: ${refundResult.data?.status}`);
            //    } else {
            //      console.warn(`Admin Refund ${paymentId}: Cannot process Paystack refund automatically. Missing Paystack transaction ID or secret key.`);
            //      // If automatic refund fails or isn't possible, admin might need to do it manually in Paystack dashboard.
            //      // You might choose to proceed with DB update and notify admin, or throw error.
            //    }
            // --- End TODO ---
            // For now, we assume manual refund or proceed with DB update only.

            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            transaction.update(paymentRef, {
                status: 'refunded', // Or 'refund_pending' if Paystack refund is async
                updatedAt: FieldValue.serverTimestamp(),
                isDisputed: false, // Clear dispute flag
                disputeReason: FieldValue.delete(),
            });
            transaction.update(itemRef, {
                status: 'available', // Make item available again, or a specific 'refunded_item' status
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Admin Refund: Payment ${paymentId} status updated to refunded. Item ${paymentData.itemId} status updated.`);
            return { success: true, sellerId: paymentData.sellerId, buyerId: paymentData.buyerId, amount: paymentData.amount, itemId: paymentData.itemId, itemTitle: (await transaction.get(itemRef)).data()?.title || 'Item' };
        });

        if (result?.success) {
            try {
                await createNotification({
                    userId: result.buyerId,
                    type: 'admin_action', // Or a specific 'payment_refunded' type
                    message: `Admin has processed a refund of KES ${result.amount} for your order of "${result.itemTitle}".`,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
                await createNotification({
                    userId: result.sellerId,
                    type: 'admin_action',
                    message: `Admin has processed a refund to the buyer for item "${result.itemTitle}".`,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
            } catch (notifyError) {
                console.error(`Admin Refund ${paymentId}: Failed to send notifications:`, notifyError);
            }
            return NextResponse.json({ message: 'Payment refunded successfully (DB update). Actual fund transfer via Paystack may need manual action or API integration.' }, { status: 200 });
        }
        throw new Error('Transaction failed to return expected result.');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-refund FAILED --- Error:`, error);
        return NextResponse.json({ message: error.message || 'Failed to refund payment.' }, { status: 500 });
    }
}
