// src/app/api/payment/release/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // Can be null
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import { Payment, Earning, PlatformSettings } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from '@/lib/notifications';

// --- Zod Schema --- 
const releaseSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

// --- Default Platform Fee --- 
const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10; // 10%

// --- Platform Fee Calculation (Async) --- 
async function getPlatformFeePercentage(): Promise<number> {
    if (!adminDb) {
        console.warn("getPlatformFeePercentage (release): Firebase Admin DB not initialized. Using default fee.");
        return DEFAULT_PLATFORM_FEE_PERCENTAGE;
    }
    try {
        const feeDocRef = adminDb.collection('settings').doc('platformFee');
        const docSnap = await feeDocRef.get();
        if (docSnap.exists) {
            const feeSettings = docSnap.data() as PlatformSettings;
            if (typeof feeSettings.feePercentage === 'number' && feeSettings.feePercentage >= 0 && feeSettings.feePercentage <= 100) {
                console.log(`getPlatformFeePercentage (release): Using fee from Firestore: ${feeSettings.feePercentage}%`);
                return feeSettings.feePercentage / 100; // Convert to decimal
            }
        }
        console.log(`getPlatformFeePercentage (release): Fee not set or invalid in Firestore. Using default fee.`);
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

// --- POST Handler (Buyer confirms receipt, release funds to seller balance) --- 
export async function POST(req: Request) {
    console.log("--- API POST /api/payment/release START (Confirm Receipt) ---");

    if (!adminDb) {
        console.error("Payment Release Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    // --- Authentication (Buyer) --- 
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Payment Release: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;
    console.log(`Payment Release: Authenticated as buyer ${buyerId}`);

    try {
        // --- Validation --- 
        let body;
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }
        
        const validation = releaseSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { paymentId } = validation.data;
        console.log(`Payment Release: Request for paymentId: ${paymentId}`);

        const paymentRef = adminDb.collection('payments').doc(paymentId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                 console.warn(`Payment Release: Payment ${paymentId} not found.`);
                 throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            // --- Authorization & Status Checks --- 
            if (paymentData.buyerId !== buyerId) {
                 console.warn(`Payment Release: User ${buyerId} is not the buyer for payment ${paymentId}.`);
                throw new Error('Forbidden: You are not the buyer for this order.');
            }
            if (paymentData.status !== 'paid_to_platform') {
                console.log(`Payment Release: Payment ${paymentId} has status ${paymentData.status}, cannot release funds.`);
                 throw new Error(`Cannot release funds for order with status: ${paymentData.status}.`);
            }

            // --- Calculate Earnings & Fees --- 
            const { fee, netAmount } = await calculateFee(paymentData.amount); // Await async calculation
            console.log(`Payment Release: Calculated fee=${fee}, netAmount=${netAmount} for payment ${paymentId}`);

            // --- Prepare Updates --- 
            const sellerId = paymentData.sellerId;
            if (!sellerId) { 
                console.error(`Payment Release: Seller ID missing on payment record ${paymentId}`);
                throw new Error('Internal error: Seller information missing.');
            }
            const sellerRef = adminDb.collection('users').doc(sellerId);
            const earningId = uuidv4();
            const earningRef = sellerRef.collection('earnings').doc(earningId);

            const earningData: Omit<Earning, 'id' | 'createdAt'> = {
                 userId: sellerId,
                 amount: netAmount,
                 relatedPaymentId: paymentId,
                 relatedItemId: paymentData.itemId,
                 status: 'available', 
            };
            
            // 1. Update Payment Status
            transaction.update(paymentRef, {
                 status: 'released_to_seller_balance',
                 updatedAt: FieldValue.serverTimestamp(),
             });
            
            // 2. Create Earning Record for Seller
             transaction.set(earningRef, {
                 ...earningData,
                 createdAt: FieldValue.serverTimestamp(),
             });

            // 3. Increment Seller's Available Balance
             transaction.update(sellerRef, {
                 availableBalance: FieldValue.increment(netAmount)
             });
            
            console.log(`Payment Release: Prepared updates for payment ${paymentId}, created earning ${earningId} for seller ${sellerId}.`);
            return { success: true, sellerId, netAmount, itemId: paymentData.itemId, itemTitle: paymentData.itemTitle || 'Item' };
        });

        // --- Send Notification (Outside Transaction) --- 
        if (result?.success) {
            console.log(`Payment Release: Transaction successful for payment ${paymentId}.`);
            try {
                let itemTitleToNotify = result.itemTitle;
                if (!itemTitleToNotify && result.itemId) {
                    const itemDoc = await adminDb.collection('items').doc(result.itemId).get();
                    if (itemDoc.exists) itemTitleToNotify = itemDoc.data()?.title || 'Item';
                }

                 await createNotification({
                     userId: result.sellerId,
                     type: 'funds_available',
                     message: `Funds (KES ${result.netAmount}) for "${itemTitleToNotify}" are now available in your earnings balance.`,
                     relatedItemId: result.itemId,
                     relatedPaymentId: paymentId,
                 });
                 console.log(`Payment Release: Notification sent to seller ${result.sellerId}.`);
            } catch (notifyError) {
                 console.error(`Payment Release: Failed to send notification for payment ${paymentId}:`, notifyError);
            }
            console.log("--- API POST /api/payment/release SUCCESS ---");
             return NextResponse.json({ message: 'Receipt confirmed and funds released to seller balance.' }, { status: 200 });
        } else {
             console.warn(`Payment Release: Transaction completed but didn't return expected success object for ${paymentId}. Result:`, result);
             return NextResponse.json({ message: 'Confirmation processed but with unexpected result.' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("--- API POST /api/payment/release FAILED --- Error:", error);
        const status = error.message.startsWith('Forbidden') ? 403 : 500;
        return NextResponse.json({ message: error.message || 'Failed to confirm receipt.' }, { status });
    }
}
