// src/app/api/user/earnings/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';


export async function GET(req: Request) {
    console.log("--- API GET /api/user/earnings (Prisma - Fetching Earning Records) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API User Earnings GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API User Earnings GET: Authenticated as user ${currentUserId}`);

    try {
        // Fetch user profile data including availableBalance
        const user = await prisma.user.findUnique({
            where: { id: currentUserId },
            select: {
                availableBalance: true,
                mpesaPhoneNumber: true, // Keep for profile context in response
                // Add other relevant profile fields if needed by client on this page
            }
        });

        if (!user) {
            console.warn(`API User Earnings GET: User profile not found for ${currentUserId}.`);
            return NextResponse.json({ message: 'User profile not found.' }, { status: 404 });
        }

        const availableBalance = user.availableBalance ?? new Decimal(0);
        const userProfileData = {
            mpesaPhoneNumber: user.mpesaPhoneNumber || null,
        };
        console.log(`API User Earnings GET: User profile found, Balance: ${availableBalance}`);

        // Fetch all Earning records for the user
        const earningsRecords = await prisma.earning.findMany({
            where: {
                userId: currentUserId,
                status: 'AVAILABLE', // Using string literal instead of enum
            },
            include: {
                //Optionally include related item or payment details if needed for display
                item: { select: { title: true, id: true } },
                payment: { select: { id: true, amount: true } }
            },
            orderBy: {
                createdAt: 'desc' 
            }
        });

        // Dates in earningsRecords (createdAt, updatedAt) will be serialized to ISO strings by NextResponse.json()
        console.log(`API User Earnings GET: Found ${earningsRecords.length} earning records.`);
        console.log("--- API GET /api/user/earnings (Prisma - Fetching Earning Records) SUCCESS ---");
        
        return NextResponse.json({ 
            earnings: earningsRecords, 
            availableBalance: availableBalance, 
            profile: userProfileData 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/earnings (Prisma) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to fetch user earnings', error: error.message }, { status: 500 });
    }
}
