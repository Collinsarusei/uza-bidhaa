// src/app/api/user/orders/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route'; 
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null
import { Payment, Item } from '@/lib/types'; 
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
    console.log("--- API GET /api/user/orders START ---");

    // --- FIX: Add Null Check for adminDb --- 
    if (!adminDb) {
        console.error("API User Orders GET Error: Firebase Admin DB is not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    // --- End Null Check ---

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API User Orders GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API User Orders GET: Authenticated as user ${currentUserId}`);

    try {
        const paymentsRef = adminDb.collection('payments');
        const paymentsQuery = paymentsRef
                                .where('buyerId', '==', currentUserId)
                                .orderBy('createdAt', 'desc'); 

        const snapshot = await paymentsQuery.get();
        console.log(`API User Orders GET: Found ${snapshot.size} payments for user ${currentUserId}`);

        if (snapshot.empty) {
            return NextResponse.json([], { status: 200 });
        }

        const ordersWithDetails = await Promise.all(snapshot.docs.map(async (doc) => {
            const paymentData = doc.data() as Omit<Payment, 'id'>;
            let itemDetails: Partial<Item> | null = null;

            if (paymentData.itemId) {
                 try {
                    // FIX: Use non-null assertion inside map callback
                    const itemRef = adminDb!.collection('items').doc(paymentData.itemId);
                    // ----- End FIX -----
                    const itemDoc = await itemRef.get();
                    if (itemDoc.exists) {
                        const itemData = itemDoc.data() as Item;
                        itemDetails = { 
                            title: itemData.title,
                            mediaUrls: itemData.mediaUrls,
                        };
                    }
                 } catch (itemError) {
                     console.error(`Error fetching item details for ${paymentData.itemId}:`, itemError);
                 }
            }
            
            const paymentResult: Payment & { itemDetails?: Partial<Item> } = {
                ...paymentData,
                id: doc.id,
                createdAt: safeTimestampToString(paymentData.createdAt),
                updatedAt: safeTimestampToString(paymentData.updatedAt),
                itemDetails: itemDetails ?? undefined,
            };
            return paymentResult;
        }));

        console.log("--- API GET /api/user/orders SUCCESS ---");
        return NextResponse.json(ordersWithDetails, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/orders FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch user orders', error: error.message }, { status: 500 });
    }
}
