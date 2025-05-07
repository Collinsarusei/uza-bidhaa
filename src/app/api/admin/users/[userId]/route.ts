// src/app/api/admin/users/[userId]/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { UserProfile } from '@/lib/types';
import * as z from 'zod';

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const adminUserEmail = process.env.ADMIN_EMAIL;
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    return !!userId; // Fallback, NOT SECURE for production
}

interface RouteContext {
    params: {
      userId?: string; // User ID from the route parameter
    };
}

const userUpdateSchema = z.object({
    isSuspended: z.boolean(),
});

export async function PATCH(req: Request, context: RouteContext) {
    const targetUserId = context.params?.userId;
    console.log(`--- API PATCH /api/admin/users/${targetUserId} START ---`);

    if (!targetUserId) {
        return NextResponse.json({ message: 'Missing user ID' }, { status: 400 });
    }
    if (!adminDb) {
        console.error(`Admin User Update ${targetUserId}: Firebase Admin DB not initialized.`);
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn(`Admin User Update ${targetUserId}: Unauthorized attempt by user ${session?.user?.id}.`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = session?.user?.id;
    console.log(`Admin User Update ${targetUserId}: Authenticated admin action by ${adminUserId}.`);

    if (targetUserId === adminUserId) {
        console.warn(`Admin User Update ${targetUserId}: Admin cannot modify their own suspension status.`);
        return NextResponse.json({ message: 'Admin cannot modify their own suspension status.' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const validation = userUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { isSuspended } = validation.data;

        const userRef = adminDb.collection('users').doc(targetUserId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        await userRef.update({
            isSuspended: isSuspended,
            updatedAt: FieldValue.serverTimestamp(),
        });
        
        const updatedUserDoc = await userRef.get();
        const updatedUserData = updatedUserDoc.data() as UserProfile;
        // Exclude sensitive data for response
        const { password, ...userResponse } = updatedUserData;


        console.log(`Admin User Update: User ${targetUserId} suspension status set to ${isSuspended}.`);
        return NextResponse.json({ message: `User ${isSuspended ? 'suspended' : 'reactivated'} successfully.`, user: userResponse }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API PATCH /api/admin/users/${targetUserId} FAILED --- Error:`, error);
        return NextResponse.json({ message: error.message || 'Failed to update user status.' }, { status: 500 });
    }
}
