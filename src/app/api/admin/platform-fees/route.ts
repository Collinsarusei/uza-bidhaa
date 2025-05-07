// src/app/api/admin/platform-fees/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PlatformSettings, PlatformFeeRecord } from '@/lib/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore'; // Import FieldValue if needed, though Timestamp is the main concern here

// Reusable admin check function
async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    // Check if adminDb is initialized before using it
    if (!adminDb) {
        console.error("isAdmin check failed: adminDb is null.");
        return false;
    }
    try {
        // Use non-null assertion because we checked !adminDb above
        const userDoc = await adminDb!.collection('users').doc(userId).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role:", error);
        return false;
    }
}

// Helper to convert timestamps before sending
const safeTimestampToString = (timestamp: any): string | null => {
    if (timestamp instanceof Timestamp) {
        try { return timestamp.toDate().toISOString(); } catch { return null; }
    }
    if (timestamp instanceof Date) {
         try { return timestamp.toISOString(); } catch { return null; }
    }
    if (typeof timestamp === 'string') {
         try {
             if (new Date(timestamp).toISOString() === timestamp) return timestamp;
         } catch { /* ignore */ }
    }
    return null;
};

export async function GET() {
    console.log("--- API GET /api/admin/platform-fees START ---");

    // Check if adminDb is initialized
    if (!adminDb) {
        console.error("API Admin Platform Fees GET Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    // Authentication
    const session = await getServerSession(authOptions);
    // isAdmin function now also checks for null adminDb internally
    if (!(await isAdmin(session?.user?.id))) {
        console.warn("API Admin Platform Fees GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Use non-null assertion because we checked !adminDb above
        const settingsDocRef = adminDb!.collection('settings').doc('platformFee');
        const settingsDocSnap = await settingsDocRef.get();
        const platformSettings = settingsDocSnap.data() as PlatformSettings | undefined;
        const totalPlatformFees = platformSettings?.totalPlatformFees ?? 0;

        // 2. Fetch Fee Records
        const feesRef = adminDb!.collection('platformFees'); // Use non-null assertion
        const feesQuery = feesRef.orderBy('createdAt', 'desc'); // Order by most recent
        const feesSnapshot = await feesQuery.get();

        const feeRecords: PlatformFeeRecord[] = [];
        feesSnapshot.forEach(doc => {
            // Get raw data, which includes createdAt as a Timestamp
            const rawData = doc.data();

            // Cast rawData to a type that includes properties expected for PlatformFeeRecord
            // Access createdAt from rawData, then convert it
            const feeRecord: PlatformFeeRecord = {
                id: doc.id,
                amount: rawData.amount, // Assuming amount exists on rawData
                relatedPaymentId: rawData.relatedPaymentId, // Assuming relatedPaymentId exists
                relatedItemId: rawData.relatedItemId, // Assuming relatedItemId exists
                sellerId: rawData.sellerId, // Assuming sellerId exists
                createdAt: safeTimestampToString(rawData.createdAt), // Convert the Timestamp
            };
            // Optional: Add checks if these fields might not exist in your documents

            feeRecords.push(feeRecord);
        });

        console.log(`API Admin Platform Fees GET: Found ${feeRecords.length} fee records. Total Balance: ${totalPlatformFees}`);

        // 3. Return Combined Data
        return NextResponse.json({
            totalBalance: totalPlatformFees,
            records: feeRecords,
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/platform-fees FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch platform fee data', error: error.message }, { status: 500 });
    }
}

// POST could be used later for marking fees as 'withdrawn' from the platform,
// but this would likely just update a record status, not perform actual financial transaction.
// Example:
// export async function POST(req: Request) { ... logic to update a fee record's status ... }
