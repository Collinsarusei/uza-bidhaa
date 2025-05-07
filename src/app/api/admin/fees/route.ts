// src/app/api/admin/fees/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import * as z from 'zod';
import type { PlatformSettings } from '@/lib/types';

const SETTINGS_COLLECTION = 'settings';
const PLATFORM_FEE_DOC_ID = 'platformFee';
const DEFAULT_FEE_PERCENTAGE = 10; // Default to 10% if not set

const feeUpdateSchema = z.object({
    feePercentage: z.number().min(0, "Fee cannot be negative").max(100, "Fee cannot exceed 100%"),
});

// IMPORTANT: In a real application, you MUST protect this endpoint to ensure only admins can access it.
// This could involve checking a custom claim on the user's session token,
// or checking against a list of admin user IDs in Firestore.
// For brevity, this example omits full admin role checking.
async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    // Placeholder: In a real app, check user's role from Firestore or custom claims.
    // For now, let's assume the first registered user or a specific email is admin.
    // This is NOT secure for production.
    const adminUserEmail = process.env.ADMIN_EMAIL; // Example: Set an ADMIN_EMAIL in .env
    if (adminUserEmail) {
        const session = await getServerSession(authOptions);
        return session?.user?.email === adminUserEmail;
    }
    // Fallback: allow any authenticated user for demo purposes if no admin email is set.
    // THIS IS NOT SECURE.
    return !!userId; 
}


export async function GET() {
    console.log("--- API GET /api/admin/fees START ---");

    if (!adminDb) {
        console.error("API Admin Fees GET Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!(await isAdmin(session?.user?.id))) {
        console.warn("API Admin Fees GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const feeDocRef = adminDb!.collection(SETTINGS_COLLECTION).doc(PLATFORM_FEE_DOC_ID);
        const docSnap = await feeDocRef.get();

        if (!docSnap.exists) {
            console.log(`API Admin Fees GET: Platform fee not set, returning default: ${DEFAULT_FEE_PERCENTAGE}%`);
            return NextResponse.json({ feePercentage: DEFAULT_FEE_PERCENTAGE }, { status: 200 });
        }

        const feeData = docSnap.data() as PlatformSettings;
        console.log("API Admin Fees GET: Fetched fee:", feeData);
        return NextResponse.json({ feePercentage: feeData.feePercentage ?? DEFAULT_FEE_PERCENTAGE }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/fees FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to fetch fee settings', error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    console.log("--- API POST /api/admin/fees START ---");

    if (!adminDb) {
        console.error("API Admin Fees POST Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
     if (!(await isAdmin(session?.user?.id))) {
        console.warn("API Admin Fees POST: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = feeUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }

        const { feePercentage } = validation.data;

        const feeDocRef = adminDb!.collection(SETTINGS_COLLECTION).doc(PLATFORM_FEE_DOC_ID);
        
        // Corrected type definition for settingsUpdate
        const settingsUpdate: {
            feePercentage: number;
            updatedAt: FieldValue;
            totalPlatformFees?: FieldValue; // If this field is sometimes updated here
        } = {
            feePercentage: feePercentage,
            updatedAt: FieldValue.serverTimestamp(),
        };

        await feeDocRef.set(settingsUpdate, { merge: true }); // Use set with merge to create if not exists

        console.log(`API Admin Fees POST: Platform fee updated to ${feePercentage}%`);
        return NextResponse.json({ message: 'Platform fee updated successfully.', feePercentage }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/admin/fees FAILED --- Error:", error);
        return NextResponse.json({ message: 'Failed to update fee settings', error: error.message }, { status: 500 });
    }
}
