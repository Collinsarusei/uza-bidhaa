// src/app/api/admin/users/[userId]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { handleApiError, validateAdmin, AppError } from '@/lib/error-handling';
import * as z from 'zod';

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
        userId: string;
    };
}

// Schema for updating user by admin
const adminUserUpdateSchema = z.object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    // Add other fields an admin might be allowed to update, e.g.:
    // kycVerified: z.boolean().optional(),
    // location: z.string().optional().nullable(),
});

// GET a single user by ID (Admin only)
export async function GET(request: Request, context: RouteParams) {
    const { userId: targetUserId } = context.params;
    console.log(`--- API GET /api/admin/users/${targetUserId} (Prisma) START ---`);

    try {
        const adminId = validateAdmin(await getServerSession(authOptions));

        if (!targetUserId) {
            throw new AppError('Missing target user ID', 400);
        }

        const user = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                phoneNumber: true,
                mpesaPhoneNumber: true,
                location: true,
                status: true,
                role: true,
                kycVerified: true,
                phoneVerified: true,
                availableBalance: true,
                createdAt: true,
                updatedAt: true,
                // Include counts or related data if useful for admin
                _count: {
                    select: { items: true, paymentsAsBuyer: true, paymentsAsSeller: true, disputesFiled: true }
                }
            }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        console.log(`API /admin/users/${targetUserId}: User found successfully`);
        console.log("--- API GET /api/admin/users/[userId] (Prisma) SUCCESS ---");
        return NextResponse.json(user, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}

// PATCH/PUT to update a user's status or role (Admin only)
export async function PUT(req: Request, { params }: { params: { userId: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const admin = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true }
        });

        if (!admin || admin.role !== 'ADMIN') {
            return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
        }

        const { userId } = params;
        const body = await req.json();
        const { status } = body;

        if (!status || !['ACTIVE', 'SUSPENDED'].includes(status)) {
            return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { status },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            }
        });

        return NextResponse.json({ user: updatedUser });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ message: 'Failed to update user' }, { status: 500 });
    }
}
