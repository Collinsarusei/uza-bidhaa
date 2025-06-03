import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function POST(
    request: Request,
    { params }: { params: { conversationId: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { conversationId } = params;

        // Get the conversation to check if the user is the seller
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { item: true }
        });

        if (!conversation) {
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        // Check if the current user is the seller of the item
        if (conversation.item.sellerId !== session.user.id) {
            return NextResponse.json({ message: 'Only the seller can approve conversations' }, { status: 403 });
        }

        // Update the conversation to mark it as approved
        const updatedConversation = await prisma.conversation.update({
            where: { id: conversationId },
            data: { approved: true },
            include: {
                participants: true,
                item: true
            }
        });

        // Create a notification for the buyer
        const buyerId = updatedConversation.participants.find(p => p.id !== (session.user as any).id)?.id;
        if (buyerId) {
            await prisma.notification.create({
                data: {
                    userId: buyerId,
                    type: 'conversation_approved',
                    message: `Your conversation about "${updatedConversation.itemTitle}" has been approved.`,
                    relatedItemId: updatedConversation.itemId
                }
            });
        }

        return NextResponse.json({ message: 'Conversation approved successfully', conversation: updatedConversation });
    } catch (error) {
        console.error('Error approving conversation:', error);
        return NextResponse.json({ message: 'Failed to approve conversation' }, { status: 500 });
    }
} 