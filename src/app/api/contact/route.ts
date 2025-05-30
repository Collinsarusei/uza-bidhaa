import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import * as z from 'zod';

const contactSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200, "Subject too long"),
  message: z.string().min(1, "Message is required").max(2000, "Message too long"),
  userId: z.string().min(1, "User ID is required"),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = contactSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { message: 'Invalid input', errors: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { subject, message, userId } = validation.data;

    // Verify that the user ID matches the session
    if (userId !== session.user.id) {
      return NextResponse.json({ message: 'Invalid user ID' }, { status: 400 });
    }

    // Create contact message
    const contactMessage = await prisma.contactMessage.create({
      data: {
        userId,
        subject,
        message,
        status: 'PENDING',
      },
    });

    // Notify admins about new contact message
    const adminUsers = await prisma.user.findMany({
      where: { role: 'ADMIN' },
    });

    // Create notifications for admins
    await Promise.all(
      adminUsers.map((admin: { id: string }) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'NEW_CONTACT_MESSAGE',
            message: `New contact message from ${session.user?.name || 'User'}: ${subject}`
          },
        })
      )
    );

    return NextResponse.json(
      { message: 'Contact message sent successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating contact message:', error);
    return NextResponse.json(
      { message: 'Failed to send contact message' },
      { status: 500 }
    );
  }
} 