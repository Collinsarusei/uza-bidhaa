// src/app/api/messages/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { URLSearchParams } from 'url'; // Import URLSearchParams

const conversationsCollection = adminDb.collection('conversations');

// Helper function to generate a consistent conversation ID
const generateConversationId = (userId1: string, userId2: string, itemId: string): string => {
    // Sort user IDs to ensure consistency regardless of who initiates
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}_item_${itemId}`;
};

export async function POST(req: Request) {
    console.log("API POST /api/messages: Received request");

    // --- Authentication ---
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages: Unauthorized attempt to send message.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const senderId = session.user.id;

    try {
        const body = await req.json();
        const { recipientId, itemId, text } = body;

        // --- Validation ---
        if (!recipientId || !itemId || !text || typeof text !== 'string' || text.trim() === '') {
            console.error("API Messages: Missing required fields (recipientId, itemId, text).");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }
        if (senderId === recipientId) {
            console.warn(`API Messages: User ${senderId} attempted to send message to themselves.`);
            return NextResponse.json({ message: 'Cannot send message to yourself' }, { status: 400 });
        }

        // --- Generate Conversation ID ---
        const conversationId = generateConversationId(senderId, recipientId, itemId);
        const conversationRef = conversationsCollection.doc(conversationId);

        console.log(`API Messages: Processing message for conversation ${conversationId}`);

        // --- Prepare Message Data ---
        const messageData = {
            senderId: senderId,
            text: text.trim(), // Trim whitespace
            timestamp: FieldValue.serverTimestamp(),
        };

        // --- Prepare Conversation Update/Creation Data ---
        const conversationData = {
            participantIds: [senderId, recipientId],
            itemId: itemId,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            lastMessageSnippet: text.trim().substring(0, 100), // Truncated snippet
            // Update participant data (optional, could be done once)
             [`participantsData.${senderId}.name`]: session.user.name || 'User',
             [`participantsData.${senderId}.avatar`]: session.user.image || null,
             // We'd need to fetch recipient name/avatar here if adding it
             // [`participantsData.${recipientId}.name`]: 'Recipient Name',
             // [`participantsData.${recipientId}.avatar`]: null,
            createdAt: FieldValue.serverTimestamp(), // Set only on creation
        };

        // --- Firestore Transaction: Update Conversation and Add Message ---
        await adminDb.runTransaction(async (transaction) => {
             const convDoc = await transaction.get(conversationRef);
             const messagesCollectionRef = conversationRef.collection('messages');
             const newMessageRef = messagesCollectionRef.doc(); // Auto-generate message ID

             if (!convDoc.exists) {
                  // Conversation doesn't exist, create it along with the message
                  console.log(`API Messages: Creating new conversation ${conversationId}`);
                  // Use merge: true to avoid overwriting createdAt if it somehow exists but message adding failed before
                  transaction.set(conversationRef, conversationData, { merge: true });
             } else {
                 // Conversation exists, update last message details
                 console.log(`API Messages: Updating existing conversation ${conversationId}`);
                 transaction.update(conversationRef, {
                      lastMessageTimestamp: conversationData.lastMessageTimestamp,
                      lastMessageSnippet: conversationData.lastMessageSnippet,
                      // Optionally update participant data if needed
                      [`participantsData.${senderId}.name`]: conversationData[`participantsData.${senderId}.name`],
                      [`participantsData.${senderId}.avatar`]: conversationData[`participantsData.${senderId}.avatar`],
                 });
             }
             // Add the new message to the subcollection
             transaction.set(newMessageRef, messageData);
             console.log(`API Messages: Message added to conversation ${conversationId}`);
        });

        console.log(`API Messages: Message successfully processed for conversation ${conversationId}`);
        // Respond with success (no need to return message data unless frontend needs it)
        return NextResponse.json({ message: 'Message sent successfully' }, { status: 201 });

    } catch (error: any) {
        console.error("API Messages Error:", error);
        return NextResponse.json({ message: 'Failed to send message', error: error.message }, { status: 500 });
    }
}


export async function GET(req: Request) {
    console.log("API GET /api/messages: Received request");

    // --- Authentication ---
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages: Unauthorized attempt to get messages.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;

    try {
        // --- Get Query Parameters ---
        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get('conversationId'); // Expect frontend to pass conversationId

        // Alternatively, could receive userId1, userId2, itemId and generate ID here
        const recipientId = searchParams.get('recipientId');
        const itemId = searchParams.get('itemId');

        let effectiveConversationId = conversationId;

        if (!effectiveConversationId && recipientId && itemId) {
             // If conversationId is not provided, generate it
             effectiveConversationId = generateConversationId(currentUserId, recipientId, itemId);
             console.log(`API Messages: Generated conversation ID: ${effectiveConversationId}`);
        } else if (!effectiveConversationId) {
             console.error("API Messages: Missing conversationId or recipientId/itemId parameters.");
             return NextResponse.json({ message: 'Missing conversation identifier' }, { status: 400 });
        }


        console.log(`API Messages: Fetching messages for conversation ${effectiveConversationId}`);

        // --- Verify User is Part of Conversation (Security Check) ---
        const conversationRef = conversationsCollection.doc(effectiveConversationId);
        const convDoc = await conversationRef.get();

        if (!convDoc.exists) {
            console.log(`API Messages: Conversation ${effectiveConversationId} not found. Returning empty array.`);
            // It's okay if a conversation hasn't started yet
            return NextResponse.json({ messages: [] }, { status: 200 });
        }

        const conversationData = convDoc.data();
        if (!conversationData?.participantIds?.includes(currentUserId)) {
            console.warn(`API Messages: User ${currentUserId} attempted to access conversation ${effectiveConversationId} they are not part of.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        // --- Fetch Messages Subcollection ---
        const messagesQuery = conversationRef.collection('messages')
                                             .orderBy('timestamp', 'asc'); // Order by time ascending

        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => {
             const data = doc.data();
             return {
                 id: doc.id,
                 ...data,
                 // Convert Firestore Timestamp to ISO string or milliseconds for frontend
                 timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null,
             };
        });

        console.log(`API Messages: Found ${messages.length} messages for conversation ${effectiveConversationId}`);
        return NextResponse.json({ messages }, { status: 200 });

    } catch (error: any) {
        console.error("API Messages GET Error:", error);
        return NextResponse.json({ message: 'Failed to fetch messages', error: error.message }, { status: 500 });
    }
}
