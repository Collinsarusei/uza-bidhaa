// src/app/api/conversations/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path as needed
import { adminDb } from '@/lib/firebase-admin';
import { Conversation } from '@/lib/types'; // Assuming Conversation type exists

export async function GET(req: Request) {
    console.log("--- API GET /api/conversations START ---");

    // --- Authentication & DB Check --- 
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
        // --- Query Conversations --- 
        const conversationsRef = adminDb.collection('conversations');
        // Query where the current user is a participant
        const conversationsQuery = conversationsRef
                                    .where('participantIds', 'array-contains', currentUserId)
                                    .orderBy('lastMessageTimestamp', 'desc'); // Order by most recent activity

        const snapshot = await conversationsQuery.get();
        console.log(`API Conversations GET: Found ${snapshot.size} total conversations involving user ${currentUserId}`);

        // --- Process and Categorize --- 
        const incoming: Conversation[] = [];
        const inbox: Conversation[] = [];

        snapshot.forEach(doc => {
            const data = doc.data() as Omit<Conversation, 'id'>; // Type cast
            const conversation: Conversation = { ...data, id: doc.id }; // Add the document ID

            // Convert Firestore Timestamps before sending response
            const safeTimestampToString = (timestamp: any): string | null => {
                if (timestamp && typeof timestamp.toDate === 'function') {
                    return timestamp.toDate().toISOString();
                }
                return null;
            };
            conversation.createdAt = safeTimestampToString(conversation.createdAt) as any; // Adjust types as needed
            conversation.lastMessageTimestamp = safeTimestampToString(conversation.lastMessageTimestamp) as any;

            // Categorize based on 'approved' status and initiator
            if (conversation.approved) {
                inbox.push(conversation);
            } else if (conversation.initiatorId !== currentUserId) {
                // It's an incoming request if not approved AND user didn't initiate it
                incoming.push(conversation);
            }
            // Ignore conversations initiated by the user that are not yet approved
        });

        console.log(`API Conversations GET: Categorized into ${incoming.length} incoming, ${inbox.length} inbox.`);

        // --- TODO: Add Unread Count Logic --- 
        // For inbox items, we need to check the `readStatus` for the `currentUserId` 
        // against the `lastMessageTimestamp` to determine if there are unread messages.
        // This requires the `readStatus` field to be implemented first.

        console.log("--- API GET /api/conversations SUCCESS ---");
        return NextResponse.json({ incoming, inbox }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/conversations FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch conversations', error: error.message }, { status: 500 });
    }
}
