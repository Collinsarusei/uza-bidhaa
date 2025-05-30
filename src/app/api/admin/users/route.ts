// src/app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Define the structure for the admin user list response
interface AdminUserListItem {
    id: string;
    name: string | null;
    email: string | null;
    phoneNumber: string | null;
    createdAt: Date | string;
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    location: string | null;
    role: 'USER' | 'ADMIN';
    kycVerified: boolean;
    phoneVerified: boolean;
}

export async function GET(request: Request) {
    console.log("--- API GET /api/admin/users (Prisma) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn("API Admin Users GET: Unauthorized or non-admin attempt.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    console.log(`API Admin Users GET: Authorized admin ${session.user.id} fetching users.`);

    try {
        const usersFromDb = await prisma.user.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            select: { // Select specific fields to return to the admin
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                createdAt: true,
                status: true,     // UserStatus enum (ACTIVE, SUSPENDED, BANNED)
                location: true,
                role: true,       // UserRole enum (USER, ADMIN)
                image: true,     // Profile picture
                kycVerified: true,
                phoneVerified: true,
                mpesaPhoneNumber: true,
                // Exclude sensitive fields like 'password'
                // Include other fields as necessary for admin view
                _count: { // Example: if you want to show how many items a user has
                    select: { items: true }
                }
            }
        });

        // Transform if needed, though direct selection is often good enough.
        // The main transformation is that Date objects will become ISO strings in the JSON response.
        const users: AdminUserListItem[] = usersFromDb.map((user: any) => ({
            ...user,
            isSuspended: user.status === 'SUSPENDED',
        })) as AdminUserListItem[];

        console.log(`API Admin Users GET: Found ${users.length} users.`);
        return NextResponse.json(users, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/users (Prisma) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to fetch users', error: error.message }, { status: 500 });
    }
}
