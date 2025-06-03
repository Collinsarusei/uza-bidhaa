// src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { differenceInDays, parseISO } from 'date-fns';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Helper function to select user fields for API response (excluding sensitive data)
const userProfileSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true,
    location: true,
    image: true, // Maps to profilePictureUrl
    mpesaPhoneNumber: true,
    createdAt: true,
    updatedAt: true,
    nameLastUpdatedAt: true,
    // Add other fields like locationLastUpdatedAt, mpesaLastUpdatedAt if they exist and are needed
    kycVerified: true,
    phoneVerified: true,
    role: true,
    status: true,
    availableBalance: true, // Depending on if you want to show this in a general /me response
};

// --- GET Handler ---
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
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
      },
    });

    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user }, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { message: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

// --- PATCH Handler ---
const profileUpdateSchema = z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    location: z.string().optional().nullable(), // Allow explicit null to clear
    mpesaPhoneNumber: z.string().optional().nullable(), // Allow explicit null to clear
    image: z.string().url("Invalid profile picture URL").optional().nullable(), // Maps to profilePictureUrl
}).strict();

export async function PATCH(req: Request) {
    console.log("--- API PATCH /api/user/me (Prisma) START ---");
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API PATCH /user/me: Authenticated as user ${userId}`);

        const currentUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser) {
             return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
        }

        let body;
        try { body = await req.json(); }
        catch (parseError) { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }

        const validationResult = profileUpdateSchema.safeParse(body);
        if (!validationResult.success) {
             return NextResponse.json({ message: 'Invalid input data.', errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
        }
        const validatedData = validationResult.data;
        const updateData: {
            name?: string;
            nameLastUpdatedAt?: Date;
            location?: string | null;
            mpesaPhoneNumber?: string | null;
            image?: string | null;
        } = {};
        let changesMade = false;
        const now = new Date();
        const sixtyDays = 60; 

        // Check Name update & cooldown
        if (validatedData.name !== undefined && validatedData.name !== currentUser.name) {
             if (currentUser.nameLastUpdatedAt && differenceInDays(now, currentUser.nameLastUpdatedAt) < sixtyDays) {
                 return NextResponse.json({ message: `Name can only be changed every ${sixtyDays} days.` }, { status: 400 });
             }
             updateData.name = validatedData.name;
             updateData.nameLastUpdatedAt = now;
             changesMade = true;
        }

        // Check Location update
        if (validatedData.location !== undefined && validatedData.location !== currentUser.location) {
            updateData.location = validatedData.location;
            // If location had a cooldown: updateData.locationLastUpdatedAt = now;
            changesMade = true;
        }

        // Check Mpesa Number update
        if (validatedData.mpesaPhoneNumber !== undefined && validatedData.mpesaPhoneNumber !== currentUser.mpesaPhoneNumber) { 
            updateData.mpesaPhoneNumber = validatedData.mpesaPhoneNumber;
            // If mpesa had a cooldown: updateData.mpesaLastUpdatedAt = now;
            changesMade = true;
        }

        // Check Profile Picture URL update (maps to 'image' field in Prisma User model)
        if (validatedData.image !== undefined && validatedData.image !== currentUser.image) {
            updateData.image = validatedData.image;
            changesMade = true;
        }

        if (changesMade) {
            // updatedAt is automatically handled by Prisma @updatedAt directive
            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: updateData,
                select: userProfileSelect // Use the predefined select for consistent response
            });

            // Create notification for profile update
            await createNotification({
                userId: userId,
                type: 'profile_update',
                message: 'Your profile has been updated successfully.',
            });

            console.log("--- API PATCH /user/me (Prisma) SUCCESS: Profile updated ---");
            return NextResponse.json({ message: 'Profile updated successfully', user: updatedUser }, { status: 200 });
        } else {
            console.log("API PATCH /user/me: No changes detected.");
            const userToReturn = await prisma.user.findUnique({where: {id: userId}, select: userProfileSelect });
            return NextResponse.json({ message: 'No changes detected', user: userToReturn }, { status: 200 });
        }

    } catch (error: any) {
        console.error("--- API PATCH /user/me (Prisma) FAILED --- Error:", error);
        if (error instanceof PrismaClientKnownRequestError) {
            // Handle specific Prisma errors if needed
            if (error.code === 'P2002' && error.meta?.target === 'User_mpesaPhoneNumber_key') { // Example for unique constraint on mpesaPhoneNumber
                return NextResponse.json({ message: 'M-Pesa phone number is already in use.' }, { status: 409 });
            }
        }
        return NextResponse.json({ message: 'Failed to update profile', error: error.message }, { status: 500 });
    }
}
