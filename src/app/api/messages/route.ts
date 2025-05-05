// src/app/api/messages/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null!
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications'; // Import the helper

// --- Add Null Check Early --- 
const conversationsCollection = adminDb?.collection('conversations'); // Use optional chaining

// Helper function to generate a consistent conversation ID
const generateConversationId = (userId1: string, userId2: string, itemId: string): string => {
    const sortedIds = [userId1, userId2].sort();
    return `${sortedIds[0]}_${sortedIds[1]}_item_${itemId}`;
};

export async function POST(req: Request) {
    console.log("API POST /api/messages: Received request");

    // --- Add Null Check Here --- 
    if (!adminDb || !conversationsCollection) {
         console.error("API Messages POST Error: Firebase Admin DB is not initialized.");
         return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    // --- End Null Check ---

    // --- Authentication ---
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages: Unauthorized attempt to send message.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const senderId = session.user.id;
    const senderName = session.user.name || 'Someone'; 
    const senderAvatar = session.user.image || null;

    try {
        // --- Body Parsing & Validation ---
        const body = await req.json();
        const { recipientId, itemId, text, itemTitle, itemImageUrl } = body; // Expect item info now

        if (!recipientId || !itemId || !text || typeof text !== 'string' || text.trim() === '' || !itemTitle) {
            console.error("API Messages: Missing required fields (recipientId, itemId, text, itemTitle).");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }
        if (senderId === recipientId) {
            console.warn(`API Messages: User ${senderId} attempted to send message to themselves.`);
            return NextResponse.json({ message: 'Cannot send message to yourself' }, { status: 400 });
        }

        // --- Prepare Data --- 
        const conversationId = generateConversationId(senderId, recipientId, itemId);
        const conversationRef = conversationsCollection.doc(conversationId);
        const currentTimestamp = FieldValue.serverTimestamp();

        const messageData = {
            senderId: senderId,
            text: text.trim(),
            timestamp: currentTimestamp,
        };

        const initialConversationData = {
            participantIds: [senderId, recipientId],
            itemId: itemId,
            itemTitle: itemTitle, 
            itemImageUrl: itemImageUrl || null,
            createdAt: currentTimestamp,
            approved: false,
            initiatorId: senderId,
            lastMessageTimestamp: currentTimestamp,
            lastMessageSnippet: text.trim().substring(0, 100),
            participantsData: {
                 [senderId]: { name: senderName, avatar: senderAvatar },
             },
        };

        const updateConversationData = {
             lastMessageTimestamp: currentTimestamp,
             lastMessageSnippet: text.trim().substring(0, 100),
             [`participantsData.${senderId}.name`]: senderName,
             [`participantsData.${senderId}.avatar`]: senderAvatar,
        };


        // --- Firestore Transaction --- 
        await adminDb.runTransaction(async (transaction) => {
             const convDoc = await transaction.get(conversationRef);
             const messagesCollectionRef = conversationRef.collection('messages');
             const newMessageRef = messagesCollectionRef.doc();

             if (!convDoc.exists) {
                  console.log(`API Messages: Creating new conversation ${conversationId} (approved: false)`);
                  transaction.set(conversationRef, initialConversationData);
             } else {
                 console.log(`API Messages: Updating existing conversation ${conversationId}`);
                 transaction.update(conversationRef, updateConversationData);
             }
             transaction.set(newMessageRef, messageData);
             console.log(`API Messages: Message added to conversation ${conversationId}`);
        });

        // --- Create Notification for the Recipient --- 
        try {
            const convSnapshot = await conversationRef.get();
            const currentConvData = convSnapshot.data();
            let shouldNotify = false;
            if (currentConvData) {
                 if (currentConvData.approved) {
                     shouldNotify = true;
                 } else {
                     const messagesSnapshot = await conversationRef.collection('messages').limit(2).get();
                     if (messagesSnapshot.size === 1) { 
                         shouldNotify = true;
                         console.log(`API Messages: Notifying recipient for first message in unapproved conversation ${conversationId}`);
                     }
                 }
            }

            if (shouldNotify) {
                // FIX: Removed isRead property as it's handled internally by createNotification
                await createNotification({
                    userId: recipientId,
                    type: 'new_message',
                    message: `${senderName} sent you a message regarding "${itemTitle}".`,
                    relatedItemId: itemId,
                    relatedMessageId: conversationId,
                    relatedUserId: senderId,
                    // isRead: undefined // REMOVED THIS LINE
                });
                 console.log(`API Messages: Notification created for recipient ${recipientId}`);
            } else {
                 console.log(`API Messages: Notification skipped for recipient ${recipientId} (conversation likely exists or unapproved)`);
            }
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

// --- GET Handler (Fetches messages for ONE conversation) --- 
export async function GET(req: Request) {
    console.log("API GET /api/messages: Received request");

    // --- Add Null Check Here --- 
    if (!adminDb || !conversationsCollection) {
         console.error("API Messages GET Error: Firebase Admin DB is not initialized.");
         return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
     // --- End Null Check ---

    // --- Authentication & DB Check --- 
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;

    try {
        // --- Parameters --- 
        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get('conversationId');

        if (!conversationId) {
             console.error("API Messages GET: Missing conversationId parameter.");
             return NextResponse.json({ message: 'Missing conversation identifier' }, { status: 400 });
        }

        console.log(`API Messages GET: Fetching messages for conversation ${conversationId}`);

        // --- Authorization Check --- 
        const conversationRef = conversationsCollection.doc(conversationId);
        const convDoc = await conversationRef.get();

        if (!convDoc.exists) {
            console.log(`API Messages GET: Conversation ${conversationId} not found.`);
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        const conversationData = convDoc.data();
        if (!conversationData?.participantIds?.includes(currentUserId)) {
            console.warn(`API Messages GET: User ${currentUserId} forbidden access to ${conversationId}.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        // --- Fetch Messages --- 
        const messagesQuery = conversationRef.collection('messages')
                                             .orderBy('timestamp', 'asc'); 

        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => {
             const data = doc.data();
             return {
                 id: doc.id,
                 ...data,
                 timestamp: data.timestamp instanceof FieldValue ? null : 
                            data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : null,
             };
        });

        console.log(`API Messages GET: Found ${messages.length} messages for conversation ${conversationId}`);
        return NextResponse.json({ messages: messages, conversation: conversationData }, { status: 200 }); 

    } catch (error: any) {
        console.error("API Messages GET Error:", error);
        return NextResponse.json({ message: 'Failed to fetch messages', error: error.message }, { status: 500 });
    }
}
