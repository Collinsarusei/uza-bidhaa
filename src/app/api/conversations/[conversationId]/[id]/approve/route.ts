// src/app/api/conversations/[conversationId]/[id]/approve/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications'; // Ensure this is correctly imported and migrated

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const dynamicParams = true; // Explicitly allow all dynamic segments

// Explicitly tell Next.js not to try to statically generate this route
export async function generateStaticParams() {
  return []; // Return empty array to indicate no static paths
}

interface RouteContext {
  params: {
    conversationId?: string;
    id?: string; // Second dynamic parameter, though not used in this logic
  };
}

export async function PATCH(req: Request, context: RouteContext) { // Use RouteContext
    const { conversationId } = context.params; // Correctly get conversationId
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
                participants: { select: { id: true } }, // Corrected: Select 'id' from related User model
                item: { select: { title: true, id: true } } // For notification context
            }
        });

        if (!conversation) {
            console.warn(`API Approve ${conversationId}: Conversation not found.`);
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        // Check if current user is a participant by looking at the ConversationParticipant table records
        const isParticipant = await prisma.conversationParticipant.findFirst({
            where: {
                conversationId: conversationId,
                userId: currentUserId
            }
        });

        if (!isParticipant) {
             console.warn(`API Approve ${conversationId}: User ${currentUserId} forbidden. Not a participant.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        if (conversation.approved) {
            console.log(`API Approve ${conversationId}: Conversation already approved.`);
            return NextResponse.json({ message: 'Conversation already approved' }, { status: 200 }); 
        }

        // Ensure the person approving is NOT the initiator of the conversation
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
                    relatedItemId: conversation.item?.id,
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
