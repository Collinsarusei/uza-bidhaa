// src/app/api/notifications/mark-one-read/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma'; // Changed: Use Prisma client
import * as z from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

const markOneSchema = z.object({
    notificationId: z.string().min(1, "Notification ID is required"),
});

export async function POST(req: Request) {
    console.log("--- API /notifications/mark-one-read (Prisma) START ---");
    try {
        // 1. Authentication
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

        // 3. Perform Update using Prisma
        // We update the notification only if it belongs to the user and is currently unread.
        const updatedNotification = await prisma.notification.updateMany({
            where: {
                id: notificationId,
                userId: userId, // Ensures the notification belongs to the authenticated user
                isRead: false,   // Only update if it's not already read
            },
            data: {
                isRead: true,
                readAt: new Date(), // Set readAt to current timestamp
            },
        });

        if (updatedNotification.count > 0) {
            console.log(`API mark-one-read: Notification ${notificationId} marked as read for user ${userId}.`);
        } else {
            // This can happen if: a) notification doesn't exist, b) doesn't belong to user, or c) was already read.
            // To give more specific feedback, you might need a preliminary fetch, but updateMany is more atomic.
            // For now, we just log it. The client might not need to distinguish these cases.
            console.log(`API mark-one-read: Notification ${notificationId} not updated (either not found, not owned, or already read).`);
            // Optional: You could fetch the notification to check existence/ownership if count is 0 to return a more specific error/message.
            // For example, check if it exists at all:
            const existingNotification = await prisma.notification.findUnique({ where: { id: notificationId } });
            if (!existingNotification) {
                return NextResponse.json({ message: 'Notification not found.' }, { status: 404 });
            }
            if (existingNotification.userId !== userId) {
                return NextResponse.json({ message: 'Forbidden.' }, { status: 403 });
            }
            // If it exists and belongs to user, it must have been already read or some other condition failed.
        }

        console.log("--- API /notifications/mark-one-read (Prisma) SUCCESS ---");
        // Even if the notification was already read (updatedNotification.count === 0 but it exists & is owned), 
        // it's not an error from the client's perspective of wanting it marked read.
        return NextResponse.json({ message: 'Notification marked as read successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error("--- API /notifications/mark-one-read (Prisma) FAILED --- Error:", error);
        // Handle potential Prisma errors, e.g., if `notificationId` is not a valid format for the ID type in DB.
        return NextResponse.json({ message: 'Failed to mark notification as read', error: error.message }, { status: 500 });
    }
}
