// src/app/api/messages/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const SYSTEM_MESSAGE_SENDER_ID = "system_warning"; 
const CHAT_PAYMENT_WARNING_MESSAGE = "For your safety, ensure all payments are made through the Uza Bidhaa platform. We are not liable for any losses incurred from off-platform payments or direct M-Pesa transfers arranged via chat.";

export async function POST(req: Request) {
    console.log("API POST /api/messages (Prisma): Received request");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.name) {
        console.warn("API Messages POST: Unauthorized or user name missing.");
        return NextResponse.json({ message: 'Unauthorized or user data incomplete' }, { status: 401 });
    }
    const senderId = session.user.id;
    const senderName = session.user.name; 

    try {
        const body = await req.json();
        const { conversationId: existingConvId, recipientId, itemId, text, itemTitle, itemImageUrl } = body;

        if (!text || typeof text !== 'string' || text.trim() === '') {
            console.error("API Messages POST: Missing or invalid text field.");
            return NextResponse.json({ message: 'Missing or invalid text field' }, { status: 400 });
        }

        let conversationForNotification: any; // To store conversation data for notification logic

        if (existingConvId) {
            const existingConversationDetails = await prisma.conversation.findUnique({ 
                where: { id: existingConvId },
                include: { 
                    participants: { select: { id: true } },
                    item: { select: { id: true, title: true, sellerId: true } }
                }
            });

            if (!existingConversationDetails) {
                return NextResponse.json({ message: 'Conversation not found.' }, { status: 404 });
            }

            // Check if user is a participant
            if (!existingConversationDetails.participants.some((p: { id: string }) => p.id === senderId)) {
                return NextResponse.json({ message: 'Forbidden. You are not part of this conversation.' }, { status: 403 });
            }

            // Check if conversation is approved or if user is the initiator
            const isInitiator = existingConversationDetails.initiatorId === senderId;
            if (!existingConversationDetails.approved && !isInitiator) {
                return NextResponse.json({ message: 'This conversation is not yet approved.' }, { status: 403 });
            }

            const now = new Date();
            const transactionResults = await prisma.$transaction([
                prisma.message.create({
                    data: {
                        conversationId: existingConvId,
                        senderId: senderId,
                        content: text.trim(),
                        createdAt: now,
                    }
                }),
                prisma.conversation.update({
                    where: { id: existingConvId },
                    data: {
                        lastMessageSnippet: text.trim().substring(0, 100),
                        lastMessageTimestamp: now,
                        participantsInfo: {
                            updateMany: {
                                where: { userId: senderId, conversationId: existingConvId },
                                data: { lastReadAt: now }
                            }
                        }
                    },
                    include: { 
                        item: { select: { sellerId: true, title: true, id: true } }, 
                        participants: { select: { id: true } },
                    }
                }),
            ]);
            conversationForNotification = transactionResults[1];
        } else {
            // For new conversations, require itemId, itemTitle and recipientId
            if (!itemId || !itemTitle || !recipientId) {
                console.error("API Messages POST: Missing required fields for new conversation (itemId, itemTitle, recipientId).");
                return NextResponse.json({ message: 'Missing required fields for new conversation' }, { status: 400 });
            }

            // Check if conversation already exists
            const foundConversation = await prisma.conversation.findFirst({
                where: {
                    itemId: itemId,
                    AND: [
                        { participants: { some: { id: senderId } } },
                        { participants: { some: { id: recipientId } } },
                    ]
                }
            });

            if (foundConversation) {
                return NextResponse.json({ message: 'Conversation already exists.', conversationId: foundConversation.id }, { status: 409 });
            }

            const now = new Date();
            conversationForNotification = await prisma.conversation.create({
                data: {
                    item: { connect: { id: itemId } },
                    itemTitle: itemTitle,
                    itemImageUrl: itemImageUrl || null,
                    initiator: { connect: { id: senderId } },
                    participants: { connect: [{ id: senderId }, { id: recipientId }] },
                    participantsInfo: {
                        create: [
                            { userId: senderId, lastReadAt: now },
                            { userId: recipientId, lastReadAt: null }
                        ]
                    },
                    messages: {
                        create: [
                            {
                                senderId: SYSTEM_MESSAGE_SENDER_ID,
                                content: CHAT_PAYMENT_WARNING_MESSAGE,
                                isSystemMessage: true,
                                createdAt: new Date(now.getTime() + 1) 
                            },
                            {
                                senderId: senderId,
                                content: text.trim(),
                                createdAt: new Date(now.getTime() + 2) 
                            }
                        ]
                    },
                    lastMessageSnippet: text.trim().substring(0, 100),
                    lastMessageTimestamp: new Date(now.getTime() + 2),
                    hasShownPaymentWarning: true,
                    approved: false, 
                },
                include: { 
                    item: { select: { sellerId: true, title: true, id: true } }, 
                    participants: { select: { id: true } }
                }
            });
        }

        // Notification Logic
        if (conversationForNotification && conversationForNotification.item) {
            const actualRecipientId = conversationForNotification.participants.find((p: { id: string }) => p.id !== senderId)?.id;
            if (actualRecipientId) {
                let shouldNotify = false;
                if (conversationForNotification.approved) {
                    shouldNotify = true;
                } else {
                    const userMessagesCount = await prisma.message.count({
                        where: {
                            conversationId: conversationForNotification.id,
                            senderId: senderId,
                            isSystemMessage: false
                        }
                    });
                    if (userMessagesCount === 1) { 
                        shouldNotify = true;
                        console.log(`API Messages POST: Notifying recipient for first user message in unapproved conversation ${conversationForNotification.id}`);
                    }
                }

                if (shouldNotify) {
                    await createNotification({
                        userId: actualRecipientId,
                        type: 'new_message',
                        message: `${senderName} sent you a message regarding "${conversationForNotification.item.title}".`,
                        relatedItemId: conversationForNotification.item.id,
                    });
                    console.log(`API Messages POST: Notification created for recipient ${actualRecipientId}`);
                }
            }
        } else {
            console.warn("API Messages POST: conversationForNotification or item details missing, skipping notification.", conversationForNotification);
        }
        
        console.log(`API Messages POST: Message successfully processed for conversation ${conversationForNotification.id}`);
        return NextResponse.json({ message: 'Message sent successfully', conversationId: conversationForNotification.id }, { status: 201 });

    } catch (error: any) {
        console.error("API Messages POST Error (Prisma):", error);
        if (error instanceof PrismaClientKnownRequestError) {
            console.error(`Prisma Error Code: ${error.code}, Meta: ${JSON.stringify(error.meta)}`);
        }
        return NextResponse.json({ message: 'Failed to send message', error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    console.log("API GET /api/messages (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Messages GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const currentUserId = session.user.id;

    try {
        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get('conversationId');

        if (!conversationId) {
             console.error("API Messages GET: Missing conversationId parameter.");
             return NextResponse.json({ message: 'Missing conversation identifier' }, { status: 400 });
        }

        console.log(`API Messages GET: Fetching messages for conversation ${conversationId}`);

        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: { select: { id: true, name: true, image: true } },
                participantsInfo: { select: { userId: true, lastReadAt: true } },
                item: { select: { id: true, title: true, sellerId: true, mediaUrls: true } },
            }
        });

        if (!conversation) {
            console.log(`API Messages GET: Conversation ${conversationId} not found.`);
            return NextResponse.json({ message: 'Conversation not found' }, { status: 404 });
        }

        if (!conversation.participants.some((p: { id: string }) => p.id === currentUserId)) {
            console.warn(`API Messages GET: User ${currentUserId} forbidden access to ${conversationId}.`);
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: conversationId },
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, name: true, image: true } } } 
        });
        
        const currentUserParticipantInfo = conversation.participantsInfo.find((p: { userId: string }) => p.userId === currentUserId);
        const lastMessageInConversation = messages.length > 0 ? messages[messages.length -1] : null;
        let unreadForCurrentUser = false;
        if (lastMessageInConversation && lastMessageInConversation.senderId !== currentUserId) {
            if (!currentUserParticipantInfo?.lastReadAt || currentUserParticipantInfo.lastReadAt < lastMessageInConversation.createdAt) {
                unreadForCurrentUser = true;
            }
        }

        console.log(`API Messages GET: Found ${messages.length} messages for conversation ${conversationId}`);
        return NextResponse.json({ 
            messages: messages,
            conversation: {
                ...conversation,
                itemImageUrl: conversation.item?.mediaUrls?.[0] || conversation.itemImageUrl,
                unread: unreadForCurrentUser 
            }
        }, { status: 200 }); 

    } catch (error: any) {
        console.error("API Messages GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch messages', error: error.message }, { status: 500 });
    }
}
