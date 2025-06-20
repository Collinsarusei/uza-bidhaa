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
const CHAT_PAYMENT_WARNING_MESSAGE = "For your safety, ensure all payments are made through the Uza Bidhaa platform. We are not liable for any losses incurred from off-platform payments or direct bank transfers arranged via chat.";


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

  const userId = session.user.id;

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
    }).catch(error => {
      console.error("Error fetching conversation:", error);
      throw new Error("Failed to fetch conversation from database");
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

    // Fetch messages with minimal data to avoid relation issues
    const messages = await prisma.message.findMany({
      where: { 
        conversationId: conversationId
      },
      orderBy: { 
        createdAt: 'asc' 
      },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        content: true,
        createdAt: true,
        isSystemMessage: true
      }
    }).catch(error => {
      console.error("Error fetching messages:", error);
      throw new Error("Failed to fetch messages from database");
    });

    // Manually fetch sender data separately to avoid relation issues
    const senderIds = messages.map(msg => msg.senderId).filter(Boolean);
    const senders = senderIds.length > 0 ? await prisma.user.findMany({
      where: {
        id: {
          in: senderIds
        }
      },
      select: {
        id: true,
        name: true,
        image: true
      }
    }).catch(error => {
      console.error("Error fetching senders:", error);
      return [];
    }) : [];

    // Map messages with sender data
    const messagesWithSenders = messages.map(msg => {
      const sender = senders.find(s => s.id === msg.senderId) || null;
      return {
        ...msg,
        sender
      };
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
    }).catch(error => {
      console.error("Error updating last read timestamp:", error);
    });

    console.log(`API Messages GET: Successfully fetched ${messagesWithSenders.length} messages for conversation ${conversationId}`);
    return NextResponse.json({ messages: messagesWithSenders });
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

  const userId = session.user.id;
  const userName = session.user.name || 'Unknown User';

  try {
    const body = await req.json();
    const { conversationId, text, recipientId, itemId, itemTitle, itemImageUrl } = body;

    // Validate required fields based on whether it's a new or existing conversation
    if (!text) {
      return NextResponse.json({ message: 'Message text is required' }, { status: 400 });
    }

    if (!conversationId && (!recipientId || !itemId)) {
      return NextResponse.json({ message: 'Either conversationId or (recipientId and itemId) are required' }, { status: 400 });
    }

    let targetConversationId = conversationId;

    // If no conversationId, create a new conversation
    if (!conversationId) {
      try {
        const newConversation = await prisma.conversation.create({
          data: {
            initiatorId: userId,
            itemId,
            itemTitle,
            itemImageUrl,
            participants: {
              connect: [
                { id: userId },
                { id: recipientId }
              ]
            }
          }
        });
        targetConversationId = newConversation.id;

        // Add system message about payment safety
        await prisma.message.create({
          data: {
            content: "For your safety, ensure all payments are made through the Uza Bidhaa platform. We are not liable for any losses incurred from off-platform payments or direct bank transfers arranged via chat.",
            senderId: userId,
            conversationId: targetConversationId,
            isSystemMessage: true
          }
        });
      } catch (error) {
        console.error('Error creating conversation:', error);
        return NextResponse.json({ message: 'Failed to create conversation' }, { status: 500 });
      }
    }

    // Verify conversation exists and user is a participant
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: targetConversationId,
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

    // Create the message
    try {
      const message = await prisma.message.create({
        data: {
          content: text,
          senderId: userId,
          conversationId: targetConversationId
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

      // Update conversation's last message timestamp
      await prisma.conversation.update({
        where: { id: targetConversationId },
        data: {
          lastMessageTimestamp: new Date(),
          lastMessageSnippet: text.substring(0, 50)
        }
      });

      return NextResponse.json({ 
        message: 'Message sent successfully',
        newMessage: message
      });
    } catch (error) {
      console.error('Error creating message:', error);
      return NextResponse.json({ message: 'Failed to create message in database' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in message creation:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}