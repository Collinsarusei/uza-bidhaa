// src/app/api/conversations/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export async function GET(req: Request) {
    console.log("--- API GET /api/conversations (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Conversations GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;
    console.log(`API Conversations GET: Authenticated as user ${currentUserId}`);

    try {
        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: {
                        id: currentUserId,
                    },
                },
            },
            include: {
                participants: { 
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
                participantsInfo: { 
                    select: { lastReadAt: true, userId: true }
                },
                item: {
                    select: {
                        id: true,
                        title: true,
                        mediaUrls: true,
                        sellerId: true,
                    },
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1, 
                }
            },
            orderBy: {
                lastMessageTimestamp: 'desc',
            },
        });

        const processedConversations = conversations.map((conv) => {
            const currentUserParticipantInfo = conv.participantsInfo.find((p) => p.userId === currentUserId);
            const lastMessage = conv.messages.length > 0 ? conv.messages[0] : null;
            let unreadMessages = false;

            if (lastMessage) {
                if (currentUserParticipantInfo) { 
                    if (!currentUserParticipantInfo.lastReadAt || currentUserParticipantInfo.lastReadAt < lastMessage.createdAt) {
                        if (lastMessage.senderId !== currentUserId) {
                            unreadMessages = true;
                        }
                    }
                } else {
                    if (lastMessage.senderId !== currentUserId) {
                         unreadMessages = true;
                    }
                }
            }
            
            return {
                ...conv,
                itemImageUrl: conv.item?.mediaUrls?.[0] || conv.itemImageUrl || null,
                lastMessageSnippet: lastMessage?.content || conv.lastMessageSnippet,
                lastMessageSenderId: lastMessage?.senderId,
                messages: undefined, 
                unread: unreadMessages,
            };
        });

        console.log(`API Conversations GET: Found ${processedConversations.length} conversations for user ${currentUserId}`);
        return NextResponse.json({ conversations: processedConversations });

    } catch (error: any) {
        console.error("--- API GET /api/conversations (Prisma) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to fetch conversations', error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    console.log("--- API POST /api/conversations (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Conversations POST: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const initiatorId = session.user.id;

    try {
        const body = await req.json();
        const { itemId, sellerId, initialMessageContent, itemTitle, itemImageUrl } = body;

        if (!itemId || !sellerId || !initialMessageContent) {
            return NextResponse.json({ message: 'Missing required fields: itemId, sellerId, initialMessageContent' }, { status: 400 });
        }

        if (initiatorId === sellerId) {
            return NextResponse.json({ message: 'You cannot start a conversation with yourself.' }, { status: 400 });
        }

        const existingConversation = await prisma.conversation.findFirst({
            where: {
                itemId: itemId,
                AND: [
                    { participants: { some: { id: initiatorId } } },
                    { participants: { some: { id: sellerId } } },
                ],
            },
            include: { 
                participants: { select: { id: true, name: true, image: true } },
                item: { select: { id: true, title: true, mediaUrls: true } },
                participantsInfo: { select: { userId: true, lastReadAt: true } }
            }
        });

        if (existingConversation) {
            console.log(`API Conversations POST: Conversation already exists (ID: ${existingConversation.id})`);
            return NextResponse.json({ message: 'Conversation already exists.', conversationId: existingConversation.id, conversation: existingConversation }, { status: 200 });
        }
        
        const now = new Date();

        const newConversation = await prisma.conversation.create({
            data: {
                item: { connect: { id: itemId } },
                itemTitle: itemTitle, 
                itemImageUrl: itemImageUrl, 
                initiator: { connect: { id: initiatorId } },
                participants: { 
                    connect: [
                        { id: initiatorId }, 
                        { id: sellerId }
                    ] 
                },
                participantsInfo: {
                    create: [
                        { userId: initiatorId, lastReadAt: now }, 
                        { userId: sellerId, lastReadAt: null }     
                    ]
                },
                lastMessageSnippet: initialMessageContent,
                lastMessageTimestamp: now,
            },
            include: {
                participants: { select: { id: true, name: true, image: true } },
                item: { select: { id: true, title: true, mediaUrls: true } },
                participantsInfo: true,
            }
        });

        const firstMessage = await prisma.message.create({
            data: {
                conversation: { connect: { id: newConversation.id } },
                sender: { connect: { id: initiatorId } },
                content: initialMessageContent,
                createdAt: now, 
            },
        });
        
        console.log(`API Conversations POST: New conversation created (ID: ${newConversation.id})`);
        // TODO: Trigger real-time notification (e.g., Socket.io event) to sellerId about new conversation/message

        return NextResponse.json({ message: 'Conversation started successfully', conversation: newConversation }, { status: 201 });

    } catch (error: any) {
        console.error("--- API POST /api/conversations (Prisma) FAILED ---", error);
        if (error instanceof PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                console.error("Prisma unique constraint violation (P2002):", error.meta);
                return NextResponse.json({ message: 'Failed to create conversation due to a conflict.' , details: error.meta?.target }, { status: 409 });
            }
        }
        return NextResponse.json({ message: 'Failed to start conversation', error: error.message }, { status: 500 });
    }
}
