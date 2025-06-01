console.log('VERCEL_BUILD_DEBUG: TOP OF /api/admin/contact-messages/[messageId]/route.ts');

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
  console.log('VERCEL_BUILD_DEBUG: generateStaticParams in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  return []; // Return empty array to indicate no static paths
}

interface RouteParams {
  params: {
    messageId: string;
  };
}

export async function GET(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: GET handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  console.log(`--- API GET /api/admin/contact-messages/${messageId} (Prisma) START ---`);

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

    console.log(`API /admin/contact-messages/${messageId}: Message found successfully`);
    console.log("--- API GET /api/admin/contact-messages/[messageId] (Prisma) SUCCESS ---");
    return NextResponse.json(messageWithDates, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: PATCH handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  console.log(`--- API PATCH /api/admin/contact-messages/${messageId} (Prisma) START ---`);

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

    console.log(`API /admin/contact-messages/${messageId}: Message updated successfully`);
    console.log("--- API PATCH /api/admin/contact-messages/[messageId] (Prisma) SUCCESS ---");
    return NextResponse.json(updatedMessage, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: DELETE handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  console.log(`--- API DELETE /api/admin/contact-messages/${messageId} (Prisma) START ---`);

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

    console.log(`API /admin/contact-messages/${messageId}: Message deleted successfully`);
    console.log("--- API DELETE /api/admin/contact-messages/[messageId] (Prisma) SUCCESS ---");
    return NextResponse.json({ message: 'Message deleted successfully' }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
