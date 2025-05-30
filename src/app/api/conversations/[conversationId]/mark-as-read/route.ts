import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust path if needed
import prisma from '@/lib/prisma';

export async function POST(
    request: NextRequest,
    context: { params: Record<string, string> }
) {
    const { conversationId } = context.params;

    console.log(`--- API POST /api/conversations/${conversationId}/mark-as-read START ---`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = session.user.id;

    if (!conversationId) {
        return NextResponse.json({ message: 'Conversation ID is required.' }, { status: 400 });
    }

    try {
        // Check if user is a participant
        const participantCheck = await prisma.conversationParticipant.findUnique({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId: currentUserId,
                }
            }
        });

        if (!participantCheck) {
            return NextResponse.json({ message: 'Forbidden. Not a participant.' }, { status: 403 });
        }

        // Update lastReadAt
        const updated = await prisma.conversationParticipant.update({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId: currentUserId,
                },
            },
            data: {
                lastReadAt: new Date(),
            },
        });

        return NextResponse.json({ 
            message: 'Marked as read.', 
            lastReadAt: updated.lastReadAt 
        }, { status: 200 });

    } catch (error: any) {
        console.error('Failed to mark as read:', error);
        if (error.code === 'P2025') {
            return NextResponse.json({ message: 'Not found.' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
    }
}
