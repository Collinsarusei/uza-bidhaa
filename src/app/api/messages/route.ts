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
  console.log("API GET /api/messages: Received request");
  
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    console.warn("API Messages GET: Unauthorized attempt");
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id; // Store user ID in a variable to avoid repeated access

  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      console.error("API Messages GET: Missing conversationId parameter");
      return NextResponse.json({ message: 'Missing conversation identifier' }, { status: 400 });
    }

    console.log(`API Messages GET: Fetching messages for conversation ${conversationId}`);

    // First check if conversation exists and user has access
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
        participantsInfo: { select: { userId: true, lastReadAt: true } }
      }
    });

    if (!conversation) {
      console.log(`API Messages GET: Conversation ${conversationId} not found`);
      return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
    }

    // Check if user is a participant
    if (!conversation.participants.some(p => p.id === userId)) {
      console.warn(`API Messages GET: User ${userId} forbidden access to ${conversationId}`);
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
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

    // Update last read timestamp for the current user
    await prisma.conversationParticipant.updateMany({
      where: {
        conversationId: conversationId,
        userId: userId
      },
      data: {
        lastReadAt: new Date()
      }
    });

    console.log(`API Messages GET: Successfully fetched ${messages.length} messages for conversation ${conversationId}`);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("API Messages GET Error:", error);
    return NextResponse.json({ 
      message: 'Failed to fetch messages',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST endpoint for sending messages
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id; // Store user ID in a variable to avoid repeated access
  const userName = session.user.name || 'Unknown User';

  try {
    const { conversationId, text } = await req.json();

    if (!conversationId || !text) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Verify conversation exists and user is a participant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            id: userId
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

    // Check if conversation is approved
    if (!conversation.approved && conversation.initiatorId !== userId) {
      return NextResponse.json({ message: 'This conversation is not yet approved' }, { status: 403 });
    }

    // Create the message
    const newMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
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
    const otherParticipants = conversation.participants.filter(p => p.id !== userId);
    for (const participant of otherParticipants) {
      await createNotification({
        userId: participant.id,
        type: 'new_message',
        message: `${userName} sent you a message${conversation.item ? ` about "${conversation.item.title}"` : ''}`,
        relatedItemId: conversation.item?.id
      });
    }

    return NextResponse.json({ newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ 
      message: 'Failed to send message',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}