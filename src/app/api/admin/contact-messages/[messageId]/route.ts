console.log('VERCEL_BUILD_DEBUG: TOP OF /api/admin/contact-messages/[messageId]/route.ts (TESTING PRISMA)');

import { NextResponse } from 'next/server';
// import { getServerSession } from 'next-auth/next';
// import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma'; // Step 1: Uncomment prisma import
import { AppError } from '@/lib/error-handling'; // Assuming AppError is needed if prisma throws, handleApiError is not used yet

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const dynamicParams = true;

export async function generateStaticParams() {
  console.log('VERCEL_BUILD_DEBUG: generateStaticParams in /api/admin/contact-messages/[messageId]/route.ts (TESTING PRISMA) CALLED');
  return [];
}

interface RouteParams {
  params: {
    messageId: string;
  };
}

export async function GET(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: GET handler in /api/admin/contact-messages/[messageId]/route.ts (TESTING PRISMA) CALLED');
  const { messageId } = context.params;
  
  try {
    console.log(`VERCEL_BUILD_DEBUG: Attempting prisma call for messageId: ${messageId}`);
    const message = await prisma.contactMessage.findUnique({
      where: { id: messageId },
      // Minimal include for testing if prisma works at all
       include: {
        user: {
           select: {
             name: true,
            email: true,
           },
         },
       },
    });
    console.log(`VERCEL_BUILD_DEBUG: Prisma call completed. Message found: ${!!message}`);

    if (!message) {
      // Using AppError which we imported, but not the full handleApiError yet
      return NextResponse.json({ message: 'Message not found (test)', code: 'P2025'}, { status: 404 });
    }
    return NextResponse.json({ message: `Prisma test successful for messageId: ${messageId}`, data: message, status: 'success' });

  } catch (error: any) {
    console.error('VERCEL_BUILD_ERROR: Error during prisma test in GET handler:', error.message);
    // Return a generic error for the test
    return NextResponse.json({ message: "Error during Prisma test", error: error.message }, { status: 500 });
  }
}

// Keep PATCH and DELETE simplified (no prisma/auth yet) for focused testing on GET with Prisma
export async function PATCH(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: SIMPLIFIED PATCH handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  return NextResponse.json({ message: `Simplified PATCH for messageId: ${messageId}. Build test only.`, status: 'success' });
}

export async function DELETE(req: Request, context: RouteParams) {
  console.log('VERCEL_BUILD_DEBUG: SIMPLIFIED DELETE handler in /api/admin/contact-messages/[messageId]/route.ts CALLED');
  const { messageId } = context.params;
  return NextResponse.json({ message: `Simplified DELETE for messageId: ${messageId}. Build test only.`, status: 'success' });
}
