// src/app/api/disputes/create/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

const disputeCreateSchema = z.object({
  paymentId: z.string().min(1, "Payment ID is required"),
  itemId: z.string().min(1, "Item ID is required"), // Ensure itemId from payment matches item being disputed
  reason: z.string().min(1, "Dispute reason is required"),
  description: z.string().min(1, "Detailed description is required").max(2000, "Description too long"),
});

export async function POST(req: Request) {
  console.log("--- API POST /api/disputes/create (Prisma) START ---");

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.name) {
    console.warn("Dispute Create: Unauthorized or user name missing.");
    return NextResponse.json({ message: 'Unauthorized or user data incomplete' }, { status: 401 });
  }
  const filedByUserId = session.user.id;
  const filedByUserName = session.user.name;

  try {
    let body;
    try { body = await req.json(); } 
    catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }

    const validation = disputeCreateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { paymentId, itemId, reason, description } = validation.data;
    console.log(`Dispute Create: User ${filedByUserId} attempting dispute for payment ${paymentId}, item ${itemId}`);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { item: { select: { id: true, title: true, status: true } } } 
      });

      if (!payment) throw new Error('Payment record not found.');
      if (!payment.item) throw new Error('Item record not found for this payment.');
      if (payment.itemId !== itemId) throw new Error('Item ID mismatch: The item specified does not match the payment record.');

      let otherPartyUserId: string;
      if (payment.buyerId === filedByUserId) {
        otherPartyUserId = payment.sellerId;
      } else if (payment.sellerId === filedByUserId) {
        otherPartyUserId = payment.buyerId;
      } else {
        throw new Error('Forbidden: You are not a party to this transaction.');
      }

      // Prevent filing dispute on payments with terminal or irrelevant statuses
      const nonDisputableStatuses = [
        'INITIATED',
        'CANCELLED',
        'REFUNDED_TO_BUYER',
        'RELEASED_TO_SELLER',
        'FAILED',
        'DISPUTED'
      ];
      if (nonDisputableStatuses.includes(payment.status)) {
        throw new Error(`Cannot file dispute for payment with status: ${payment.status}`);
      }
      if (payment.activeDisputeId) {
        throw new Error('An active dispute already exists for this payment.');
      }

      // Create the dispute record
      const newDispute = await tx.dispute.create({
        data: {
          paymentId: paymentId,
          itemId: itemId,
          filedByUserId: filedByUserId,
          otherPartyUserId: otherPartyUserId,
          reason: reason,
          description: description,
          status: 'PENDING_ADMIN',
        }
      });

      // Update Payment to link to this new dispute and set status
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'DISPUTED',
          activeDisputeId: newDispute.id,
        }
      });

      // Update Item status to DISPUTED
      // (Only if it's not already SOLD or DELISTED, though payment status check should prevent this)
      if (payment.item.status !== 'SOLD' && payment.item.status !== 'DELISTED') {
        await tx.item.update({
          where: { id: itemId },
          data: { status: 'DISPUTED' }
        });
      }
      
      console.log(`Dispute Create: Dispute ${newDispute.id} created. Payment ${paymentId} and Item ${itemId} statuses updated.`);
      return { 
        success: true, 
        disputeId: newDispute.id, 
        otherPartyUserId, 
        itemTitle: payment.item.title || 'the item'
      };
    });

    if (result?.success) {
      await createNotification({
        userId: result.otherPartyUserId,
        type: 'dispute_filed',
        message: `${filedByUserName} filed a dispute regarding "${result.itemTitle}". Admin will review.`,
        relatedItemId: itemId,
        relatedPaymentId: paymentId,
        relatedDisputeId: result.disputeId,
      });

      const adminUsers = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of adminUsers) {
        await createNotification({
          userId: admin.id,
          type: 'new_dispute_admin',
          message: `New dispute (#${result.disputeId.substring(0,6)}) by ${filedByUserName} for "${result.itemTitle}". Review needed.`,
          relatedItemId: itemId,
          relatedPaymentId: paymentId,
          relatedDisputeId: result.disputeId,
        }).catch(err => console.error(`Failed to send admin dispute notification to ${admin.id}:`, err));
      }
      
      return NextResponse.json({ message: 'Dispute filed successfully. Admins and other party notified.', disputeId: result.disputeId }, { status: 201 });
    }
    throw new Error('Transaction failed to return expected result.');

  } catch (error: any) {
    console.error("--- API POST /api/disputes/create (Prisma) FAILED --- Error:", error);
    const statusCode = error.message.startsWith('Forbidden') ? 403 
                     : error.message.includes('not found') ? 404 
                     : error.message.includes('status:') || error.message.includes('active dispute') ? 400 
                     : 500;
    return NextResponse.json({ message: error.message || 'Failed to file dispute.' }, { status: statusCode });
  }
}
