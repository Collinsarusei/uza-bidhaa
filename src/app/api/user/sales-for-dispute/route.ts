// src/app/api/user/sales-for-dispute/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

// Define the expected response structure
interface EligibleSaleForDispute {
    id: string;
    buyerId: string;
    sellerId: string;
    itemId: string;
    amount: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    item: {
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
                        title: true,
                        mediaUrls: true,
                        // Include any other item fields useful for displaying the sale
                        id: true, 
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

        // The structure from Prisma with include already matches closely what you need.
        // If specific transformation is needed, map it here.
        // For now, assuming direct use is fine.
        const transactions: EligibleSaleForDispute[] = eligiblePayments as EligibleSaleForDispute[];
        
        console.log(`API /user/sales-for-dispute: Found ${transactions.length} eligible transactions for seller ${sellerId}`);
        return NextResponse.json(transactions, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/sales-for-dispute (Prisma) FAILED --- Error:", error);
        // Handle potential Prisma-specific errors if necessary
        return NextResponse.json({ message: 'Failed to fetch seller transactions for dispute.', error: error.message }, { status: 500 });
    }
}
