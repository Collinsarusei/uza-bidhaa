// src/app/api/admin/disputes/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { DisputeRecord, Payment, Item, UserProfile } from '@/lib/types';

interface DisplayDispute extends DisputeRecord {
    paymentDetails?: Payment;
    itemDetails?: Item;
    filedByUser?: Partial<Pick<UserProfile, 'name' | 'email'> >;
    otherPartyUser?: Partial<Pick<UserProfile, 'name' | 'email'> >;
}

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId || !adminDb) return false;
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role in /api/admin/disputes:", error);
        return false;
    }
}

export async function GET(request: Request) {
    console.log("--- API GET /api/admin/disputes START ---");

    if (!adminDb) {
        console.error("API /admin/disputes: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !(await isAdmin(session.user.id))) {
        console.warn("API /admin/disputes: Unauthorized or non-admin attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    console.log(`API /admin/disputes: Authorized admin ${session.user.id} fetching disputes.`);

    try {
        const disputesRef = adminDb.collection('disputes');
        // Fetch all disputes, or filter by status like 'pending_admin' on the client or here
        // For simplicity, fetching all and client can filter, or add a query param for status
        const querySnapshot = await disputesRef.orderBy('createdAt', 'desc').get();

        if (querySnapshot.empty) {
            console.log("API /admin/disputes: No disputes found.");
            return NextResponse.json([], { status: 200 });
        }

        const enrichedDisputes: DisplayDispute[] = [];

        for (const doc of querySnapshot.docs) {
            const disputeData = doc.data() as DisputeRecord;
            let displayDispute: DisplayDispute = { ...disputeData, id: doc.id };

            try {
                // Fetch Payment Details
                if (disputeData.paymentId) {
                    const paymentDoc = await adminDb.collection('payments').doc(disputeData.paymentId).get();
                    if (paymentDoc.exists) {
                        displayDispute.paymentDetails = { id: paymentDoc.id, ...paymentDoc.data() } as Payment;
                    }
                }

                // Fetch Item Details
                if (disputeData.itemId) {
                    const itemDoc = await adminDb.collection('items').doc(disputeData.itemId).get();
                    if (itemDoc.exists) {
                        displayDispute.itemDetails = { id: itemDoc.id, ...itemDoc.data() } as Item;
                    }
                }

                // Fetch Filed By User Details
                if (disputeData.filedByUserId) {
                    const filedByUserDoc = await adminDb.collection('users').doc(disputeData.filedByUserId).get();
                    if (filedByUserDoc.exists) {
                        const userData = filedByUserDoc.data() as UserProfile;
                        displayDispute.filedByUser = { name: userData.name, email: userData.email };
                    }
                }

                // Fetch Other Party User Details
                if (disputeData.otherPartyUserId) {
                    const otherPartyUserDoc = await adminDb.collection('users').doc(disputeData.otherPartyUserId).get();
                    if (otherPartyUserDoc.exists) {
                        const userData = otherPartyUserDoc.data() as UserProfile;
                        displayDispute.otherPartyUser = { name: userData.name, email: userData.email };
                    }
                }
                enrichedDisputes.push(displayDispute);
            } catch (enrichError) {
                console.error(`API /admin/disputes: Error enriching dispute ${disputeData.id}:`, enrichError);
                // Push dispute even if some enrichment fails, client can handle missing details
                enrichedDisputes.push(displayDispute); 
            }
        }
        
        console.log(`API /admin/disputes: Found and enriched ${enrichedDisputes.length} disputes.`);
        return NextResponse.json(enrichedDisputes, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/disputes FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch disputes.', error: error.message }, { status: 500 });
    }
}
