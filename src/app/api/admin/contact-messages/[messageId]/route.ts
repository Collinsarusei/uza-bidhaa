import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const updateMessageSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']),
});

interface RouteContext {
  params: {
    messageId: string;
  };
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