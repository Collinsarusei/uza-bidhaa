// src/app/api/orders/[orderId]/confirm/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function POST(
    req: Request,
    { params }: { params: { orderId: string } }
) {
    console.log("--- API POST /api/orders/[orderId]/confirm (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Order Confirm: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const orderId = params.orderId;
    const userId = session.user.id;

    console.log(`API Order Confirm: Confirming order ${orderId} for user ${userId}`);

    try {
        const order = await prisma.order.findUnique({
            where: {
                id: orderId,
                buyerId: userId, // Ensure the user confirming is the buyer
            },
            include: {
                item: {
                    select: {
                        id: true,
                        sellerId: true,
                        status: true,
                    },
                },
            },
        });

        if (!order) {
            console.warn(`API Order Confirm: Order ${orderId} not found for user ${userId}`);
            return NextResponse.json({ message: 'Order not found' }, { status: 404 });
        }

        if (order.status !== 'PENDING_FULFILLMENT') {
            console.warn(`API Order Confirm: Order ${orderId} is not in PENDING_FULFILLMENT state.`);
            return NextResponse.json({ message: 'Order is not in a confirmable state.' }, { status: 400 });
        }

        if (!order.item) {
            console.error(`API Order Confirm: Item not found for order ${orderId}`);
            return NextResponse.json({ message: 'Item not found for this order.' }, { status: 500 });
        }

        // Use a transaction to ensure all operations succeed or fail together
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Update Item status to SOLD
            await tx.item.update({
                where: { id: order.itemId },
                data: { status: 'SOLD' },
            });

            // 2. Update Order status to COMPLETED
            await tx.order.update({
                where: { id: orderId },
                data: { status: 'COMPLETED' },
            });
            
            // 3. Update Payment status to RELEASED_TO_SELLER
            await tx.payment.update({
                where: { id: order.paymentId },
                data: { status: 'RELEASED_TO_SELLER' }
            });

            // 4. Create an Earning record for the seller
            await tx.earning.create({
                data: {
                    userId: order.sellerId,
                    relatedPaymentId: order.paymentId,
                    relatedItemId: order.itemId,
                    amount: order.amount,
                    itemTitleSnapshot: order.itemTitle,
                    status: 'AVAILABLE'
                }
            });

            // 5. Update the seller's availableBalance
            await tx.user.update({
                where: { id: order.sellerId },
                data: {
                    availableBalance: {
                        increment: order.amount,
                    },
                },
            });

            console.log(`API Order Confirm: Credited seller ${order.sellerId} with KES ${order.amount}`);
        });

        console.log(`API Order Confirm: Order ${orderId} confirmed successfully.`);
        return NextResponse.json({ message: 'Order confirmed successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/orders/[orderId]/confirm (Prisma) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to confirm order.', error: error.message }, { status: 500 });
    }
}
