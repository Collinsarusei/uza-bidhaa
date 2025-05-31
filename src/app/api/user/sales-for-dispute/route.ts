// src/app/api/user/sales-for-dispute/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma, PaymentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

// Define the expected response structure with proper types
interface EligibleSaleForDispute {
    id: string;
    buyerId: string;
    sellerId: string;
    itemId: string;
    amount: Prisma.Decimal;
    status: PaymentStatus;
    createdAt: Date;
    updatedAt: Date;
    item: {
        id: string;
        title: string;
        mediaUrls: string[];
    } | null;
}

export async function GET(request: Request) {
    console.log("--- API GET /api/user/sales-for-dispute (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API /user/sales-for-dispute: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const sellerId = session.user.id;
    console.log(`API /user/sales-for-dispute: Fetching for seller ${sellerId}`);

    try {
        const eligiblePayments = await prisma.payment.findMany({
            where: {
                sellerId: sellerId,
                status: 'SUCCESSFUL_ESCROW',
                activeDisputeId: null,
            },
            include: {
                item: {
                    select: {
                        id: true,
                        title: true,
                        mediaUrls: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        if (!eligiblePayments || eligiblePayments.length === 0) {
            console.log(`API /user/sales-for-dispute: No eligible payments found for seller ${sellerId}`);
            return NextResponse.json([], { status: 200 });
        }

        // Type-safe conversion with proper Prisma types
        const transactions: EligibleSaleForDispute[] = eligiblePayments.map(payment => ({
            ...payment,
            amount: payment.amount as Prisma.Decimal,
            status: payment.status as PaymentStatus,
            item: payment.item ? {
                id: payment.item.id,
                title: payment.item.title,
                mediaUrls: payment.item.mediaUrls
            } : null
        }));
        
        console.log(`API /user/sales-for-dispute: Found ${transactions.length} eligible transactions for seller ${sellerId}`);
        console.log("--- API GET /api/user/sales-for-dispute (Prisma) SUCCESS ---");
        return NextResponse.json(transactions, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/sales-for-dispute (Prisma) FAILED --- Error:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ 
                message: 'Database error occurred', 
                code: error.code,
                meta: error.meta 
            }, { status: 500 });
        }
        return NextResponse.json({ 
            message: 'Failed to fetch seller transactions for dispute', 
            error: error.message 
        }, { status: 500 });
    }
}
