import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Required Next.js configuration for dynamic API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Explicitly tell Next.js not to try to statically generate this route
export async function generateStaticParams() {
  return []; // Return empty array to indicate no static paths
}

interface ContactMessage {
    id: string;
    userId: string;
    subject: string;
    message: string;
    status: 'PENDING' | 'READ' | 'RESPONDED';
    createdAt: Date;
    updatedAt: Date;
    user: {
        name: string | null;
        email: string | null;
    };
}

export async function GET(req: Request) {
    console.log("--- API GET /api/admin/contact-messages (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn("API /admin/contact-messages: Unauthorized or not admin attempt.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') as 'PENDING' | 'READ' | 'RESPONDED' | null;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const where = status ? { status } : {};

        const [messages, total] = await Promise.all([
            prisma.contactMessage.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    user: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.contactMessage.count({ where })
        ]);

        const messagesWithDates: ContactMessage[] = messages.map(message => ({
            ...message,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            status: message.status as 'PENDING' | 'READ' | 'RESPONDED',
            user: message.user || { name: null, email: null }
        }));

        console.log(`API /admin/contact-messages: Found ${messagesWithDates.length} messages`);
        console.log("--- API GET /api/admin/contact-messages (Prisma) SUCCESS ---");
        return NextResponse.json({
            messages: messagesWithDates,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/contact-messages (Prisma) FAILED --- Error:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ 
                message: 'Database error occurred', 
                code: error.code,
                meta: error.meta 
            }, { status: 500 });
        }
        return NextResponse.json({ 
            message: 'Failed to fetch contact messages', 
            error: error.message 
        }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    console.log("--- API PATCH /api/admin/contact-messages (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn("API /admin/contact-messages: Unauthorized or not admin attempt to update message.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const { messageId, status } = await req.json();

        if (!messageId) {
            return NextResponse.json({ message: 'Missing message ID' }, { status: 400 });
        }

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

        const updatedMessage = await prisma.contactMessage.update({
            where: { id: messageId },
            data: {
                status: status || undefined,
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

        const messageWithDates: ContactMessage = {
            ...updatedMessage,
            createdAt: updatedMessage.createdAt,
            updatedAt: updatedMessage.updatedAt,
            status: updatedMessage.status as 'PENDING' | 'READ' | 'RESPONDED',
            user: updatedMessage.user || { name: null, email: null }
        };

        console.log(`API /admin/contact-messages: Message ${messageId} updated successfully`);
        console.log("--- API PATCH /api/admin/contact-messages (Prisma) SUCCESS ---");
        return NextResponse.json(messageWithDates, { status: 200 });

    } catch (error: any) {
        console.error("--- API PATCH /api/admin/contact-messages (Prisma) FAILED --- Error:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ 
                message: 'Database error occurred', 
                code: error.code,
                meta: error.meta 
            }, { status: 500 });
        }
        return NextResponse.json({ 
            message: 'Failed to update contact message', 
            error: error.message 
        }, { status: 500 });
    }
} 