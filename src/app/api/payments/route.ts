import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
    console.log("API GET /api/payments (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Payments GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const [payments, total] = await Promise.all([
            prisma.payment.findMany({
                where: {
                    OR: [
                        { buyerId: userId },
                        { sellerId: userId }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    item: {
                        select: {
                            id: true,
                            title: true,
                            mediaUrls: true,
                            status: true
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
            }),
            prisma.payment.count({
                where: {
                    OR: [
                        { buyerId: userId },
                        { sellerId: userId }
                    ]
                }
            })
        ]);

        console.log(`API Payments GET: Found ${payments.length} payments for user ${userId}`);
        return NextResponse.json({
            payments,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                hasMore: skip + payments.length < total
            }
        });

    } catch (error: any) {
        console.error("API Payments GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch payments', error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    console.log("API POST /api/payments (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Payments POST: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const body = await req.json();
        const { itemId, amount, releaseCode } = body;

        if (!itemId || !amount || !releaseCode) {
            console.error("API Payments POST: Missing required fields.");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        const item = await prisma.item.findUnique({
            where: { id: itemId },
            select: {
                id: true,
                title: true,
                sellerId: true,
                status: true,
                price: true
            }
        });

        if (!item) {
            console.log(`API Payments POST: Item ${itemId} not found.`);
            return NextResponse.json({ message: 'Item not found' }, { status: 404 });
        }

        if (item.status !== 'AVAILABLE') {
            console.warn(`API Payments POST: Item ${itemId} is not available for purchase.`);
            return NextResponse.json({ message: 'Item is not available for purchase' }, { status: 400 });
        }

        if (item.sellerId === userId) {
            console.warn(`API Payments POST: User ${userId} attempted to purchase their own item ${itemId}.`);
            return NextResponse.json({ message: 'Cannot purchase your own item' }, { status: 400 });
        }

        if (amount !== item.price) {
            console.warn(`API Payments POST: Payment amount ${amount} does not match item price ${item.price}.`);
            return NextResponse.json({ message: 'Payment amount does not match item price' }, { status: 400 });
        }

        const payment = await prisma.payment.create({
            data: {
                itemId,
                buyerId: userId,
                sellerId: item.sellerId,
                amount,
                status: 'INITIATED',
                currency: 'KES',
                paymentGateway: 'paystack'
            },
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

        await createNotification({
            userId: item.sellerId,
            type: 'new_payment',
            message: `New payment received for "${item.title}".`,
            relatedItemId: item.id
        });

        console.log(`API Payments POST: Successfully created payment for item ${itemId}`);
        return NextResponse.json(payment, { status: 201 });

    } catch (error: any) {
        console.error("API Payments POST Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to create payment', error: error.message }, { status: 500 });
    }
} 