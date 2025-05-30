import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust path as necessary
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  context: { params: { conversationId: string } }
) {
  const { conversationId } = context.params;
  console.log(`--- API POST /api/conversations/${conversationId}/mark-as-read (Prisma) START ---`);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    console.warn("API MarkAsRead: Unauthorized attempt.");
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const currentUserId = session.user.id;

  if (!conversationId) {
    return NextResponse.json({ message: 'Conversation ID is required.' }, { status: 400 });
  }

  try {
    const participantCheck = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversationId,
          userId: currentUserId,
        }
      }
    });

    if (!participantCheck) {
      console.warn(`API MarkAsRead: User ${currentUserId} is not a participant of conversation ${conversationId}.`);
      return NextResponse.json({ message: 'Forbidden. You are not a participant of this conversation.' }, { status: 403 });
    }

    const updatedParticipantInfo = await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: conversationId,
          userId: currentUserId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    console.log(`API MarkAsRead: Conversation ${conversationId} marked as read for user ${currentUserId} at ${updatedParticipantInfo.lastReadAt}`);

    return NextResponse.json({
      message: 'Conversation marked as read successfully.',
      lastReadAt: updatedParticipantInfo.lastReadAt
    }, { status: 200 });

  } catch (error: any) {
    console.error(`--- API POST /api/conversations/${conversationId}/mark-as-read (Prisma) FAILED ---`, error);
    if (error.code === 'P2025') {
      return NextResponse.json({ message: 'Failed to mark as read. Conversation or participant not found.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Failed to mark conversation as read', error: error.message }, { status: 500 });
  }
}
