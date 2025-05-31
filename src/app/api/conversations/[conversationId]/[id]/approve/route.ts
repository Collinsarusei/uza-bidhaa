// src/app/api/conversations/[id]/approve/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications'; // Ensure this is correctly imported and migrated

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

interface RouteContext {
  params: {
    id?: string; // Conversation ID from the route parameter
  };
}

export async function PATCH(req: Request, context: any) {
    const { id: conversationId } = context.params;
    console.log(`--- API PATCH /api/conversations/${conversationId}/approve (Prisma) START ---`);

    if (!conversationId) {
         return NextResponse.json({ message: 'Missing conversation ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id || !session.user.name) { // Added session.user.name check for notification
        console.warn(`API Approve ${conversationId}: Unauthorized attempt or missing user name.`);
        return NextResponse.json({ message: 'Unauthorized or user data incomplete' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    const currentUserName = session.user.name;
    console.log(`API Approve ${conversationId}: Authenticated as user ${currentUserId}`);

    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: { select: { id: true } }, // To check if current user is a participant
                item: { select: { title: true, id: true } } // For notification context
            }
        });

        if (!conversation) {
            console.warn(`API Approve ${conversationId}: Conversation not found.`);
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        const isParticipant = conversation.participants.some((p: { id: string }) => p.id === currentUserId);
        if (!isParticipant) {
             console.warn(`API Approve ${conversationId}: User ${currentUserId} forbidden. Not a participant.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        if (conversation.approved) {
            console.log(`API Approve ${conversationId}: Conversation already approved.`);
            return NextResponse.json({ message: 'Conversation already approved' }, { status: 200 }); 
        }

        if (conversation.initiatorId === currentUserId) {
             console.warn(`API Approve ${conversationId}: Initiator ${currentUserId} cannot approve.`);
            return NextResponse.json({ message: 'Only the recipient can approve this conversation' }, { status: 403 });
        }

        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                approved: true,
                approvedAt: new Date(),
            },
        });

        console.log(`API Approve ${conversationId}: Conversation approved by user ${currentUserId}.`);
        
        // Notify Initiator
        if (updatedConversation.initiatorId) {
            try {
                await createNotification({
                    userId: updatedConversation.initiatorId,
                    type: 'conversation_approved',
                    message: `${currentUserName} approved your conversation about "${conversation.item?.title || 'the item'}".`,
                    relatedItemId: conversation.item?.id, // Use conversation.item.id
                    // relatedConversationId: conversationId, // Optional: if you add this to Notification model
                });
                console.log(`API Approve ${conversationId}: Notification sent to initiator ${updatedConversation.initiatorId}`);
            } catch (notifyError) {
                console.error(`API Approve ${conversationId}: Failed to send approval notification:`, notifyError);
            }
        }

        console.log(`--- API PATCH /api/conversations/${conversationId}/approve (Prisma) SUCCESS ---`);
        return NextResponse.json({ message: 'Conversation approved successfully.', approvedAt: updatedConversation.approvedAt }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API PATCH /api/conversations/${conversationId}/approve (Prisma) FAILED --- Error:`, error);
        if (error.code === 'P2025') { // Prisma error: Record to update not found
            return NextResponse.json({ message: 'Conversation not found for update.' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Failed to approve conversation', error: error.message }, { status: 500 });
    }
}
