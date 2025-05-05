// src/app/api/payment/confirm-receipt/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Earning, Payment } from '@/lib/types'; 
import { v4 as uuidv4 } from 'uuid';

// --- Zod Schema --- 
const confirmSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

// --- Platform Fee Calculation --- 
const PLATFORM_FEE_PERCENTAGE = 0.10; 

const calculateFee = (amount: number): { fee: number, netAmount: number } => {
    const fee = Math.round(amount * PLATFORM_FEE_PERCENTAGE * 100) / 100; 
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
            const { fee, netAmount } = calculateFee(paymentData.amount);
            console.log(`Confirm Receipt: Calculated fee=${fee}, netAmount=${netAmount} for payment ${paymentId}`);

            // --- Prepare Updates --- 
            const sellerId = paymentData.sellerId;
            // FIX: Add non-null assertion here
            const sellerRef = adminDb!.collection('users').doc(sellerId);
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
            
            console.log(`Confirm Receipt: Prepared updates for payment ${paymentId}, created earning ${earningId} for seller ${sellerId}.`);
            return { success: true, sellerId, netAmount, itemId: paymentData.itemId };
        });

        if (result?.success) {
            console.log(`Confirm Receipt: Transaction successful for payment ${paymentId}.`);
            try {
                let itemTitle = 'Item';
                if (result.itemId) {
                     // FIX: Add non-null assertion here
                    const itemDoc = await adminDb!.collection('items').doc(result.itemId).get();
                    if (itemDoc.exists) itemTitle = itemDoc.data()?.title || 'Item';
                }
                 await createNotification({
                     userId: result.sellerId,
                     type: 'funds_available',
                     message: `Funds (KES ${result.netAmount}) for "${itemTitle}" are now available in your earnings balance.`,
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
