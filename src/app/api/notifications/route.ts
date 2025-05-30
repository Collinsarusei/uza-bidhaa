// src/app/api/notifications/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma'; // Changed: Use Prisma client
// The Notification type from @/lib/types is still relevant for the shape of the API response
// but Prisma's generated types will be used internally for DB interactions.
// We expect Prisma Date fields to be serialized to ISO strings by NextResponse.json()

// GET /api/notifications - Fetch notifications for the authenticated user
export async function GET(req: Request) {
    console.log("API GET /api/notifications (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Notifications GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    relatedItem: {
                        select: {
                            id: true,
                            title: true,
                            mediaUrls: true,
                            sellerId: true,
                            status: true
                        }
                    }
                }
            }),
            prisma.notification.count({
                where: { userId }
            })
        ]);

        const unreadCount = await prisma.notification.count({
            where: {
                userId,
                isRead: false
            }
        });

        console.log(`API Notifications GET: Found ${notifications.length} notifications for user ${userId}`);
        return NextResponse.json({
            notifications,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                hasMore: skip + notifications.length < total
            },
            unreadCount
        });

    } catch (error: any) {
        console.error("API Notifications GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch notifications', error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    console.log("API PATCH /api/notifications (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Notifications PATCH: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const { notificationIds } = await req.json();

        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            console.error("API Notifications PATCH: Invalid notification IDs provided.");
            return NextResponse.json({ message: 'Invalid notification IDs' }, { status: 400 });
        }

        const updatedNotifications = await prisma.notification.updateMany({
            where: {
                id: { in: notificationIds },
                userId
            },
            data: { isRead: true }
        });

        console.log(`API Notifications PATCH: Marked ${updatedNotifications.count} notifications as read for user ${userId}`);
        return NextResponse.json({ message: 'Notifications marked as read' });

    } catch (error: any) {
        console.error("API Notifications PATCH Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to update notifications', error: error.message }, { status: 500 });
    }
}

// POST /api/notifications - Optional: If you want to allow creating notifications via this route as well
// (Currently, creation is handled in src/lib/notifications.ts, which is fine)
// export async function POST(request: Request) { ... }
