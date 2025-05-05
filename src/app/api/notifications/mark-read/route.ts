// src/app/api/notifications/mark-read/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, WriteBatch } from 'firebase-admin/firestore';

export async function POST(req: Request) {
    console.log("--- API /notifications/mark-read START ---");
    try {
        // 1. Authentication
        if (!adminDb) {
            console.error("API mark-read: Firebase Admin DB is not initialized.");
            return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
        }
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("API mark-read: Unauthorized.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API mark-read: Authenticated as user ${userId}`);

        // 2. Find unread notifications for the user
        const notificationsRef = adminDb.collection('notifications');
        const unreadQuery = notificationsRef.where('userId', '==', userId).where('isRead', '==', false);
        
        const snapshot = await unreadQuery.get();

        if (snapshot.empty) {
            console.log(`API mark-read: No unread notifications found for user ${userId}.`);
            return NextResponse.json({ message: 'No unread notifications found.' }, { status: 200 });
        }

        console.log(`API mark-read: Found ${snapshot.size} unread notifications to mark.`);

        // 3. Update documents in a batch
        const batch: WriteBatch = adminDb.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { 
                isRead: true,
                readAt: FieldValue.serverTimestamp() // Optionally add a timestamp when it was read
             });
        });

        // 4. Commit the batch
        await batch.commit();
        console.log(`API mark-read: Batch committed successfully for user ${userId}.`);

        console.log("--- API /notifications/mark-read SUCCESS ---");
        return NextResponse.json({ message: 'Notifications marked as read successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error("--- API /notifications/mark-read FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to mark notifications as read', error: error.message }, { status: 500 });
    }
}
