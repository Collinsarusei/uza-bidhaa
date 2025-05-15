// src/app/api/admin/payments/[paymentId]/admin-refund/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item, UserProfile, DisputeRecord } from '@/lib/types';
import { createNotification } from '@/lib/notifications';

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId || !adminDb) return false;
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role for refund:", error);
        return false;
    }
}

interface RouteContext {
    params: { paymentId?: string; };
}

export async function POST(req: Request, context: RouteContext) {
    const paymentId = context.params?.paymentId;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-refund START ---`);

    if (!paymentId) return NextResponse.json({ message: 'Missing payment ID' }, { status: 400 });
    if (!adminDb) {
        console.error(`Admin Refund ${paymentId}: Firebase Admin DB not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !(await isAdmin(session.user.id))) {
        console.warn(`Admin Refund ${paymentId}: Unauthorized attempt.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let disputeId: string | undefined;
    let adminNotes: string | undefined; // For admin notes on why refund was processed
    try {
        const body = await req.json();
        disputeId = body.disputeId;
        adminNotes = body.adminNotes || `Refund processed by admin ${session.user?.email || session.user?.id}.`;
    } catch (e) {
        console.log(`Admin Refund ${paymentId}: No JSON body or disputeId/adminNotes provided.`);
        adminNotes = `Refund processed by admin ${session.user?.email || session.user?.id}.`;
    }

    try {
        const paymentRef = adminDb.collection('payments').doc(paymentId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) throw new Error('Payment record not found.');
            const paymentData = paymentDoc.data() as Payment;

            if (!['disputed', 'admin_review', 'paid_to_platform'].includes(paymentData.status)) {
                throw new Error(`Cannot refund payment with status: ${paymentData.status}.`);
            }
            if (paymentData.status === 'refunded') throw new Error('Payment has already been refunded.');

            const buyerId = paymentData.buyerId;
            const buyerRef = adminDb!.collection('users').doc(buyerId);
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            const itemDoc = await transaction.get(itemRef);
            const itemData = itemDoc.exists ? itemDoc.data() as Item : null;

            // 1. Update Payment Status
            transaction.update(paymentRef, {
                status: 'refunded',
                isDisputed: false,
                disputeReason: FieldValue.delete(),
                disputeId: FieldValue.delete(),
                disputeFiledBy: FieldValue.delete(),
                disputeSubmittedAt: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            // 2. Handle item quantity and status (restock)
            if (itemData) {
                transaction.update(itemRef, {
                    status: 'available', 
                    quantity: FieldValue.increment(1), 
                    updatedAt: FieldValue.serverTimestamp(),
                });
                console.log(`Admin Refund: Item ${paymentData.itemId} status set to available, quantity incremented.`);
            } else {
                console.warn(`Admin Refund: Item ${paymentData.itemId} not found, cannot update its status or quantity.`);
            }
            
            // 3. Credit Buyer's Platform Available Balance
            const buyerProfileDoc = await transaction.get(buyerRef);
            if (buyerProfileDoc.exists) {
                transaction.update(buyerRef, {
                    availableBalance: FieldValue.increment(paymentData.amount)
                });
                console.log(`Admin Refund: Credited KES ${paymentData.amount} to buyer ${buyerId} platform availableBalance.`);
            } else {
                 console.warn(`Admin Refund: Buyer profile ${buyerId} not found. Cannot credit platform availableBalance.`);
                 // Decide if this is critical. For now, it logs and continues.
            }

            // 4. If a disputeId was provided, update the dispute record
            if (disputeId) {
                const disputeDocRef = adminDb!.collection('disputes').doc(disputeId);
                transaction.update(disputeDocRef, {
                    status: 'resolved_refund',
                    resolutionNotes: adminNotes,
                    resolvedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                console.log(`Admin Refund: Dispute ${disputeId} for payment ${paymentId} marked as resolved_refund.`);
            }
            
            console.log(`Admin Refund: Payment ${paymentId} marked as refunded. Buyer platform balance updated.`);
            return { 
                success: true, 
                buyerId, 
                sellerId: paymentData.sellerId, 
                amountRefunded: paymentData.amount, 
                itemId: paymentData.itemId,
                itemTitle: itemData?.title || paymentData.itemTitle || 'Item',
                wasDisputed: !!disputeId,
                disputeIdIfAny: disputeId
            };
        });

        if (result?.success) {
            await createNotification({
                userId: result.buyerId,
                type: 'admin_action',
                message: `Admin has processed a refund of KES ${result.amountRefunded.toLocaleString()} for your order of "${result.itemTitle}". The amount has been credited to your platform balance. ${result.wasDisputed ? 'The dispute has been resolved. ' : ''}`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            await createNotification({
                userId: result.sellerId,
                type: 'admin_action',
                message: `Admin has processed a refund to the buyer for item "${result.itemTitle}" (Payment ID: ${paymentId}). ${result.wasDisputed ? 'The dispute has been resolved. ' : ''}The item may have been restocked.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            return NextResponse.json({ message: 'Refund processed successfully. Buyer platform balance updated. Dispute (if any) resolved.' }, { status: 200 });
        }
        throw new Error('Transaction failed unexpectedly.');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-refund FAILED --- Error:`, error);
        return NextResponse.json({ message: error.message || 'Failed to process refund.' }, { status: error.message?.includes('already been refunded') ? 409 : 400 });
    }
}
