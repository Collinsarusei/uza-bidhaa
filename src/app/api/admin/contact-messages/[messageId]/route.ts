console.log('VERCEL_BUILD_DEBUG: TOP OF /api/admin/contact-messages/[messageId]/route.ts (SIMPLIFIED)');

import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '@/app/api/auth/[...nextauth]/route';
// import prisma from '@/lib/prisma';
// import { handleApiError, validateAdmin, AppError } from '@/lib/error-handling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const dynamicParams = true;

export async function generateStaticParams() {
  console.log('VERCEL_BUILD_DEBUG: generateStaticParams in /api/admin/contact-messages/[messageId]/route.ts (SIMPLIFIED) CALLED');
  return [];
}

interface RouteParams {
  params: {
    messageId: string;
  };
}

// Simplified GET to remove prisma and authOptions dependencies for build testing
export async function GET(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: SIMPLIFIED GET handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  return NextResponse.json({ message: `Simplified GET for messageId: ${messageId}. Build test only.`, status: 'success' });
  /*
  try {
    // const adminId = validateAdmin(await getServerSession(authOptions));
    // const message = await prisma.contactMessage.findUnique({
    //   where: { id: messageId },
    //   include: {
    //     user: {
    //       select: {
    //         name: true,
    //         email: true,
    //       },
    //     },
    //   },
    // });
    // if (!message) {
    //   throw new AppError('Message not found', 404);
    // }
    // const messageWithDates = {
    //   ...message,
    //   createdAt: message.createdAt,
    //   updatedAt: message.updatedAt,
    //   status: message.status as 'PENDING' | 'READ' | 'RESPONDED',
    //   user: message.user || { name: null, email: null }
    // };
    // return NextResponse.json(messageWithDates, { status: 200 });
  } catch (error) {
    // return handleApiError(error);
    return NextResponse.json({ message: "Error in simplified GET", error: (error as Error).message }, { status: 500 });
  }
  */
}

// Simplified PATCH to remove prisma and authOptions dependencies for build testing
export async function PATCH(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: SIMPLIFIED PATCH handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  return NextResponse.json({ message: `Simplified PATCH for messageId: ${messageId}. Build test only.`, status: 'success' });
  /*
  try {
    // const adminId = validateAdmin(await getServerSession(authOptions));
    // const requestBody = await req.json();
    // const message = await prisma.contactMessage.findUnique({
    //   where: { id: messageId }
    // });
    // if (!message) {
    //   throw new AppError('Message not found', 404);
    // }
    // const updatedMessage = await prisma.contactMessage.update({
    //   where: { id: messageId },
    //   data: requestBody,
    //   include: {
    //     user: {
    //       select: {
    //         name: true,
    //         email: true,
    //       },
    //     },
    //   },
    // });
    // return NextResponse.json(updatedMessage, { status: 200 });
  } catch (error) {
    // return handleApiError(error);
    return NextResponse.json({ message: "Error in simplified PATCH", error: (error as Error).message }, { status: 500 });
  }
  */
}

// Simplified DELETE to remove prisma and authOptions dependencies for build testing
export async function DELETE(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: SIMPLIFIED DELETE handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  return NextResponse.json({ message: `Simplified DELETE for messageId: ${messageId}. Build test only.`, status: 'success' });
  /*
  try {
    // const adminId = validateAdmin(await getServerSession(authOptions));
    // const message = await prisma.contactMessage.findUnique({
    //   where: { id: messageId }
    // });
    // if (!message) {
    //   throw new AppError('Message not found', 404);
    // }
    // await prisma.contactMessage.delete({
    //   where: { id: messageId }
    // });
    // return NextResponse.json({ message: 'Message deleted successfully' }, { status: 200 });
  } catch (error) {
    // return handleApiError(error);
    return NextResponse.json({ message: "Error in simplified DELETE", error: (error as Error).message }, { status: 500 });
  }
  */
}
