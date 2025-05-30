// src/app/api/admin/users/[userId]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Prisma, PrismaClientKnownRequestError } from '@prisma/client';
import * as z from 'zod';

interface RouteContext {
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
export async function GET(request: Request, context: any) {
    const { userId: targetUserId } = context.params;
    console.log(`--- API GET /api/admin/users/${targetUserId} (Prisma) START ---`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    if (!targetUserId) {
        return NextResponse.json({ message: 'Missing target user ID' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { // Select fields appropriate for admin view, exclude password
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
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }
        return NextResponse.json(user, { status: 200 });
    } catch (error: any) {
        console.error(`--- API GET /api/admin/users/${targetUserId} (Prisma) FAILED ---`, error);
        return NextResponse.json({ message: 'Failed to fetch user', error: error.message }, { status: 500 });
    }
}


// PATCH/PUT to update a user's status or role (Admin only)
export async function PUT(req: Request, context: any) {
    const { userId: targetUserId } = context.params;
    console.log(`--- API PUT /api/admin/users/${targetUserId} (Prisma) START ---`);

    if (!targetUserId) {
        return NextResponse.json({ message: 'Missing target user ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const adminUserId = session.user.id;

    // Prevent admin from modifying their own critical fields like role or status to avoid self-lockout
    // This check might need to be more sophisticated for multiple admins scenarios
    if (targetUserId === adminUserId) {
        const bodyForSelfCheck = await req.clone().json();
        if (bodyForSelfCheck.role && bodyForSelfCheck.role !== 'ADMIN') {
             return NextResponse.json({ message: 'Admin cannot revoke their own admin role.' }, { status: 403 });
        }
        if (bodyForSelfCheck.status && bodyForSelfCheck.status !== 'ADMIN' && bodyForSelfCheck.status !== 'ACTIVE') {
             return NextResponse.json({ message: 'Admin cannot change their own status to non-active/non-admin via this route.' }, { status: 403 });
        }
    }

    try {
        const body = await req.json();
        const validation = adminUserUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        
        const dataToUpdate = validation.data;
        if (Object.keys(dataToUpdate).length === 0) {
            return NextResponse.json({ message: 'No fields provided for update.' }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data: dataToUpdate,
            select: { // Return selected fields, excluding password
                id: true, name: true, email: true, status: true, role: true, updatedAt: true 
            }
        });
        
        console.log(`Admin User Update: User ${targetUserId} updated by admin ${adminUserId}. New data:`, dataToUpdate);
        return NextResponse.json({ message: 'User updated successfully.', user: updatedUser }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API PUT /api/admin/users/${targetUserId} (Prisma) FAILED ---`, error);
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({ message: 'User not found for update.' }, { status: 404 });
        }
        return NextResponse.json({ message: error.message || 'Failed to update user.' }, { status: 500 });
    }
}
