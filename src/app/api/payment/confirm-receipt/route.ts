// src/app/api/payment/confirm-receipt/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Earning, Payment, PlatformSettings, PlatformFeeRecord } from '@/lib/types'; // Import PlatformFeeRecord
import { v4 as uuidv4 } from 'uuid';

// --- Zod Schema --- 
const confirmSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

// --- Default Platform Fee --- 
const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10; // 10%

// --- Platform Fee Calculation (Async) --- 
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
                return feeSettings.feePercentage / 100; // Convert to decimal e.g. 10 -> 0.10
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

// --- POST Handler --- 
export async function POST(req: Request) {
    console.log("--- API POST /api/payment/confirm-receipt START ---");

    if (!adminDb) {
        console.error("Confirm Receipt Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    // --- Authentication --- 
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Confirm Receipt: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;
    console.log(`Confirm Receipt: Authenticated as buyer ${buyerId}`);

    try {
        // --- Validation --- 
        let body;
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }
        
        const validation = confirmSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { paymentId } = validation.data;
        console.log(`Confirm Receipt: Request for paymentId: ${paymentId}`);

        // --- Firestore Transaction --- 
        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const platformFeeSettingsRef = adminDb.collection('settings').doc('platformFee'); // Reference to platform settings

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                 console.warn(`Confirm Receipt: Payment ${paymentId} not found.`);
                 throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            // --- Authorization & Status Checks --- 
            if (paymentData.buyerId !== buyerId) {
                 console.warn(`Confirm Receipt: User ${buyerId} is not the buyer for payment ${paymentId}.`);
                throw new Error('Forbidden: You are not the buyer for this order.');
            }
            if (paymentData.status !== 'paid_to_platform') {
                console.log(`Confirm Receipt: Payment ${paymentId} has status ${paymentData.status}, cannot confirm receipt.`);
                 throw new Error(`Cannot confirm receipt for order with status: ${paymentData.status}.`);
            }

            // --- Calculate Earnings & Fees --- 
            const { fee, netAmount } = await calculateFee(paymentData.amount); // Await async calculation
            console.log(`Confirm Receipt: Calculated fee=${fee}, netAmount=${netAmount} for payment ${paymentId}`);

            // --- Prepare Updates --- 
            const sellerId = paymentData.sellerId;
            if (!sellerId) throw new Error('Seller ID missing on payment record.'); // Ensure sellerId exists

            const sellerRef = adminDb.collection('users').doc(sellerId);
            const earningId = uuidv4();
            const earningRef = sellerRef.collection('earnings').doc(earningId);
            const platformFeeRecordId = uuidv4();
            const platformFeeRecordRef = adminDb.collection('platformFees').doc(platformFeeRecordId); // Collection for fees

            const earningData: Omit<Earning, 'id' | 'createdAt'> = {
                 userId: sellerId,
                 amount: netAmount,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 status: 'available', 
            };

             // Data for the platform fee record
             const feeRecordData: Omit<PlatformFeeRecord, 'id' | 'createdAt'> = {
                 amount: fee,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 sellerId: sellerId, // Record the seller for context
             };
            
            // 1. Update Payment Status
            transaction.update(paymentRef, {
                 status: 'released_to_seller_balance',
                 updatedAt: FieldValue.serverTimestamp(),
             });
            
            // 2. Create Earning Record for Seller
             transaction.set(earningRef, {
                 ...earningData,
                 id: earningId, // Add id field
                 createdAt: FieldValue.serverTimestamp(),
             });

            // 3. Increment Seller's Available Balance
             transaction.update(sellerRef, {
                 availableBalance: FieldValue.increment(netAmount)
             });

             // 4. Create Platform Fee Record
             transaction.set(platformFeeRecordRef, {
                 ...feeRecordData,
                 id: platformFeeRecordId, // Add id field
                 createdAt: FieldValue.serverTimestamp(),
             });

             // 5. Increment Total Platform Fees in settings
             transaction.set(platformFeeSettingsRef, {
                 totalPlatformFees: FieldValue.increment(fee),
                 updatedAt: FieldValue.serverTimestamp() // Also update the settings timestamp
             }, { merge: true }); // Use merge: true to create if doesn't exist or update if does
            
            console.log(`Confirm Receipt: Prepared updates for payment ${paymentId}, created earning ${earningId} for seller ${sellerId}, created fee record ${platformFeeRecordId}, and incremented total fees.`);
            return { success: true, sellerId, netAmount, itemId: paymentData.itemId, itemTitle: paymentData.itemTitle || 'Item' };
        });

        if (result?.success) {
            console.log(`Confirm Receipt: Transaction successful for payment ${paymentId}.`);
            try {
                // Use itemTitle from transaction result if available, otherwise fetch.
                let itemTitleToNotify = result.itemTitle; 
                if (!itemTitleToNotify && result.itemId) { // Fallback if itemTitle wasn't on payment record
                    const itemDoc = await adminDb!.collection('items').doc(result.itemId).get();
                    if (itemDoc.exists) itemTitleToNotify = itemDoc.data()?.title || 'Item';
                }

                 await createNotification({
                     userId: result.sellerId,
                     type: 'funds_available',
                     message: `Funds (KES ${result.netAmount}) for "${itemTitleToNotify}" are now available in your earnings balance.`,
                     relatedItemId: result.itemId,
                     relatedPaymentId: paymentId,
                 });
                 console.log(`Confirm Receipt: Notification sent to seller ${result.sellerId}.`);
            } catch (notifyError) {
                 console.error(`Confirm Receipt: Failed to send notification for payment ${paymentId}:`, notifyError);
            }
            console.log("--- API POST /api/payment/confirm-receipt SUCCESS ---");
             return NextResponse.json({ message: 'Receipt confirmed and funds released to seller balance.' }, { status: 200 });
        } else {
             console.warn(`Confirm Receipt: Transaction completed but didn't return expected success object for ${paymentId}. Result:`, result);
             return NextResponse.json({ message: 'Confirmation processed but with unexpected result.' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("--- API POST /api/payment/confirm-receipt FAILED --- Error:", error);
        const status = error.message.startsWith('Forbidden') ? 403 : 500;
        return NextResponse.json({ message: error.message || 'Failed to confirm receipt.' }, { status });
    }
}
```