// src/app/api/admin/disputes/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Payment, Item, UserProfile } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const adminUserEmail = process.env.ADMIN_EMAIL;
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    return !!userId; // Fallback, NOT SECURE for production
}

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
    console.log("--- API GET /api/admin/disputes START ---");

    if (!adminDb) {
        console.error("API Admin Disputes GET Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn("API Admin Disputes GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

        const paymentsRef = adminDb.collection('payments');
        
        // Query for payments that are 'paid_to_platform' AND older than 7 days
        const overdueQuery = paymentsRef
            .where('status', '==', 'paid_to_platform')
            .where('createdAt', '<=', sevenDaysAgoTimestamp); // createdAt should be a Timestamp

        // Query for payments explicitly marked as 'isDisputed'
        const disputedQuery = paymentsRef.where('isDisputed', '==', true);

        const [overdueSnapshot, disputedSnapshot] = await Promise.all([
            overdueQuery.get(),
            disputedQuery.get()
        ]);

        const paymentsMap = new Map<string, Payment & { itemDetails?: Partial<Item>, buyerName?: string, sellerName?: string }>();

        const processSnapshot = async (snapshot: FirebaseFirestore.QuerySnapshot) => {
            for (const doc of snapshot.docs) {
                if (paymentsMap.has(doc.id)) continue; // Avoid duplicates if a payment is both overdue and disputed

                const paymentData = doc.data() as Payment;
                let itemDetails: Partial<Item> | null = null;
                let buyerName: string | undefined;
                let sellerName: string | undefined;

                if (paymentData.itemId) {
                    const itemDoc = await adminDb.collection('items').doc(paymentData.itemId).get();
                    if (itemDoc.exists) {
                        const item = itemDoc.data() as Item;
                        itemDetails = { title: item.title, mediaUrls: item.mediaUrls, price: item.price };
                    }
                }
                if (paymentData.buyerId) {
                    const buyerDoc = await adminDb.collection('users').doc(paymentData.buyerId).get();
                    if (buyerDoc.exists) buyerName = (buyerDoc.data() as UserProfile).name;
                }
                if (paymentData.sellerId) {
                    const sellerDoc = await adminDb.collection('users').doc(paymentData.sellerId).get();
                    if (sellerDoc.exists) sellerName = (sellerDoc.data() as UserProfile).name;
                }
                
                paymentsMap.set(doc.id, {
                    ...paymentData,
                    id: doc.id,
                    createdAt: safeTimestampToString(paymentData.createdAt),
                    updatedAt: safeTimestampToString(paymentData.updatedAt),
                    disputeSubmittedAt: safeTimestampToString(paymentData.disputeSubmittedAt),
                    itemDetails: itemDetails ?? undefined,
                    buyerName,
                    sellerName,
                });
            }
        };

        await processSnapshot(overdueSnapshot);
        await processSnapshot(disputedSnapshot);
        
        const combinedPayments = Array.from(paymentsMap.values())
            .sort((a, b) => {
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return timeA - timeB; // Oldest first
            });


        console.log(`API Admin Disputes GET: Found ${combinedPayments.length} payments for review.`);
        return NextResponse.json(combinedPayments, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/disputes FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch payments for review', error: error.message }, { status: 500 });
    }
}
