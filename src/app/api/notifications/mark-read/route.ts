// src/app/api/notifications/mark-read/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma'; // Changed: Use Prisma client

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

export async function POST(req: Request) {
    console.log("--- API /notifications/mark-read (Prisma) START ---");
    try {
        // 1. Authentication
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("API mark-read: Unauthorized.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API mark-read: Authenticated as user ${userId}`);

        // 2. Update all unread notifications for the user using Prisma
        const updateResult = await prisma.notification.updateMany({
            where: {
                userId: userId,
                isRead: false,
            },
            data: {
                isRead: true,
                readAt: new Date(), // Set readAt to current timestamp
            },
        });

        if (updateResult.count > 0) {
            console.log(`API mark-read: Successfully marked ${updateResult.count} notifications as read for user ${userId}.`);
        } else {
            console.log(`API mark-read: No unread notifications found to mark for user ${userId}.`);
        }

        console.log("--- API /notifications/mark-read (Prisma) SUCCESS ---");
        // It's successful even if no notifications were updated (i.e., all were already read or none existed)
        return NextResponse.json({ message: 'Notifications marked as read successfully.', count: updateResult.count }, { status: 200 });

    } catch (error: any) {
        console.error("--- API /notifications/mark-read (Prisma) FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to mark notifications as read', error: error.message }, { status: 500 });
    }
}
