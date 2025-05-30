// src/app/api/admin/platform-fees/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// Define the enriched platform fee record structure for the response
interface EnrichedPlatformFeeRecord {
    id: string;
    relatedPaymentId: string;
    relatedItemId: string;
    sellerId: string;
    amount: Decimal;
    appliedFeePercentage: Decimal;
    appliedFeeRuleId: string | null;
    createdAt: Date;
    updatedAt: Date;
    payment?: Partial<{
        id: string;
        amount: Decimal;
        createdAt: Date;
        item?: Partial<{
            id: string;
            title: string;
        }>;
    }>;
    item?: Partial<{
        id: string;
        title: string;
    }>;
    seller?: Partial<{
        id: string;
        name: string | null;
        email: string | null;
    }>;
    appliedFeeRule?: Partial<{
        id: string;
        name: string;
        feePercentage: Decimal;
    }>;
}

export async function GET(request: Request) {
    console.log("--- API GET /api/admin/platform-fees (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn("API /admin/platform-fees: Unauthorized or non-admin attempt.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    console.log(`API /admin/platform-fees: Authorized admin ${session.user.id} fetching platform fee data.`);

    try {
        // 1. Fetch Platform Settings (total fees and default percentage)
        const platformSettings = await prisma.platformSetting.findUnique({
            where: { id: 'global_settings' },
        });

        const totalPlatformFeesCollected = platformSettings?.totalPlatformFees ?? new Decimal(0);
        const defaultPlatformFeePercentage = platformSettings?.defaultFeePercentage ?? new Decimal(0);

        // 2. Fetch all PlatformFee records with relevant details
        const feeRecordsRaw = await prisma.platformFee.findMany({
            include: {
                payment: {
                    select: {
                        id: true,
                        amount: true, // Original payment amount
                        createdAt: true,
                        item: { select: { id: true, title: true } } // Item related to the payment
                    }
                },
                // Item is directly related to PlatformFee as well as through Payment.
                // Choose one source or include if they might differ (shouldn't if data is consistent)
                item: { 
                    select: { id: true, title: true }
                },
                seller: {
                    select: { id: true, name: true, email: true }
                },
                appliedFeeRule: {
                    select: { id: true, name: true, feePercentage: true }
                }
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        // Dates from Prisma will be Date objects; NextResponse.json() serializes them to ISO strings.
        const feeRecords: EnrichedPlatformFeeRecord[] = feeRecordsRaw as EnrichedPlatformFeeRecord[];

        console.log(`API Admin Platform Fees GET: Found ${feeRecords.length} fee records. Total Balance: ${totalPlatformFeesCollected}`);

        return NextResponse.json({
            totalBalance: totalPlatformFeesCollected,
            defaultFeePercentage: defaultPlatformFeePercentage,
            records: feeRecords,
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/platform-fees (Prisma) FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch platform fee data', error: error.message }, { status: 500 });
    }
}
