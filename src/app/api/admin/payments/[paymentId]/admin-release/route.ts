// src/app/api/admin/payments/[paymentId]/admin-release/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item, Earning, UserProfile, PlatformSettings } from '@/lib/types';
import { createNotification } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PLATFORM_FEE_PERCENTAGE = 0.10; // 10%

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const adminUserEmail = process.env.ADMIN_EMAIL;
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    return !!userId; // Fallback, NOT SECURE for production
}

async function getPlatformFeePercentage(): Promise<number> {
    if (!adminDb) {
        console.warn("getPlatformFeePercentage (admin-release): Firebase Admin DB not initialized. Using default fee.");
        return DEFAULT_PLATFORM_FEE_PERCENTAGE;
    }
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
        console.error("Error fetching platform fee from Firestore (admin-release):", error);
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
    params: {
      paymentId?: string;
    };
}

export async function POST(req: Request, context: RouteContext) {
    const paymentId = context.params?.paymentId;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-release START ---`);

    if (!paymentId) {
        return NextResponse.json({ message: 'Missing payment ID' }, { status: 400 });
    }
    if (!adminDb) {
        console.error(`Admin Release ${paymentId}: Firebase Admin DB not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn(`Admin Release ${paymentId}: Unauthorized attempt by user ${session?.user?.id}.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = session?.user?.id; // For logging/audit if needed
    console.log(`Admin Release ${paymentId}: Authenticated admin action by ${adminUserId}.`);

    try {
        const paymentRef = adminDb.collection('payments').doc(paymentId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.status !== 'paid_to_platform' && paymentData.status !== 'disputed' && paymentData.status !== 'admin_review') {
                throw new Error(`Cannot release payment with status: ${paymentData.status}.`);
            }

            const { fee, netAmount } = await calculateFee(paymentData.amount);
            const sellerId = paymentData.sellerId;
            if (!sellerId) throw new Error('Seller ID missing on payment record.');

            const itemRef = adminDb.collection('items').doc(paymentData.itemId);
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

            transaction.update(paymentRef, {
                status: 'released_to_seller_balance',
                updatedAt: FieldValue.serverTimestamp(),
                isDisputed: false, // Clear dispute flag if it was set
                disputeReason: FieldValue.delete(),
            });
            transaction.update(itemRef, {
                status: 'sold', // Or 'completed'
                updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(earningRef, {
                ...earningData,
                id: earningId, // Ensure 'id' field is written
                createdAt: FieldValue.serverTimestamp(),
            });
            transaction.update(sellerRef, {
                availableBalance: FieldValue.increment(netAmount)
            });

            console.log(`Admin Release: Payment ${paymentId} released to seller ${sellerId}. Net: ${netAmount}, Fee: ${fee}`);
            return { success: true, sellerId, buyerId: paymentData.buyerId, netAmount, itemId: paymentData.itemId, itemTitle: (await transaction.get(itemRef)).data()?.title || 'Item' };
        });

        if (result?.success) {
            try {
                await createNotification({
                    userId: result.sellerId,
                    type: 'payment_released',
                    message: `Admin released funds (KES ${result.netAmount}) for "${result.itemTitle}". Funds are now in your earnings.`,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
                await createNotification({
                    userId: result.buyerId,
                    type: 'admin_action',
                    message: `Admin has resolved the issue for order "${result.itemTitle}" and released payment to the seller.`,
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                });
            } catch (notifyError) {
                console.error(`Admin Release ${paymentId}: Failed to send notifications:`, notifyError);
            }
            return NextResponse.json({ message: 'Funds released to seller successfully.' }, { status: 200 });
        }
        throw new Error('Transaction failed to return expected result.');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-release FAILED --- Error:`, error);
        return NextResponse.json({ message: error.message || 'Failed to release funds.' }, { status: 500 });
    }
}
