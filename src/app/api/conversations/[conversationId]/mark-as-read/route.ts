import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  context: any // ✅ workaround for deployment issues on Vercel
) {
  const conversationId = context?.params?.conversationId;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const currentUserId = session.user.id;

  if (!conversationId) {
    return NextResponse.json({ message: 'Conversation ID required' }, { status: 400 });
  }

  try {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUserId,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ message: 'Not a participant' }, { status: 403 });
    }

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
      message: 'Marked as read',
      lastReadAt: updated.lastReadAt,
    });
  } catch (error: any) {
    console.error('Failed to mark as read:', error);
    return NextResponse.json({ message: 'Server error', error: error.message }, { status: 500 });
  }
}
