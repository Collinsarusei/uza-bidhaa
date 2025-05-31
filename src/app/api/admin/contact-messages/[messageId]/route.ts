import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const updateMessageSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']),
});

interface RouteContext {
  params: {
    messageId: string;
  };
}

export async function GET(
  req: Request,
  context: RouteContext
) {
  const { messageId } = context.params;
  console.log(`--- API GET /api/admin/contact-messages/${messageId} (Prisma) START ---`);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
    console.warn(`API /admin/contact-messages/${messageId}: Unauthorized or not admin attempt.`);
    return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const message = await prisma.contactMessage.findUnique({
      where: { id: messageId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    const messageWithDates = {
      ...message,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      status: message.status as 'PENDING' | 'READ' | 'RESPONDED',
      user: message.user || { name: null, email: null }
    };

    console.log(`API /admin/contact-messages/${messageId}: Message found successfully`);
    console.log("--- API GET /api/admin/contact-messages/[messageId] (Prisma) SUCCESS ---");
    return NextResponse.json(messageWithDates, { status: 200 });
  } catch (error: any) {
    console.error(`--- API GET /api/admin/contact-messages/${messageId} (Prisma) FAILED --- Error:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ 
        message: 'Database error occurred', 
        code: error.code,
        meta: error.meta 
      }, { status: 500 });
    }
    return NextResponse.json({ 
      message: 'Failed to fetch contact message', 
      error: error.message 
    }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin using role
    if ((session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (!context.params?.messageId) {
      return NextResponse.json({ message: 'Message ID is required' }, { status: 400 });
    }

    const body = await req.json();
    const validatedData = updateMessageSchema.parse(body);

    const message = await prisma.contactMessage.update({
      where: {
        id: context.params.messageId,
      },
      data: {
        status: validatedData.status,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error('Error updating contact message:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid request data', errors: error.errors }, { status: 400 });
    }

    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
} 