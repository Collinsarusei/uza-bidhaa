// src/app/api/admin/users/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { UserProfile } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const adminUserEmail = process.env.ADMIN_EMAIL;
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    return !!userId; // Fallback, NOT SECURE for production
}

const safeTimestampToString = (timestamp: any): string | null => {
    if (timestamp instanceof Timestamp) {
        try { return timestamp.toDate().toISOString(); } catch { return null; }
    }
    if (timestamp instanceof Date) {
         try { return timestamp.toISOString(); } catch { return null; }
    }
    if (typeof timestamp === 'string') {
         try {
             if (new Date(timestamp).toISOString() === timestamp) return timestamp;
         } catch { /* ignore */ }
    }
    return null;
};


export async function GET() {
    console.log("--- API GET /api/admin/users START ---");

    if (!adminDb) {
        console.error("API Admin Users GET Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn("API Admin Users GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const usersRef = adminDb.collection('users');
        const snapshot = await usersRef.orderBy('createdAt', 'desc').get();

        const users: Partial<UserProfile>[] = []; // Return partial to exclude sensitive fields like password
        snapshot.forEach(doc => {
            const data = doc.data() as UserProfile;
            users.push({
                id: doc.id,
                name: data.name,
                email: data.email,
                phoneNumber: data.phoneNumber,
                createdAt: safeTimestampToString(data.createdAt),
                isSuspended: data.isSuspended ?? false,
                location: data.location,
            });
        });

        console.log(`API Admin Users GET: Found ${users.length} users.`);
        return NextResponse.json(users, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/users FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch users', error: error.message }, { status: 500 });
    }
}
