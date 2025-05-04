import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin';
import { Notification } from '@/lib/types'; // Assuming Notification type is defined in types.ts

const notificationsCollection = adminDb.collection('notifications');

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
        // Query notifications for the current user, order by most recent
        const query = notificationsCollection
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc');

        const snapshot = await query.get();

        const notificationsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Notification[];

        console.log(`API: Found ${notificationsData.length} notifications for user ${userId}`);
        return NextResponse.json(notificationsData);

    } catch (error: any) {
        console.error("API Error fetching notifications:", error);
        // Check for missing index error specifically
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
             console.error("Firestore index missing for notifications query. Please create an index on 'userId' (ascending) and 'createdAt' (descending) in the 'notifications' collection.");
            return NextResponse.json({ message: 'Database query failed. Index potentially missing.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to fetch notifications', error: error.message }, { status: 500 });
    }
}

// --- TODO (Future Implementation) ---

// POST /api/notifications - Potentially for manually creating notifications (less common)

// PUT /api/notifications/{id} - To mark a specific notification as read
// export async function PUT(request: Request, { params }: { params: { id: string } }) {
//     const notificationId = params.id;
//     // ... logic to update readStatus for notificationId ...
// }

// PUT /api/notifications/mark-all-read - To mark all user notifications as read
// export async function PUT(request: Request) { // Needs a more specific route or body parameter
//     // ... logic to update readStatus for all user notifications ...
// }
