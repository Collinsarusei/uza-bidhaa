// src/app/api/admin/payments/[paymentId]/admin-refund/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust path as needed
import { createNotification } from '@/lib/notifications';
import { Prisma } from '@prisma/client';

interface AdminRefundParams {
    params: {
        paymentId: string;
    };
}

interface AdminRefundBody {
    disputeId?: string;
    adminNotes?: string;
}

export async function POST(req: Request, context: any) {
    const { paymentId } = context.params;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-refund (Prisma) START ---`);

    if (!paymentId) {
        return NextResponse.json({ message: 'Missing payment ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn(`Admin Refund ${paymentId}: Unauthorized or not admin.`);
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const adminUserId = session.user.id;

    let requestBody: AdminRefundBody = {};
    try {
        requestBody = await req.json();
    } catch (e) {
        console.log(`Admin Refund ${paymentId}: No JSON body or optional fields provided.`);
    }
    const { disputeId, adminNotes } = requestBody;
    const notesForDispute = adminNotes || `Refund processed by admin ${session.user?.email || adminUserId}.`;

    try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: { item: { select: { id: true, title: true, quantity: true, status: true } } }
            });

            if (!payment) {
                throw new Error('Payment record not found.');
            }

            if (!(['SUCCESSFUL_ESCROW'] as string[]).includes(payment.status)) {
                throw new Error(`Cannot refund payment with status: ${payment.status}. Expected SUCCESSFUL_ESCROW.`);
            }
            if (payment.status === 'REFUNDED_TO_BUYER') {
                throw new Error('Payment has already been refunded.');
            }
            if (!payment.item) {
                throw new Error('Item associated with payment not found.');
            }

            // 1. Update Payment Status
            await tx.payment.update({
                where: { id: paymentId },
                data: {
                    status: 'REFUNDED_TO_BUYER',
                    platformFeeCharged: null, 
                }
            });

            // 2. Restock Item: Increment quantity and set status to AVAILABLE
            await tx.item.update({
                where: { id: payment.itemId },
                data: {
                    quantity: { increment: 1 },
                    status: 'AVAILABLE', 
                }
            });
            console.log(`Admin Refund: Item ${payment.itemId} status set to AVAILABLE, quantity incremented.`);

            // 3. Credit Buyer's Platform Available Balance
            await tx.user.update({
                where: { id: payment.buyerId },
                data: { availableBalance: { increment: payment.amount } }
            });
            console.log(`Admin Refund: Credited KES ${payment.amount.toFixed(2)} to buyer ${payment.buyerId} platform availableBalance.`);

            // 4. If a disputeId was provided, update the dispute record
            if (disputeId) {
                const dispute = await tx.dispute.findUnique({ where: { id: disputeId }});
                if (dispute && dispute.paymentId === paymentId) { 
                    await tx.dispute.update({
                        where: { id: disputeId },
                        data: {
                            status: 'RESOLVED_REFUND',
                            resolutionNotes: notesForDispute,
                            resolvedAt: new Date(),
                        }
                    });
                    console.log(`Admin Refund: Dispute ${disputeId} for payment ${paymentId} marked as RESOLVED_REFUND.`);
                } else if (dispute) {
                    console.warn(`Admin Refund: Provided disputeId ${disputeId} does not match paymentId ${paymentId}. Not updating dispute.`);
                } else {
                    console.warn(`Admin Refund: Provided disputeId ${disputeId} not found. Not updating dispute.`);
                }
            }
            
            console.log(`Admin Refund: Payment ${paymentId} marked as refunded. Buyer platform balance updated.`);
            return { 
                success: true, 
                buyerId: payment.buyerId, 
                sellerId: payment.sellerId, 
                amountRefunded: payment.amount, 
                itemId: payment.itemId,
                itemTitle: payment.item.title || payment.itemTitle || 'Item',
                wasDisputed: !!disputeId,
                disputeIdIfAny: disputeId 
            };
        });

        if (result?.success) {
            await createNotification({
                userId: result.buyerId,
                type: 'payment_refunded',
                message: `Admin processed a refund of KES ${result.amountRefunded.toDecimalPlaces(2).toString()} for "${result.itemTitle}". Funds are in your balance.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            await createNotification({
                userId: result.sellerId,
                type: 'payment_refund_processed',
                message: `Admin processed a refund to the buyer for item "${result.itemTitle}" (Payment ID: ${paymentId}). The item has been restocked.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
                relatedDisputeId: result.disputeIdIfAny
            });
            return NextResponse.json({ message: 'Refund processed successfully.' }, { status: 200 });
        }
        throw new Error('Transaction failed unexpectedly after completion (admin refund).');

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-refund (Prisma) FAILED --- Error:`, error.message);
        const statusCode = error.message?.includes('Forbidden') ? 403 
                         : error.message?.includes('not found') ? 404 
                         : error.message?.includes('status:') ? 400 
                         : error.message?.includes('already been refunded') ? 409 
                         : 500;
        return NextResponse.json({ message: error.message || 'Failed to process refund.' }, { status: statusCode });
    }
}
