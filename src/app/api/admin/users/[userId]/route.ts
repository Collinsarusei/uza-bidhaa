// src/app/api/admin/users/[userId]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Prisma } from '@prisma/client';
import { handleApiError, validateAdmin, AppError } from '@/lib/error-handling';
import * as z from 'zod';

// Required Next.js configuration for dynamic API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

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
export async function PUT(req: Request, context: RouteParams) {
    const { userId: targetUserId } = context.params;
    console.log(`--- API PUT /api/admin/users/${targetUserId} (Prisma) START ---`);

    try {
        const adminId = validateAdmin(await getServerSession(authOptions));

        if (!targetUserId) {
            throw new AppError('Missing target user ID', 400);
        }

        // Prevent admin from modifying their own critical fields like role or status to avoid self-lockout
        if (targetUserId === adminId) {
            const bodyForSelfCheck = await req.clone().json();
            if (bodyForSelfCheck.role && bodyForSelfCheck.role !== 'ADMIN') {
                throw new AppError('Admin cannot revoke their own admin role', 403);
            }
            if (bodyForSelfCheck.status && bodyForSelfCheck.status !== 'ACTIVE') {
                throw new AppError('Admin cannot change their own status to non-active', 403);
            }
        }

        const body = await req.json();
        const validation = adminUserUpdateSchema.safeParse(body);

        if (!validation.success) {
            throw new AppError('Invalid input', 400);
        }
        
        const dataToUpdate = validation.data;
        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No fields provided for update', 400);
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data: dataToUpdate,
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                role: true,
                updatedAt: true 
            }
        });
        
        console.log(`API /admin/users/${targetUserId}: User updated successfully`);
        console.log("--- API PUT /api/admin/users/[userId] (Prisma) SUCCESS ---");
        return NextResponse.json({ message: 'User updated successfully', user: updatedUser }, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}
