import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ItemStatus } from "@prisma/client";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

export async function GET(req: Request, context: any) {
    console.log("API GET /api/users/[userId] (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Users GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { userId: targetUserId } = context.params;

    try {
        const user = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                createdAt: true,
                items: {
                    where: { status: ItemStatus.AVAILABLE },
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        price: true,
                        category: true,
                        status: true,
                        mediaUrls: true,
                        createdAt: true
                    }
                },
                _count: {
                    select: {
                        items: true
                    }
                }
            }
        });

        if (!user) {
            console.log(`API Users GET: User ${targetUserId} not found.`);
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        console.log(`API Users GET: Successfully retrieved user ${targetUserId}`);
        return NextResponse.json(user);

    } catch (error: any) {
        console.error("API Users GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch user', error: error.message }, { status: 500 });
    }
}

export async function PUT(req: Request, context: any) {
    console.log("API PUT /api/users/[userId] (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Users PUT: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { userId: targetUserId } = context.params;

    if (userId !== targetUserId) {
        console.warn(`API Users PUT: User ${userId} attempted to update another user ${targetUserId}.`);
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { name, email, image } = body;

        if (!name || !email) {
            console.error("API Users PUT: Missing required fields.");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                name,
                email,
                image
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                createdAt: true
            }
        });

        console.log(`API Users PUT: Successfully updated user ${userId}`);
        return NextResponse.json(updatedUser);

    } catch (error: any) {
        console.error("API Users PUT Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to update user', error: error.message }, { status: 500 });
    }
} 