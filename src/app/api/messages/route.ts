// src/app/api/messages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications'; // Assuming this lib exists
import { Message as ClientMessageType, UserProfile as ClientUserProfileType } from '@/lib/types'; // For strong typing of emitted message
import { getIO } from '@/lib/socket';

export const dynamic = 'force-dynamic'; // Ensures fresh data, good for APIs
export const runtime = 'nodejs';        // Required for Prisma and Node.js features

const SYSTEM_MESSAGE_SENDER_ID = "system_warning";
const CHAT_PAYMENT_WARNING_MESSAGE = "For your safety, ensure all payments are made through the Uza Bidhaa platform. We are not liable for any losses incurred from off-platform payments or direct M-Pesa transfers arranged via chat.";


interface NewMessageRequestBody {
  conversationId?: string;
  recipientId?: string;
  itemId?: string;
  text?: string;
  itemTitle?: string;
  itemImageUrl?: string | null;
}

// Helper function to emit socket events
const emitMessageEvent = (conversationId: string, message: any) => {
  const io = getIO();
  if (io) {
    io.to(`conversation:${conversationId}`).emit('message-received', message);
  }
};

// GET endpoint for polling messages
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ message: 'Conversation ID is required' }, { status: 400 });
  }

  try {
    // Verify user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            id: session.user.id
          }
        }
      }
    });

    if (!conversation) {
      return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
    }

    // Fetch messages
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversationId
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ message: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST endpoint for sending messages
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { conversationId, text } = await req.json();
    const senderId = session.user.id;
    const senderName = session.user.name || 'Unknown User';

    if (!conversationId || !text) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Verify conversation exists and user is a participant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            id: senderId
          }
        }
      },
      include: {
        participants: true,
        item: true
      }
    });

    if (!conversation) {
      return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
    }

    // Create the message
    const newMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: text.trim(),
        createdAt: new Date()
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    });

    // Update conversation's last message
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageSnippet: text.trim().substring(0, 100),
        lastMessageTimestamp: new Date()
      }
    });

    // Create notification for other participants
    const otherParticipants = conversation.participants.filter(p => p.id !== senderId);
    for (const participant of otherParticipants) {
      await createNotification({
        userId: participant.id,
        type: 'new_message',
        message: `${senderName} sent you a message${conversation.item ? ` about "${conversation.item.title}"` : ''}`,
        relatedItemId: conversation.item?.id
      });
    }

    return NextResponse.json({ newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ message: 'Failed to send message' }, { status: 500 });
  }
}