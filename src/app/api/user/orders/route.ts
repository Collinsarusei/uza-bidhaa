// src/app/api/user/orders/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route'; 
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: Request) {
    console.log("--- API GET /api/user/orders (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API User Orders GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || session.user.id;
    
    // Validate userId if provided in query params
    if (searchParams.get('userId') && searchParams.get('userId') !== session.user.id) {
        console.warn(`API User Orders GET: User ${session.user.id} attempted to access orders for user ${userId}`);
        return NextResponse.json({ message: "Forbidden: Cannot access other users' orders" }, { status: 403 });
    }

    console.log(`API User Orders GET: Fetching orders for user ${userId}`);

    try {
        const userOrders = await prisma.order.findMany({
            where: {
                buyerId: userId,
            },
            include: {
                item: {
                    select: {
                        id: true,
                        title: true,
                        mediaUrls: true,
                        seller: { select: { id: true, name: true } }
                    }
                },
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        if (userOrders.length === 0) {
            console.log(`API User Orders GET: No orders found for user ${userId}`);
            return NextResponse.json([], { status: 200 });
        }

        // Type-safe conversion
        const ordersToReturn: Order[] = userOrders.map((order) => ({
            id: order.id,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            itemId: order.itemId,
            itemTitle: order.itemTitle,
            amount: order.amount as Prisma.Decimal,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            itemDetails: order.item ? {
                id: order.item.id,
                title: order.item.title,
                mediaUrls: order.item.mediaUrls,
                seller: order.item.seller ? { id: order.item.seller.id, name: order.item.seller.name || '' } : { id: 'N/A', name: 'N/A' }
            } : null,
        }));

        console.log(`API User Orders GET: Found ${ordersToReturn.length} orders for user ${userId}`);
        console.log("--- API GET /api/user/orders (Prisma) SUCCESS ---");
        return NextResponse.json(ordersToReturn, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/orders (Prisma) FAILED ---", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ 
                message: 'Database error occurred', 
                code: error.code,
                meta: error.meta 
            }, { status: 500 });
        }
        return NextResponse.json({ 
            message: 'Failed to fetch user orders', 
            error: error.message 
        }, { status: 500 });
    }
}
