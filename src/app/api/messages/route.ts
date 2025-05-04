// src/app/api/messages/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications'; // Import the helper

const conversationsCollection = adminDb.collection('conversations');

// Helper function to generate a consistent conversation ID
const generateConversationId = (userId1: string, userId2: string, itemId: string): string => {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}_item_${itemId}`;
};

export async function POST(req: Request) {
    console.log("API POST /api/messages: Received request");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages: Unauthorized attempt to send message.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const senderId = session.user.id;
    const senderName = session.user.name || 'Someone'; // Get sender name for notification

    try {
        const body = await req.json();
        const { recipientId, itemId, text } = body;

        if (!recipientId || !itemId || !text || typeof text !== 'string' || text.trim() === '') {
            console.error("API Messages: Missing required fields (recipientId, itemId, text).");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }
        if (senderId === recipientId) {
            console.warn(`API Messages: User ${senderId} attempted to send message to themselves.`);
            return NextResponse.json({ message: 'Cannot send message to yourself' }, { status: 400 });
        }

        const conversationId = generateConversationId(senderId, recipientId, itemId);
        const conversationRef = conversationsCollection.doc(conversationId);

        console.log(`API Messages: Processing message for conversation ${conversationId}`);

        const messageData = {
            senderId: senderId,
            text: text.trim(),
            timestamp: FieldValue.serverTimestamp(),
        };

        const conversationData = {
            participantIds: [senderId, recipientId],
            itemId: itemId,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            lastMessageSnippet: text.trim().substring(0, 100),
             [`participantsData.${senderId}.name`]: senderName,
             [`participantsData.${senderId}.avatar`]: session.user.image || null,
            createdAt: FieldValue.serverTimestamp(),
        };

        await adminDb.runTransaction(async (transaction) => {
             const convDoc = await transaction.get(conversationRef);
             const messagesCollectionRef = conversationRef.collection('messages');
             const newMessageRef = messagesCollectionRef.doc();

             if (!convDoc.exists) {
                  console.log(`API Messages: Creating new conversation ${conversationId}`);
                  // Set with merge option for the conversation document itself
                  transaction.set(conversationRef, conversationData, { merge: true });
             } else {
                 console.log(`API Messages: Updating existing conversation ${conversationId}`);
                 transaction.update(conversationRef, {
                      lastMessageTimestamp: conversationData.lastMessageTimestamp,
                      lastMessageSnippet: conversationData.lastMessageSnippet,
                      [`participantsData.${senderId}.name`]: conversationData[`participantsData.${senderId}.name`],
                      [`participantsData.${senderId}.avatar`]: conversationData[`participantsData.${senderId}.avatar`],
                 });
             }
             // Corrected: Set the new message document with only two arguments
             transaction.set(newMessageRef, messageData);
             console.log(`API Messages: Message added to conversation ${conversationId}`);
        });

        // --- Create Notification for the Recipient --- 
        try {
            const itemTitle = 'your listed item'; // Placeholder title
            await createNotification({
                userId: recipientId,
                type: 'new_message',
                message: `${senderName} sent you a message regarding ${itemTitle}.`,
                relatedItemId: itemId,
                relatedMessageId: conversationId,
                relatedUserId: senderId
            });
        } catch (notificationError) {
             console.error("Failed to create notification after sending message:", notificationError);
        }
        // --- End Notification --- 

        console.log(`API Messages: Message successfully processed for conversation ${conversationId}`);
        return NextResponse.json({ message: 'Message sent successfully' }, { status: 201 });

    } catch (error: any) {
        console.error("API Messages POST Error:", error);
        return NextResponse.json({ message: 'Failed to send message', error: error.message }, { status: 500 });
    }
}


export async function GET(req: Request) {
    console.log("API GET /api/messages: Received request");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages: Unauthorized attempt to get messages.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;

    try {
        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get('conversationId');
        const recipientId = searchParams.get('recipientId');
        const itemId = searchParams.get('itemId');

        let effectiveConversationId = conversationId;

        if (!effectiveConversationId && recipientId && itemId) {
             effectiveConversationId = generateConversationId(currentUserId, recipientId, itemId);
             console.log(`API Messages: Generated conversation ID: ${effectiveConversationId}`);
        } else if (!effectiveConversationId) {
             console.error("API Messages: Missing conversationId or recipientId/itemId parameters.");
             return NextResponse.json({ message: 'Missing conversation identifier' }, { status: 400 });
        }

        console.log(`API Messages: Fetching messages for conversation ${effectiveConversationId}`);

        const conversationRef = conversationsCollection.doc(effectiveConversationId);
        const convDoc = await conversationRef.get();

        if (!convDoc.exists) {
            console.log(`API Messages: Conversation ${effectiveConversationId} not found. Returning empty array.`);
            return NextResponse.json({ messages: [] }, { status: 200 });
        }

        const conversationData = convDoc.data();
        if (!conversationData?.participantIds?.includes(currentUserId)) {
            console.warn(`API Messages: User ${currentUserId} attempted to access conversation ${effectiveConversationId} they are not part of.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const messagesQuery = conversationRef.collection('messages')
                                             .orderBy('timestamp', 'asc');

        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => {
             const data = doc.data();
             return {
                 id: doc.id,
                 ...data,
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
