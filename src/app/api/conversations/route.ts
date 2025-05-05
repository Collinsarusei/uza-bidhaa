// src/app/api/conversations/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path as needed
import { adminDb } from '@/lib/firebase-admin';
import { Conversation } from '@/lib/types'; // Assuming Conversation type exists
import { Timestamp } from 'firebase-admin/firestore'; // Import Timestamp for conversion

// Helper to convert timestamps before sending
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

export async function GET(req: Request) {
    console.log("--- API GET /api/conversations START ---");

    if (!adminDb) {
        console.error("API Conversations GET Error: Firebase Admin DB is not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Conversations GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API Conversations GET: Authenticated as user ${currentUserId}`);

    try {
        const conversationsRef = adminDb.collection('conversations');
        const conversationsQuery = conversationsRef
                                    .where('participantIds', 'array-contains', currentUserId)
                                    .orderBy('lastMessageTimestamp', 'desc'); 

        const snapshot = await conversationsQuery.get();
        console.log(`API Conversations GET: Found ${snapshot.size} total conversations involving user ${currentUserId}`);

        // --- Process ALL conversations, don't categorize here --- 
        const allConversations: Conversation[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as Omit<Conversation, 'id'>;
            
            // Convert timestamps before sending
            const conversation: Conversation = {
                ...data,
                id: doc.id,
                createdAt: safeTimestampToString(data.createdAt),
                lastMessageTimestamp: safeTimestampToString(data.lastMessageTimestamp),
                approvedAt: safeTimestampToString(data.approvedAt),
                // Convert readStatus timestamps if they exist
                readStatus: data.readStatus ? Object.entries(data.readStatus).reduce((acc, [userId, ts]) => {
                    acc[userId] = safeTimestampToString(ts);
                    return acc;
                }, {} as { [userId: string]: string | null }) : undefined,
                 // Ensure participantsData is included if present
                 participantsData: data.participantsData, 
            };
            allConversations.push(conversation);
        });

        // --- Let Frontend handle categorization --- 
        console.log(`API Conversations GET: Returning ${allConversations.length} conversations.`);
        console.log("--- API GET /api/conversations SUCCESS ---");
        return NextResponse.json({ conversations: allConversations }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/conversations FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch conversations', error: error.message }, { status: 500 });
    }
}
