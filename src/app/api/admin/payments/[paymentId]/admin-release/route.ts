// src/app/api/admin/payments/[paymentId]/admin-release/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item, Earning, UserProfile, PlatformSettings, PlatformFeeRecord, DisputeRecord } from '@/lib/types'; // Added DisputeRecord
import { createNotification } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10;

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId || !adminDb) return false;
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role:", error);
        return false;
    }
}

async function getPlatformFeePercentage(): Promise<number> {
    if (!adminDb) return DEFAULT_PLATFORM_FEE_PERCENTAGE;
    try {
        const feeDocRef = adminDb.collection('settings').doc('platformFee');
        const docSnap = await feeDocRef.get();
        if (docSnap.exists) {
            const feeSettings = docSnap.data() as PlatformSettings;
            if (typeof feeSettings.feePercentage === 'number' && feeSettings.feePercentage >= 0 && feeSettings.feePercentage <= 100) {
                return feeSettings.feePercentage / 100;
            }
        }
    } catch (error) {
        console.error("Error fetching platform fee (admin-release):", error);
    }
    return DEFAULT_PLATFORM_FEE_PERCENTAGE;
}

const calculateFee = async (amount: number): Promise<{ fee: number, netAmount: number }> => {
    const platformFeeRate = await getPlatformFeePercentage();
    const fee = Math.round(amount * platformFeeRate * 100) / 100;
    const netAmount = Math.round((amount - fee) * 100) / 100;
    return { fee, netAmount };
};

interface RouteContext {
    params: { paymentId?: string; };
}

export async function POST(req: Request, context: RouteContext) {
    const paymentId = context.params?.paymentId;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-release START ---`);

    if (!paymentId) return NextResponse.json({ message: 'Missing payment ID' }, { status: 400 });
    if (!adminDb) {
        console.error(`Admin Release ${paymentId}: Firebase Admin DB not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn(`Admin Release ${paymentId}: Unauthorized attempt.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let disputeId: string | undefined;
    try {
        const body = await req.json();
        disputeId = body.disputeId; // Expecting disputeId in the body now
    } catch (e) {
        // If body is not present or not JSON, it's fine if disputeId is not needed for this action
        console.log(`Admin Release ${paymentId}: No JSON body or disputeId provided, proceeding without it.`);
    }

    try {
        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const platformFeeSettingsRef = adminDb.collection('settings').doc('platformFee');

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) throw new Error('Payment record not found.');
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.status !== 'paid_to_platform' && paymentData.status !== 'disputed' && paymentData.status !== 'admin_review') {
                throw new Error(`Cannot release payment with status: ${paymentData.status}.`);
            }

            const { fee, netAmount } = await calculateFee(paymentData.amount);
            const sellerId = paymentData.sellerId;
            if (!sellerId) throw new Error('Seller ID missing on payment record.');

            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            const sellerRef = adminDb!.collection('users').doc(sellerId);
            const earningId = uuidv4();
            const earningRef = sellerRef.collection('earnings').doc(earningId);
            const platformFeeRecordId = uuidv4();
            const platformFeeRecordRef = adminDb!.collection('platformFees').doc(platformFeeRecordId);

            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists) throw new Error('Item related to payment not found.');
            const itemData = itemDoc.data() as Item;
            const currentQuantity = itemData.quantity !== undefined ? itemData.quantity : 1;
            const newQuantity = currentQuantity - 1;
            let newItemStatus: Item['status'] = itemData.status;
            if (newQuantity <= 0) newItemStatus = 'sold';

            transaction.update(itemRef, {
                quantity: newQuantity > 0 ? newQuantity : 0,
                status: newItemStatus,
                updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.update(paymentRef, {
                status: 'released_to_seller_balance',
                isDisputed: false, // Clear dispute flags as it's resolved by release
                disputeReason: FieldValue.delete(),
                disputeId: FieldValue.delete(),
                disputeFiledBy: FieldValue.delete(),
                disputeSubmittedAt: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(earningRef, { id: earningId, userId: sellerId, amount: netAmount, relatedPaymentId: paymentId, relatedItemId: paymentData.itemId, status: 'available', createdAt: FieldValue.serverTimestamp() });
            transaction.update(sellerRef, { availableBalance: FieldValue.increment(netAmount) });
            transaction.set(platformFeeRecordRef, { id: platformFeeRecordId, amount: fee, relatedPaymentId: paymentId, relatedItemId: paymentData.itemId, sellerId: sellerId, createdAt: FieldValue.serverTimestamp() });
            transaction.set(platformFeeSettingsRef, { totalPlatformFees: FieldValue.increment(fee), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

            // If a disputeId was provided, update the dispute record
            if (disputeId) {
                const disputeDocRef = adminDb!.collection('disputes').doc(disputeId);
                transaction.update(disputeDocRef, {
                    status: 'resolved_release',
                    resolutionNotes: `Funds released to seller by admin ${session.user?.email || session.user?.id}.`,
                    resolvedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                console.log(`Admin Release: Dispute ${disputeId} for payment ${paymentId} marked as resolved_release.`);
            }

            console.log(`Admin Release: Payment ${paymentId} released. Item quantity ${newQuantity}. Net: ${netAmount}, Fee: ${fee}.`);
            return { success: true, sellerId, buyerId: paymentData.buyerId, netAmount, itemId: paymentData.itemId, itemTitle: itemData.title || 'Item', wasDisputed: !!disputeId, disputeIdIfAny: disputeId };
        });

        if (result?.success) {
            // Notifications
            await createNotification({
                userId: result.sellerId,
                type: 'payment_released',
                message: `Funds (KES ${result.netAmount.toLocaleString()}) for "${result.itemTitle}" are now in your earnings balance. ${result.wasDisputed ? 'The dispute has been resolved in your favor.' : ''}`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            await createNotification({
                userId: result.buyerId,
                type: 'admin_action',
                message: `An admin has reviewed the transaction for "${result.itemTitle}". ${result.wasDisputed ? 'The dispute has been resolved, and funds released to the seller.' : 'Funds have been released to the seller.'}`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            return NextResponse.json({ message: 'Funds released to seller successfully. Dispute (if any) resolved.' }, { status: 200 });
        }
        throw new Error('Transaction failed unexpectedly.');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-release FAILED --- Error:`, error);
        return NextResponse.json({ message: error.message || 'Failed to release funds.' }, { status: 500 });
    }
}
