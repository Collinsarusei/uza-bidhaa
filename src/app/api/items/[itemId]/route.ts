import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma, ItemStatus } from '@prisma/client';
import { handleApiError, validateAuth, validateResourceAccess, AppError } from '@/lib/error-handling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

interface ItemParams {
    params: {
        itemId: string;
    };
}

// Define the response structure with proper types
interface ItemResponse {
    id: string;
    title: string;
    description: string;
    price: Prisma.Decimal;
    quantity: number;
    status: ItemStatus;
    mediaUrls: string[];
    category: string;
    condition?: string;
    sellerId: string;
    createdAt: Date;
    updatedAt: Date;
    seller: {
        id: string;
        name: string | null;
        image: string | null;
        email: string | null;
    };
    tracking?: {
        trackingNumber: string;
        carrier: string;
        estimatedDeliveryDays: number;
        notes?: string;
        status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED';
    } | null;
}

export async function GET(req: Request, context: ItemParams) {
    const { itemId } = context.params;
    console.log(`--- API GET /api/items/${itemId} (Prisma) START ---`);

    if (!itemId) {
        throw new AppError('Missing item ID', 400);
    }

    try {
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        email: true,
                    },
                },
                tracking: true,
            },
        });

        if (!item) {
            throw new AppError('Item not found', 404);
        }

        // Type-safe conversion
        const itemResponse: ItemResponse = {
            ...item,
            price: item.price as Prisma.Decimal,
            status: item.status as ItemStatus,
            tracking: item.tracking ? {
                trackingNumber: item.tracking.trackingNumber,
                carrier: item.tracking.carrier,
                estimatedDeliveryDays: item.tracking.estimatedDeliveryDays,
                notes: item.tracking.notes || undefined,
                status: item.tracking.status as 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED',
            } : null
        };

        console.log(`API /items/${itemId}: Item found successfully`);
        console.log("--- API GET /api/items/[itemId] (Prisma) SUCCESS ---");
        return NextResponse.json(itemResponse, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}

export async function PATCH(req: Request, context: ItemParams) {
    const { itemId } = context.params;
    console.log(`--- API PATCH /api/items/${itemId} (Prisma) START ---`);

    if (!itemId) {
        throw new AppError('Missing item ID', 400);
    }

    try {
        const userId = validateAuth(await getServerSession(authOptions));
        const requestBody = await req.json();
        
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            select: { sellerId: true }
        });

        if (!item) {
            throw new AppError('Item not found', 404);
        }

        validateResourceAccess(userId, item.sellerId);

        const updatedItem = await prisma.item.update({
            where: { id: itemId },
            data: requestBody,
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        email: true,
                    },
                },
                tracking: true,
            },
        });

        // Type-safe conversion
        const itemResponse: ItemResponse = {
            ...updatedItem,
            price: updatedItem.price as Prisma.Decimal,
            status: updatedItem.status as ItemStatus,
            tracking: updatedItem.tracking ? {
                trackingNumber: updatedItem.tracking.trackingNumber,
                carrier: updatedItem.tracking.carrier,
                estimatedDeliveryDays: updatedItem.tracking.estimatedDeliveryDays,
                notes: updatedItem.tracking.notes || undefined,
                status: updatedItem.tracking.status as 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED',
            } : null
        };

        console.log(`API /items/${itemId}: Item updated successfully`);
        console.log("--- API PATCH /api/items/[itemId] (Prisma) SUCCESS ---");
        return NextResponse.json(itemResponse, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}

export async function DELETE(req: Request, context: ItemParams) {
    const { itemId } = context.params;
    console.log(`--- API DELETE /api/items/${itemId} (Prisma) START ---`);

    if (!itemId) {
        throw new AppError('Missing item ID', 400);
    }

    try {
        const userId = validateAuth(await getServerSession(authOptions));
        
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            select: { sellerId: true, status: true }
        });

        if (!item) {
            throw new AppError('Item not found', 404);
        }

        validateResourceAccess(userId, item.sellerId);

        if (item.status !== 'AVAILABLE') {
            throw new AppError('Cannot delete item that is not in AVAILABLE status', 400);
        }

        await prisma.item.delete({
            where: { id: itemId }
        });

        console.log(`API /items/${itemId}: Item deleted successfully`);
        console.log("--- API DELETE /api/items/[itemId] (Prisma) SUCCESS ---");
        return NextResponse.json({ message: 'Item deleted successfully' }, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
} 