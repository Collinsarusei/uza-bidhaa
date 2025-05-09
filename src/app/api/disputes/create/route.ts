// src/app/api/disputes/create/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import * as z from 'zod';
import { Payment, Item, Notification, DisputeRecord, DisputeStatus } from '@/lib/types'; // Added DisputeRecord, DisputeStatus
import { createNotification } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';

// Zod schema for dispute creation request validation
const createDisputeSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
    reason: z.string().min(10, "Dispute reason must be at least 10 characters").max(500, "Dispute reason cannot exceed 500 characters"),
    description: z.string().min(20, "Detailed description must be at least 20 characters").max(2000, "Description cannot exceed 2000 characters"),
});

export async function POST(req: Request) {
    console.log("--- API POST /api/disputes/create START ---");

    if (!adminDb) {
        console.error("Dispute Create Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Dispute Create: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userIdFilingDispute = session.user.id;

    try {
        const body = await req.json();
        const validation = createDisputeSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }

        const { paymentId, reason, description } = validation.data;
        const disputeId = uuidv4(); 

        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const disputeDocRef = adminDb.collection('disputes').doc(disputeId); // For dedicated disputes collection

        console.log(`Dispute Create: User ${userIdFilingDispute} filing dispute ${disputeId} for payment ${paymentId}. Reason: ${reason}`);

        const result = await adminDb.runTransaction(async (transaction) => {
            const paymentDoc = await transaction.get(paymentRef);
            if (!paymentDoc.exists) {
                throw new Error('Payment record not found.');
            }
            const paymentData = paymentDoc.data() as Payment;

            if (paymentData.buyerId !== userIdFilingDispute && paymentData.sellerId !== userIdFilingDispute) {
                throw new Error('Forbidden: You are not part of this transaction.');
            }

            if (!['paid_to_platform', 'admin_review', 'paid_escrow'].includes(paymentData.status)) {
                // paid_escrow is a common state for items where a dispute might arise
                // admin_review implies it might already be under some form of review
                // Consider if 'released_to_seller_balance' should also allow disputes for a short window (e.g., item not as described)
                throw new Error(`Cannot file dispute for payment with status: ${paymentData.status}.`);
            }
            if (paymentData.isDisputed) {
                throw new Error('A dispute has already been filed for this payment.');
            }

            const otherPartyUserId = paymentData.buyerId === userIdFilingDispute ? paymentData.sellerId : paymentData.buyerId;

            // Update Payment document
            transaction.update(paymentRef, {
                isDisputed: true,
                disputeReason: reason, 
                disputeFiledBy: userIdFilingDispute,
                disputeSubmittedAt: FieldValue.serverTimestamp(),
                status: 'disputed', 
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Create a detailed dispute record in 'disputes' collection
            const disputeRecordData: DisputeRecord = {
                id: disputeId,
                paymentId: paymentId,
                itemId: paymentData.itemId,
                filedByUserId: userIdFilingDispute,
                otherPartyUserId: otherPartyUserId,
                reason: reason,
                description: description,
                status: 'open', // Initial status
                createdAt: FieldValue.serverTimestamp() as any, // Cast for server timestamp
                updatedAt: FieldValue.serverTimestamp() as any, // Cast for server timestamp
            };
            transaction.set(disputeDocRef, disputeRecordData);

            return { 
                success: true, 
                itemId: paymentData.itemId,
                itemTitle: paymentData.itemTitle, 
                otherPartyId: otherPartyUserId 
            };
        });

        console.log(`Dispute Create: Dispute ${disputeId} recorded for payment ${paymentId}.`);

        // --- Send Notifications ---
        if (result.success) {
            const adminUserId = process.env.ADMIN_USER_ID_FOR_NOTIFICATIONS;
            
            if (result.otherPartyId) {
                await createNotification({
                    userId: result.otherPartyId,
                    type: 'dispute_filed', 
                    message: `A dispute has been filed regarding item "${result.itemTitle || 'Item'}". An admin will review it.`, 
                    relatedItemId: result.itemId,
                    relatedPaymentId: paymentId,
                    relatedDisputeId: disputeId // Link to the new dispute record
                });
            }
            if (adminUserId) {
                 await createNotification({
                     userId: adminUserId,
                     type: 'new_dispute_admin',
                     message: `New dispute (ID: ${disputeId.substring(0,8)}) filed by user ${userIdFilingDispute.substring(0,8)} for payment ${paymentId.substring(0,8)} on item "${result.itemTitle || 'Item'}". Reason: ${reason}.`, 
                     relatedItemId: result.itemId,
                     relatedPaymentId: paymentId,
                     relatedDisputeId: disputeId // Link to the new dispute record
                 });
            } else {
                 console.warn("Dispute Create: ADMIN_USER_ID_FOR_NOTIFICATIONS not set. Admin not notified of new dispute.");
            }
        }

        return NextResponse.json({ message: 'Dispute filed successfully. Admin will review your case.', disputeId }, { status: 201 });

    } catch (error: any) {
        console.error("--- API POST /api/disputes/create FAILED --- Error:", error);
        const status = error.message?.startsWith('Forbidden') ? 403 : error.message?.includes('not found') ? 404 : 400;
        return NextResponse.json({ message: error.message || 'Failed to file dispute.' }, { status });
    }
}
