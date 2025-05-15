// src/app/api/user/sales-for-dispute/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { Payment, Item } from '@/lib/types';

interface SellerTransactionForDispute extends Payment {
    itemDetails?: Partial<Pick<Item, 'title' | 'mediaUrls'> >;
}

export async function GET(request: Request) {
    console.log("--- API GET /api/user/sales-for-dispute START ---");

    if (!adminDb) {
        console.error("API /user/sales-for-dispute: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API /user/sales-for-dispute: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const sellerId = session.user.id;
    console.log(`API /user/sales-for-dispute: Fetching for seller ${sellerId}`);

    try {
        const paymentsRef = adminDb.collection('payments');
        // Query for payments where the current user is the seller and status is 'paid_to_platform'
        // This requires a composite index on sellerId and status.
        const querySnapshot = await paymentsRef
            .where('sellerId', '==', sellerId)
            .where('status', '==', 'paid_to_platform')
            .orderBy('createdAt', 'desc') // Optional: order by most recent
            .get();

        if (querySnapshot.empty) {
            console.log(`API /user/sales-for-dispute: No eligible payments found for seller ${sellerId}`);
            return NextResponse.json([], { status: 200 });
        }

        const transactions: SellerTransactionForDispute[] = [];
        for (const doc of querySnapshot.docs) {
            const paymentData = doc.data() as Payment;
            let itemDetails: Partial<Pick<Item, 'title' | 'mediaUrls'> > | undefined = undefined;

            if (paymentData.itemId) {
                try {
                    const itemDoc = await adminDb.collection('items').doc(paymentData.itemId).get();
                    if (itemDoc.exists) {
                        const itemData = itemDoc.data() as Item;
                        itemDetails = {
                            title: itemData.title,
                            mediaUrls: itemData.mediaUrls
                        };
                    }
                } catch (itemError) {
                    console.error(`API /user/sales-for-dispute: Error fetching item details for itemId ${paymentData.itemId}:`, itemError);
                    // Continue without item details if it fails for some reason
                }
            }
            transactions.push({ ...paymentData, id: doc.id, itemDetails });
        }
        
        console.log(`API /user/sales-for-dispute: Found ${transactions.length} eligible transactions for seller ${sellerId}`);
        return NextResponse.json(transactions, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/user/sales-for-dispute FAILED --- Error:", error);
        if (error.message && error.message.includes('index')) {
             console.error("API /user/sales-for-dispute: Firestore index missing. Required: payments collection, sellerId ASC, status ASC, createdAt DESC (or similar for your query)");
             return NextResponse.json({ message: 'Database query failed due to missing index.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to fetch seller transactions for dispute.', error: error.message }, { status: 500 });
    }
}
