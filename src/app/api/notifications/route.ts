// src/app/api/notifications/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { Notification } from '@/lib/types';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'; // Import AdminTimestamp

const notificationsCollection = adminDb!.collection('notifications');

// Helper to safely convert Firestore Admin Timestamp to ISO string or return null
const adminTimestampToISOStringOrNull = (timestamp: any): string | null => {
    if (timestamp instanceof AdminTimestamp) {
        try {
            return timestamp.toDate().toISOString();
        } catch (e) {
            console.error("Error converting admin timestamp to ISO string:", e);
            return null;
        }
    }
    if (typeof timestamp === 'string') {
        try {
            if (new Date(timestamp).toISOString() === timestamp) {
                return timestamp;
            }
        } catch (e) { /* ignore */ }
    }
    return null;
};

// GET /api/notifications - Fetch notifications for the authenticated user
export async function GET(request: Request) {
    console.log("API: Fetching notifications");

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        console.warn("API Get Notifications: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const query = notificationsCollection
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        const notificationsData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: adminTimestampToISOStringOrNull(data.createdAt),
                readAt: adminTimestampToISOStringOrNull(data.readAt),
            } as Notification;
        });

        console.log(`API: Found ${notificationsData.length} notifications for user ${userId}`);
        return NextResponse.json(notificationsData);

    } catch (error: any) {
        console.error("API Error fetching notifications:", error);
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
             console.error("Firestore index missing for notifications query. Please create an index on 'userId' (ascending) and 'createdAt' (descending) in the 'notifications' collection.");
            return NextResponse.json({ message: 'Database query failed. Index potentially missing.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to fetch notifications', error: error.message }, { status: 500 });
    }
}