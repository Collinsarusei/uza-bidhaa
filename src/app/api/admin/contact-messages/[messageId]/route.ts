import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { handleApiError, validateAdmin, AppError } from '@/lib/error-handling';

// Required Next.js configuration for dynamic API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const dynamicParams = true; // Explicitly allow all dynamic segments

// Explicitly tell Next.js not to try to statically generate this route
export async function generateStaticParams() {
  return []; // Return empty array to indicate no static paths
}

interface RouteParams {
  params: {
    messageId: string;
  };
}

export async function GET(req: Request, context: RouteParams) {
  const { messageId } = context.params;
  try {
    const adminId = validateAdmin(await getServerSession(authOptions));
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
      throw new AppError('Message not found', 404);
    }
    const messageWithDates = {
      ...message,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      status: message.status as 'PENDING' | 'READ' | 'RESPONDED',
      user: message.user || { name: null, email: null }
    };
    return NextResponse.json(messageWithDates, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  const { messageId } = context.params;
  try {
    const adminId = validateAdmin(await getServerSession(authOptions));
    const requestBody = await req.json();
    const message = await prisma.contactMessage.findUnique({
      where: { id: messageId }
    });
    if (!message) {
      throw new AppError('Message not found', 404);
    }
    const updatedMessage = await prisma.contactMessage.update({
      where: { id: messageId },
      data: requestBody,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    return NextResponse.json(updatedMessage, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: RouteParams) {
  const { messageId } = context.params;
  try {
    const adminId = validateAdmin(await getServerSession(authOptions));
    const message = await prisma.contactMessage.findUnique({
      where: { id: messageId }
    });
    if (!message) {
      throw new AppError('Message not found', 404);
    }
    await prisma.contactMessage.delete({
      where: { id: messageId }
    });
    return NextResponse.json({ message: 'Message deleted successfully' }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
