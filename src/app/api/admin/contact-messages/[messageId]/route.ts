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
  context: any
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      return new NextResponse('Forbidden', { status: 403 });
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
    if (error instanceof z.ZodError) {
      return new NextResponse('Invalid request data', { status: 400 });
    }

    console.error('Error updating contact message:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 