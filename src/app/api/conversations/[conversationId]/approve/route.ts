import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(
    request: Request,
    { params }: { params: { conversationId: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.name) {
        return NextResponse.json({ message: 'Unauthorized or user data incomplete' }, { status: 401 });
    }

    try {
        const { conversationId } = params;
        const currentUserId = session.user.id;
        const currentUserName = session.user.name;

        // Get the conversation with all necessary relations
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: { select: { id: true } },
                item: { select: { id: true, title: true, sellerId: true } },
                initiator: { select: { id: true, name: true } }
            }
        });

        if (!conversation) {
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        // Check if user is a participant
        const isParticipant = conversation.participants.some(p => p.id === currentUserId);
        if (!isParticipant) {
            return NextResponse.json({ message: 'You are not a participant in this conversation' }, { status: 403 });
        }

        // Check if conversation is already approved
        if (conversation.approved) {
            return NextResponse.json({ message: 'Conversation is already approved' }, { status: 200 });
        }

        // Verify the approver is the seller
        if (conversation.item.sellerId !== currentUserId) {
            return NextResponse.json({ message: 'Only the seller can approve this conversation' }, { status: 403 });
        }

        // Update the conversation to mark it as approved
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                approved: true,
                approvedAt: new Date()
            },
            include: {
                participants: true,
                item: true,
                initiator: true
            }
        });

        // Create notification for the buyer (initiator)
        if (updatedConversation.initiator) {
            await createNotification({
                userId: updatedConversation.initiator.id,
                type: 'conversation_approved',
                message: `${currentUserName} approved your conversation about "${updatedConversation.itemTitle || updatedConversation.item.title}"`,
                relatedItemId: updatedConversation.itemId
            });
        }

        return NextResponse.json({
            message: 'Conversation approved successfully',
            conversation: updatedConversation
        });
    } catch (error) {
        console.error('Error approving conversation:', error);
        return NextResponse.json({ message: 'Failed to approve conversation' }, { status: 500 });
    }
} 