// src/app/api/conversations/[id]/approve/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../../auth/[...nextauth]/route'; // Adjust path
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface RouteContext {
  params: {
    id?: string; // Conversation ID from the route parameter
  };
}

export async function PATCH(req: Request, context: RouteContext) {
    const { params } = context;
    const conversationId = params?.id;
    console.log(`--- API PATCH /api/conversations/${conversationId}/approve START ---`);

    // --- Basic Checks --- 
    if (!conversationId) {
         return NextResponse.json({ message: 'Missing conversation ID' }, { status: 400 });
    }
    if (!adminDb) {
        console.error(`API Approve ${conversationId}: Firebase Admin DB is not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    // --- Authentication --- 
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        console.warn(`API Approve ${conversationId}: Unauthorized attempt.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API Approve ${conversationId}: Authenticated as user ${currentUserId}`);

    try {
        // --- Get Conversation & Verify --- 
        const conversationRef = adminDb.collection('conversations').doc(conversationId);
        const convDoc = await conversationRef.get();

        if (!convDoc.exists) {
            console.warn(`API Approve ${conversationId}: Conversation not found.`);
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        const conversationData = convDoc.data();
        // Check if user is a participant
        if (!conversationData?.participantIds?.includes(currentUserId)) {
             console.warn(`API Approve ${conversationId}: User ${currentUserId} forbidden access.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }
        // Check if conversation is already approved
        if (conversationData?.approved === true) {
            console.log(`API Approve ${conversationId}: Conversation already approved.`);
            return NextResponse.json({ message: 'Conversation already approved' }, { status: 200 }); // Or 400?
        }
        // Check if the user is the recipient (not the initiator) - only recipient can approve
        if (conversationData?.initiatorId === currentUserId) {
             console.warn(`API Approve ${conversationId}: Initiator ${currentUserId} cannot approve.`);
            return NextResponse.json({ message: 'Only the recipient can approve this conversation' }, { status: 403 });
        }

        // --- Update Conversation --- 
        await conversationRef.update({
            approved: true,
            approvedAt: FieldValue.serverTimestamp() // Optional timestamp
        });

        console.log(`API Approve ${conversationId}: Conversation approved by user ${currentUserId}.`);
        
         // --- Optional: Notify Initiator --- 
         try {
            // Find the initiator ID
            const initiatorId = conversationData?.initiatorId;
            if (initiatorId && typeof initiatorId === 'string') {
                 // TODO: Import and use createNotification if needed
                 // import { createNotification } from '@/lib/notifications';
                 /*
                 await createNotification({
                     userId: initiatorId,
                     type: 'message_approved', // Define a new type if needed
                     message: `${session.user.name || 'Someone'} approved your message request regarding "${conversationData?.itemTitle || 'your item'}".`,
                     relatedItemId: conversationData?.itemId,
                     relatedMessageId: conversationId,
                     relatedUserId: currentUserId
                 });
                 console.log(`API Approve ${conversationId}: Notification sent to initiator ${initiatorId}`);
                 */
            }
         } catch (notifyError) {
             console.error(`API Approve ${conversationId}: Failed to send notification:`, notifyError);
         }
         // --- End Optional Notification --- 

        console.log(`--- API PATCH /api/conversations/${conversationId}/approve SUCCESS ---`);
        return NextResponse.json({ message: 'Conversation approved successfully.' }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API PATCH /api/conversations/${conversationId}/approve FAILED --- Error:`, error);
        return NextResponse.json({ message: 'Failed to approve conversation', error: error.message }, { status: 500 });
    }
}
