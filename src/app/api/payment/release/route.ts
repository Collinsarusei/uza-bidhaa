// src/app/api/payment/release/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Firestore, Transaction } from 'firebase-admin/firestore';
import * as z from 'zod';
import { Payment, Earning, PlatformSettingData, Item } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

// Type assertion for adminDb
const typedAdminDb = adminDb as Firestore;

const releaseSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10;

async function getPlatformFeePercentage(): Promise<number> {
    if (!adminDb) {
        console.warn("getPlatformFeePercentage (release): Firebase Admin DB not initialized. Using default fee.");
        return DEFAULT_PLATFORM_FEE_PERCENTAGE;
    }
    try {
        const feeDocRef = (adminDb as Firestore).collection('settings').doc('platformFee');
        const docSnap = await feeDocRef.get();
        if (docSnap.exists) {
            const feeSettings = docSnap.data() as PlatformSettingData;
            if (typeof feeSettings.defaultFeePercentage === 'number' && feeSettings.defaultFeePercentage >= 0 && feeSettings.defaultFeePercentage <= 100) {
                return feeSettings.defaultFeePercentage / 100;
            }
        }
    } catch (error) {
        console.error("Error fetching platform fee from Firestore (release):", error);
    }
    return DEFAULT_PLATFORM_FEE_PERCENTAGE;
}

const calculateFee = async (amount: number): Promise<{ fee: number, netAmount: number }> => {
    const platformFeeRate = await getPlatformFeePercentage();
    const fee = Math.round(amount * platformFeeRate * 100) / 100;
    const netAmount = Math.round((amount - fee) * 100) / 100;
    return { fee, netAmount };
};

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/release START (Buyer Confirms Receipt) ---");

    if (!adminDb) {
        console.error("Payment Release Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Payment Release: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;
    console.log(`Payment Release: Authenticated as buyer ${buyerId}`);

    try {
        let body;
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }
        
        const validation = releaseSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { paymentId } = validation.data;
        console.log(`Payment Release: Request for paymentId: ${paymentId}`);

        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const platformFeeSettingsRef = adminDb.collection('settings').doc('platformFee');

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) throw new Error('Payment record not found.');
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.buyerId !== buyerId) throw new Error('Forbidden: You are not the buyer for this order.');
            if (paymentData.status !== 'SUCCESSFUL_ESCROW') {
                throw new Error(`Cannot release funds for order with status: ${paymentData.status}.`);
            }

            const { fee, netAmount } = await calculateFee(Number(paymentData.amount));
            const sellerId = paymentData.sellerId;
            if (!sellerId) throw new Error('Internal error: Seller information missing.');
            
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            const sellerRef = adminDb!.collection('users').doc(sellerId);
            const earningId = uuidv4();
            const earningRef = sellerRef.collection('earnings').doc(earningId);
            const platformFeeRecordId = uuidv4();
            const platformFeeRecordRef = adminDb!.collection('platformFees').doc(platformFeeRecordId);

            // Get item to check quantity
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists) throw new Error('Item related to payment not found.');
            const itemData = itemDoc.data() as Item;
            const currentQuantity = itemData.quantity !== undefined ? itemData.quantity : 1;
            const newQuantity = currentQuantity - 1;
            let newItemStatus: Item['status'] = itemData.status;
            if (newQuantity <= 0) newItemStatus = 'SOLD';

            // 1. Update Item Quantity and Status
            transaction.update(itemRef, {
                quantity: newQuantity > 0 ? newQuantity : 0,
                status: newItemStatus,
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Payment Release: Item ${paymentData.itemId} quantity updated from ${currentQuantity} to ${newQuantity}. Status to ${newItemStatus}.`);

            // 2. Update Payment Status
            transaction.update(paymentRef, {
                 status: 'released_to_seller_balance',
                 updatedAt: FieldValue.serverTimestamp(),
                 isDisputed: false, // Assuming a direct release clears any implicit dispute flags
                 disputeId: FieldValue.delete(),
             });
            
            // 3. Create Earning Record for Seller
             transaction.set(earningRef, {
                 id: earningId,
                 userId: sellerId,
                 amount: netAmount,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 status: 'available', 
                 createdAt: FieldValue.serverTimestamp(),
             });

            // 4. Increment Seller's Available Balance
             transaction.update(sellerRef, {
                 availableBalance: FieldValue.increment(netAmount)
             });

            // 5. Create Platform Fee Record
            transaction.set(platformFeeRecordRef, {
                id: platformFeeRecordId,
                amount: fee,
                relatedPaymentId: paymentId,
                relatedItemId: paymentData.itemId,
                sellerId: sellerId, 
                createdAt: FieldValue.serverTimestamp(),
            });

            // 6. Increment Total Platform Fees in settings
            transaction.set(platformFeeSettingsRef, {
                totalPlatformFees: FieldValue.increment(fee),
                updatedAt: FieldValue.serverTimestamp() 
            }, { merge: true }); 
            
            console.log(`Payment Release: Payment ${paymentId} to seller ${sellerId}. Net: ${netAmount}, Fee: ${fee}.`);
            return { success: true, sellerId, buyerId, netAmount, itemId: paymentData.itemId, itemTitle: itemData.title || 'Item' };
        });

        if (result?.success) {
            console.log(`Payment Release: Transaction successful for payment ${paymentId}.`);
            // Send notifications
            await createNotification({
                userId: result.sellerId,
                type: 'funds_available',
                message: `Funds (KES ${result.netAmount.toLocaleString()}) for "${result.itemTitle}" are now available in your earnings balance.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            await createNotification({
                userId: result.buyerId,
                type: 'admin_action', // Or a more specific 'order_completed_by_buyer' type
                message: `You have confirmed receipt for "${result.itemTitle}". The transaction is now complete.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            return NextResponse.json({ message: 'Receipt confirmed, funds released, item updated, and fee recorded.' }, { status: 200 });
        }
        throw new Error('Transaction failed unexpectedly.');

    } catch (error: any) {
        console.error("--- API POST /api/payment/release FAILED --- Error:", error);
        return NextResponse.json({ message: error.message || 'Failed to confirm receipt.' }, { status: error.message?.startsWith('Forbidden') ? 403 : 500 });
    }
}
