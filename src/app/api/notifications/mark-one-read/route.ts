// src/app/api/notifications/mark-one-read/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';

const markOneSchema = z.object({
    notificationId: z.string().min(1, "Notification ID is required"),
});

export async function POST(req: Request) {
    console.log("--- API /notifications/mark-one-read START ---");
    try {
        // 1. Authentication & DB Check
        if (!adminDb) {
            console.error("API mark-one-read: Firebase Admin DB is not initialized.");
            return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
        }
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("API mark-one-read: Unauthorized.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API mark-one-read: Authenticated as user ${userId}`);

        // 2. Parse and Validate Body
        let body;
        try {
            body = await req.json();
        } catch (parseError) {
            return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
        }

        const validationResult = markOneSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ message: 'Invalid input.', errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
        }
        const { notificationId } = validationResult.data;
        console.log(`API mark-one-read: Request to mark notification ID: ${notificationId}`);

        // 3. Get Notification Reference
        const notificationRef = adminDb.collection('notifications').doc(notificationId);

        // 4. Verify Ownership and Update (Optional but Recommended)
        // It's good practice to ensure the notification belongs to the user making the request
        const docSnapshot = await notificationRef.get();
        if (!docSnapshot.exists) {
             console.warn(`API mark-one-read: Notification ${notificationId} not found.`);
            // Return 404 or 200? Returning 200 might be simpler for the client if it tries to mark non-existent ones.
            return NextResponse.json({ message: 'Notification not found.' }, { status: 404 }); 
        }

        const notificationData = docSnapshot.data();
        if (notificationData?.userId !== userId) {
            console.warn(`API mark-one-read: User ${userId} attempted to mark notification ${notificationId} belonging to ${notificationData?.userId}.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 }); // Forbidden access
        }

        // 5. Perform Update if not already read
        if (notificationData?.isRead === false) {
            await notificationRef.update({
                isRead: true,
                readAt: FieldValue.serverTimestamp()
            });
            console.log(`API mark-one-read: Notification ${notificationId} marked as read for user ${userId}.`);
        } else {
             console.log(`API mark-one-read: Notification ${notificationId} was already read.`);
        }

        console.log("--- API /notifications/mark-one-read SUCCESS ---");
        return NextResponse.json({ message: 'Notification marked as read successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error("--- API /notifications/mark-one-read FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to mark notification as read', error: error.message }, { status: 500 });
    }
}
