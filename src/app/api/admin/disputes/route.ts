// src/app/api/admin/disputes/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/auth'; // Assuming authOptions is in @/lib/auth based on common patterns
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;


interface DisplayDispute {
    id: string;
    paymentId: string;
    itemId: string;
    filedByUserId: string;
    otherPartyUserId: string;
    reason: string;
    description: string;
    status: 'PENDING_ADMIN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; // Adjust as per your actual enum
    createdAt: Date;
    updatedAt: Date;
    paymentDetails?: {
        id: string;
        amount: number;
        status: string;
        item?: {
            title: string;
            mediaUrls: string[];
        };
    };
    itemDetails?: {
        id: string;
        title: string;
        mediaUrls: string[];
        status: string;
        price: number;
    };
    filedByUserPublic?: {
        id: string;
        name: string | null;
        email: string | null;
    };
    otherPartyUserPublic?: {
        id: string;
        name: string | null;
        email: string | null;
    };
}

export async function GET(request: Request) {
    // console.log("--- API GET /api/admin/disputes (Prisma) START ---"); // Optional runtime log

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        // console.warn("API /admin/disputes: Unauthorized or non-admin attempt.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    // console.log(`API /admin/disputes: Authorized admin ${session.user.id} fetching disputes.`);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    try {
        let whereClause: any = {};
        if (statusFilter) {
            whereClause.status = statusFilter;
        }

        const disputes = await prisma.dispute.findMany({
            where: whereClause,
            include: {
                payment: { 
                    include: { 
                        item: { select: { id: true, title: true, mediaUrls: true, status: true, price: true } } 
                    }
                },
                filedByUser: { select: { id: true, name: true, email: true } },
                otherPartyUser: { select: { id: true, name: true, email: true } }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (disputes.length === 0) {
            // console.log("API /admin/disputes: No disputes found matching criteria.");
            return NextResponse.json([], { status: 200 });
        }

        const enrichedDisputes: DisplayDispute[] = disputes.map((dispute: any) => {
            const {
                payment,
                filedByUser,
                otherPartyUser,
                ...restOfDispute
            } = dispute;

            const itemDetailsFromPayment = payment?.item;

            return {
                ...restOfDispute,
                // Ensure type compatibility with DisplayDispute
                paymentDetails: payment ? { 
                    id: payment.id,
                    amount: Number(payment.amount), // Ensure amount is number
                    status: payment.status,
                    item: itemDetailsFromPayment ? {
                        title: itemDetailsFromPayment.title,
                        mediaUrls: itemDetailsFromPayment.mediaUrls
                    } : undefined
                } : undefined,
                itemDetails: itemDetailsFromPayment ? { 
                    id: itemDetailsFromPayment.id,
                    title: itemDetailsFromPayment.title,
                    mediaUrls: itemDetailsFromPayment.mediaUrls,
                    status: itemDetailsFromPayment.status,
                    price: Number(itemDetailsFromPayment.price) // Ensure price is number
                 } : undefined,
                filedByUserPublic: filedByUser ? { id: filedByUser.id, name: filedByUser.name, email: filedByUser.email } : undefined,
                otherPartyUserPublic: otherPartyUser ? { id: otherPartyUser.id, name: otherPartyUser.name, email: otherPartyUser.email } : undefined,
                status: dispute.status as DisplayDispute['status'], // Cast status
            };
        });
        
        // console.log(`API /admin/disputes: Found and enriched ${enrichedDisputes.length} disputes.`);
        return NextResponse.json(enrichedDisputes, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/disputes (Prisma) FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch disputes.', error: error.message }, { status: 500 });
    }
}
