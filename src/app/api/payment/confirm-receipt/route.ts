// src/app/api/payment/confirm-receipt/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; 
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Earning, Payment, PlatformSettings, PlatformFeeRecord, Item } from '@/lib/types'; 
import { v4 as uuidv4 } from 'uuid';

const confirmSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10; 

async function getPlatformFeePercentage(): Promise<number> {
    if (!adminDb) {
        console.warn("getPlatformFeePercentage: Firebase Admin DB not initialized. Using default fee.");
        return DEFAULT_PLATFORM_FEE_PERCENTAGE;
    }
    try {
        const feeDocRef = adminDb.collection('settings').doc('platformFee'); 
        const docSnap = await feeDocRef.get();
        if (docSnap.exists) {
            const feeSettings = docSnap.data() as PlatformSettings;
            if (typeof feeSettings.feePercentage === 'number' && feeSettings.feePercentage >= 0 && feeSettings.feePercentage <= 100) {
                console.log(`getPlatformFeePercentage: Using fee from Firestore: ${feeSettings.feePercentage}%`);
                return feeSettings.feePercentage / 100; 
            }
        }
        console.log(`getPlatformFeePercentage: Fee not set or invalid in Firestore. Using default fee.`);
    } catch (error) {
        console.error("Error fetching platform fee from Firestore:", error);
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
    console.log("--- API POST /api/payment/confirm-receipt START ---");

    if (!adminDb) {
        console.error("Confirm Receipt Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Confirm Receipt: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;
    console.log(`Confirm Receipt: Authenticated as buyer ${buyerId}`);

    try {
        let body;
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }
        
        const validation = confirmSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { paymentId } = validation.data;
        console.log(`Confirm Receipt: Request for paymentId: ${paymentId}`);

        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const platformFeeSettingsRef = adminDb.collection('settings').doc('platformFee');

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                 console.warn(`Confirm Receipt: Payment ${paymentId} not found.`);
                 throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.buyerId !== buyerId) {
                 console.warn(`Confirm Receipt: User ${buyerId} is not the buyer for payment ${paymentId}.`);
                throw new Error('Forbidden: You are not the buyer for this order.');
            }
            if (paymentData.status !== 'paid_to_platform') {
                console.log(`Confirm Receipt: Payment ${paymentId} has status ${paymentData.status}, cannot confirm receipt.`);
                 throw new Error(`Cannot confirm receipt for order with status: ${paymentData.status}.`);
            }

            const { fee, netAmount } = await calculateFee(paymentData.amount);
            console.log(`Confirm Receipt: Calculated fee=${fee}, netAmount=${netAmount} for payment ${paymentId}`);

            const sellerId = paymentData.sellerId;
            if (!sellerId) throw new Error('Seller ID missing on payment record.');
            
            const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
            const sellerRef = adminDb!.collection('users').doc(sellerId);
            const earningId = uuidv4();
            const earningRef = sellerRef.collection('earnings').doc(earningId);
            const platformFeeRecordId = uuidv4();
            const platformFeeRecordRef = adminDb!.collection('platformFees').doc(platformFeeRecordId);

            // Get item to check quantity
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists) {
                throw new Error('Item related to payment not found.');
            }
            const itemData = itemDoc.data() as Item;
            const currentQuantity = itemData.quantity !== undefined ? itemData.quantity : 1; // Default to 1 if undefined

            // Update item quantity and status
            const newQuantity = currentQuantity - 1;
            let newItemStatus: Item['status'] = itemData.status;
            if (newQuantity <= 0) {
                newItemStatus = 'sold';
            }

            transaction.update(itemRef, {
                quantity: newQuantity > 0 ? newQuantity : 0, // Ensure quantity doesn't go below 0
                status: newItemStatus,
                updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Confirm Receipt: Item ${paymentData.itemId} quantity updated from ${currentQuantity} to ${newQuantity}. Status set to ${newItemStatus}.`);

            const earningData: Omit<Earning, 'id' | 'createdAt'> = {
                 userId: sellerId,
                 amount: netAmount,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 status: 'available', 
            };

             const feeRecordData: Omit<PlatformFeeRecord, 'id' | 'createdAt'> = {
                 amount: fee,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 sellerId: sellerId, 
             };
            
            transaction.update(paymentRef, {
                 status: 'released_to_seller_balance',
                 updatedAt: FieldValue.serverTimestamp(),
             });
            
             transaction.set(earningRef, {
                 ...earningData,
                 id: earningId, 
                 createdAt: FieldValue.serverTimestamp(),
             });

             transaction.update(sellerRef, {
                 availableBalance: FieldValue.increment(netAmount)
             });

             transaction.set(platformFeeRecordRef, {
                 ...feeRecordData,
                 id: platformFeeRecordId, 
                 createdAt: FieldValue.serverTimestamp(),
             });

             transaction.set(platformFeeSettingsRef, {
                 totalPlatformFees: FieldValue.increment(fee),
                 updatedAt: FieldValue.serverTimestamp() 
             }, { merge: true }); 
            
            console.log(`Confirm Receipt: Updated item ${paymentData.itemId}. Prepared updates for payment ${paymentId}.`);
            return { success: true, sellerId, netAmount, itemId: paymentData.itemId, itemTitle: itemData.title || 'Item' }; // Use itemData.title
        });

        if (result?.success) {
            console.log(`Confirm Receipt: Transaction successful for payment ${paymentId}.`);
            try {
                 await createNotification({
                     userId: result.sellerId,
                     type: 'funds_available',
                     message: `Funds (KES ${result.netAmount.toLocaleString()}) for "${result.itemTitle}" are now available in your earnings balance.`,
                     relatedItemId: result.itemId,
                     relatedPaymentId: paymentId,
                 });
                 await createNotification({
                    userId: buyerId,
                    type: 'admin_action', 
                    message: `You have successfully confirmed receipt for item "${result.itemTitle}".`,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
                 console.log(`Confirm Receipt: Notifications sent for payment ${paymentId}.`);
            } catch (notifyError) {
                 console.error(`Confirm Receipt: Failed to send notification for payment ${paymentId}:`, notifyError);
            }
            console.log("--- API POST /api/payment/confirm-receipt SUCCESS ---");
             return NextResponse.json({ message: 'Receipt confirmed and funds released to seller balance. Item quantity updated.' }, { status: 200 });
        } else {
             console.warn(`Confirm Receipt: Transaction completed but didn't return expected success object for ${paymentId}. Result:`, result);
             return NextResponse.json({ message: 'Confirmation processed but with unexpected result.' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("--- API POST /api/payment/confirm-receipt FAILED --- Error:", error);
        const status = error.message.startsWith('Forbidden') ? 403 : error.message.includes('not found') ? 404 : 400;
        return NextResponse.json({ message: error.message || 'Failed to confirm receipt.' }, { status });
    }
}
