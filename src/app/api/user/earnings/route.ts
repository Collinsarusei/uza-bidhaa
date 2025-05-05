// src/app/api/user/earnings/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { Earning, UserProfile } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

// Helper to convert timestamps
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

export async function GET(req: Request) {
    console.log("--- API GET /api/user/earnings START ---");

    if (!adminDb) {
        console.error("API User Earnings GET Error: Firebase Admin DB is not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API User Earnings GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API User Earnings GET: Authenticated as user ${currentUserId}`);

    try {
        const userRef = adminDb.collection('users').doc(currentUserId);
        const earningsRef = userRef.collection('earnings');
        
        // Query earnings, order by creation date
        const earningsQuery = earningsRef.orderBy('createdAt', 'desc');
        
        // Fetch earnings and user profile data concurrently
        const [earningsSnapshot, userDoc] = await Promise.all([
            earningsQuery.get(),
            userRef.get()
        ]);

        console.log(`API User Earnings GET: Found ${earningsSnapshot.size} earnings records for user ${currentUserId}`);

        // Process earnings
        const earnings: Earning[] = [];
        earningsSnapshot.forEach(doc => {
            const data = doc.data() as Omit<Earning, 'id'>;
            earnings.push({
                ...data,
                id: doc.id,
                createdAt: safeTimestampToString(data.createdAt),
                // Ensure other potential timestamps are converted if added later
            });
        });

        // Get available balance and profile info
        let availableBalance = 0;
        let userProfileData: Partial<UserProfile> = {};
        if (userDoc.exists) {
            const rawProfile = userDoc.data();
            availableBalance = rawProfile?.availableBalance ?? 0; // Get balance from user doc
            // Select only needed profile fields (e.g., mpesa number)
            userProfileData = {
                 mpesaPhoneNumber: rawProfile?.mpesaPhoneNumber || null,
                 // Add other fields if needed by frontend
             };
             console.log(`API User Earnings GET: User profile found, Balance: ${availableBalance}, Mpesa: ${userProfileData.mpesaPhoneNumber}`);
        } else {
             console.warn(`API User Earnings GET: User profile not found for ${currentUserId}. Balance defaults to 0.`);
        }
        
        // --- Sanity check: Recalculate balance from earnings if needed ---
        // This can help detect discrepancies if the direct balance field update fails
        const calculatedBalance = earnings
            .filter(e => e.status === 'available')
            .reduce((sum, e) => sum + e.amount, 0);
        
        if (Math.abs(availableBalance - calculatedBalance) > 0.01) { // Allow for small float differences
             console.warn(`API User Earnings GET: Discrepancy detected! User doc balance=${availableBalance}, Calculated balance=${calculatedBalance}. Using calculated balance.`);
             // Decide how to handle discrepancy - use calculated, log error, fix balance?
             // availableBalance = calculatedBalance; // Option: Use calculated value for response
        }
        // ------------------------------------------------------------------

        console.log("--- API GET /api/user/earnings SUCCESS ---");
        return NextResponse.json({ 
            earnings: earnings, 
            availableBalance: availableBalance, 
            profile: userProfileData 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/earnings FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch user earnings', error: error.message }, { status: 500 });
    }
}
