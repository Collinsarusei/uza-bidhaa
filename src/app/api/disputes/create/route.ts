// src/app/api/disputes/create/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import { Payment, Item, DisputeRecord, UserProfile } from '@/lib/types';
import { createNotification } from '@/lib/notifications';
import { v4 as uuidv4 } from 'uuid';

const disputeCreateSchema = z.object({
  paymentId: z.string().min(1, "Payment ID is required"),
  itemId: z.string().min(1, "Item ID is required"),
  reason: z.string().min(1, "Dispute reason is required"),
  description: z.string().min(1, "Detailed description is required").max(2000, "Description too long"),
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
  const filedByUserId = session.user.id;

  try {
    let body;
    try { body = await req.json(); } 
    catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }

    const validation = disputeCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { paymentId, itemId, reason, description } = validation.data;
    console.log(`Dispute Create: User ${filedByUserId} attempting to file dispute for payment ${paymentId}, item ${itemId}`);

    const paymentRef = adminDb.collection('payments').doc(paymentId);
    const itemRef = adminDb.collection('items').doc(itemId);
    const disputeId = uuidv4();
    const disputeRef = adminDb.collection('disputes').doc(disputeId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const paymentDoc = await transaction.get(paymentRef);
      const itemDoc = await transaction.get(itemRef);

      if (!paymentDoc.exists) throw new Error('Payment record not found.');
      if (!itemDoc.exists) throw new Error('Item record not found.');

      const paymentData = paymentDoc.data() as Payment;
      const itemData = itemDoc.data() as Item;

      // Authorization: Ensure the user filing is either the buyer or seller
      let otherPartyUserId: string;
      if (paymentData.buyerId === filedByUserId) {
        otherPartyUserId = paymentData.sellerId;
      } else if (paymentData.sellerId === filedByUserId) {
        otherPartyUserId = paymentData.buyerId;
      } else {
        throw new Error('Forbidden: You are not a party to this transaction.');
      }

      if (paymentData.status === 'initiated' || paymentData.status === 'cancelled' || paymentData.status === 'refunded') {
        throw new Error(`Cannot file dispute for payment with status: ${paymentData.status}`);
      }
      // Potentially allow disputing 'released_to_seller_balance' for a limited time (e.g., item not as described after release)
      // For now, let's assume it's mainly for 'paid_to_platform' or already disputed states.

      const newDispute: DisputeRecord = {
        id: disputeId,
        paymentId,
        itemId,
        filedByUserId,
        otherPartyUserId,
        reason,
        description,
        status: 'pending_admin', // Initial status for admin review
        createdAt: FieldValue.serverTimestamp() as any, // Cast for type compatibility during set
        updatedAt: FieldValue.serverTimestamp() as any, // Cast for type compatibility during set
      };

      transaction.set(disputeRef, newDispute);
      transaction.update(paymentRef, {
        status: 'disputed',
        isDisputed: true,
        disputeId: disputeId, // Link payment to dispute record
        disputeReason: reason, // Store the high-level reason on payment too
        disputeFiledBy: filedByUserId,
        disputeSubmittedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(itemRef, {
        status: 'disputed', // Also mark the item as disputed
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      console.log(`Dispute Create: Dispute ${disputeId} created by ${filedByUserId}. Payment ${paymentId} and item ${itemId} statuses updated to 'disputed'.`);
      return { 
        success: true, 
        disputeId, 
        otherPartyUserId, 
        filedByUserName: session.user?.name || filedByUserId,
        itemTitle: itemData.title || 'the item'
      };
    });

    if (result?.success) {
      // Notify the other party
      await createNotification({
        userId: result.otherPartyUserId,
        type: 'dispute_filed',
        message: `${result.filedByUserName} has filed a dispute regarding payment for "${result.itemTitle}". An admin will review it.`, 
        relatedItemId: itemId,
        relatedPaymentId: paymentId,
        relatedDisputeId: result.disputeId,
      });

      // Notify Admins (assuming you have a way to get admin user IDs or a topic)
      // This is a placeholder for admin notification logic
      const adminsSnapshot = await adminDb.collection('users').where('role', '==', 'admin').get();
      if (!adminsSnapshot.empty) {
        adminsSnapshot.forEach(adminDoc => {
          createNotification({
            userId: adminDoc.id,
            type: 'new_dispute_admin',
            message: `New dispute (#${result.disputeId.substring(0,6)}) filed by ${result.filedByUserName} for item "${result.itemTitle}". Please review.`, 
            relatedItemId: itemId,
            relatedPaymentId: paymentId,
            relatedDisputeId: result.disputeId,
          }).catch(err => console.error("Failed to send admin dispute notification:", err));
        });
      }
      console.log(`Dispute Create: Notifications sent for dispute ${result.disputeId}.`);
      return NextResponse.json({ message: 'Dispute filed successfully. Admins have been notified.', disputeId: result.disputeId }, { status: 201 });
    }
    throw new Error('Transaction failed to return expected result.');

  } catch (error: any) {
    console.error("--- API POST /api/disputes/create FAILED --- Error:", error);
    const status = error.message.startsWith('Forbidden') ? 403 : error.message.includes('not found') ? 404 : 400;
    return NextResponse.json({ message: error.message || 'Failed to file dispute.' }, { status });
  }
}
