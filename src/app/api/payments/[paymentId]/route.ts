import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { PaymentStatus, ItemStatus } from "@prisma/client";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: Request, context: any) {
    console.log("API GET /api/payments/[paymentId] (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Payments GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { paymentId } = context.params;

    try {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                item: {
                    select: {
                        id: true,
                        title: true,
                        sellerId: true,
                        status: true,
                        mediaUrls: true
                    }
                },
                seller: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                buyer: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!payment) {
            console.log(`API Payments GET: Payment ${paymentId} not found.`);
            return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
        }

        if (payment.buyerId !== userId && payment.sellerId !== userId) {
            console.warn(`API Payments GET: User ${userId} forbidden access to payment ${paymentId}.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        console.log(`API Payments GET: Successfully retrieved payment ${paymentId}`);
        return NextResponse.json(payment);

    } catch (error: any) {
        console.error("API Payments GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch payment', error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request, context: any) {
    console.log("API PATCH /api/payments/[paymentId] (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Payments PATCH: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { paymentId } = context.params;

    try {
        const body = await req.json();
        const { status, releaseCode } = body;

        if (!status || !['pending', 'completed', 'released', 'refunded', 'disputed'].includes(status)) {
            console.error("API Payments PATCH: Invalid status provided.");
            return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
        }

        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            select: {
                id: true,
                status: true,
                buyerId: true,
                sellerId: true,
                item: {
                    select: {
                        id: true,
                        title: true,
                        status: true
                    }
                }
            }
        });

        if (!payment) {
            console.log(`API Payments PATCH: Payment ${paymentId} not found.`);
            return NextResponse.json({ message: 'Payment not found' }, { status: 404 });
        }

        if (payment.buyerId !== userId && payment.sellerId !== userId) {
            console.warn(`API Payments PATCH: User ${userId} forbidden access to payment ${paymentId}.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        if (status === 'released') {
            if (payment.buyerId !== userId) {
                console.warn(`API Payments PATCH: Only buyer can release payment. User ${userId} attempted to release payment ${paymentId}.`);
                return NextResponse.json({ message: 'Only buyer can release payment' }, { status: 403 });
            }

            if (payment.status !== PaymentStatus.SUCCESSFUL_ESCROW) {
                console.warn(`API Payments PATCH: Cannot release payment ${paymentId} with status ${payment.status}.`);
                return NextResponse.json({ message: 'Payment must be in escrow before release' }, { status: 400 });
            }
        }

        const updatedPayment = await prisma.payment.update({
            where: { id: paymentId },
            data: { status },
            include: {
                item: {
                    select: {
                        id: true,
                        title: true,
                        status: true
                    }
                }
            }
        });

        if (status === 'released') {
            await prisma.item.update({
                where: { id: payment.item.id },
                data: { status: ItemStatus.SOLD }
            });

            await createNotification({
                userId: payment.sellerId,
                type: 'payment_released',
                message: `Payment for "${payment.item.title}" has been released.`,
                relatedItemId: payment.item.id
            });
        }

        console.log(`API Payments PATCH: Successfully updated payment ${paymentId} status to ${status}`);
        return NextResponse.json(updatedPayment);

    } catch (error: any) {
        console.error("API Payments PATCH Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to update payment', error: error.message }, { status: 500 });
    }
} 