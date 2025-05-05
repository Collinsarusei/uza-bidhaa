// src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null!
import { UserProfile } from '@/lib/types'; 
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';
import * as z from 'zod';

// Helper function to safely convert Firestore Timestamps
const safeTimestampToString = (timestamp: any): string | null => {
    if (timestamp instanceof Timestamp) { 
        return timestamp.toDate().toISOString();
    }
    if (timestamp instanceof Date) {
         return timestamp.toISOString();
    }
    if (typeof timestamp === 'string') {
         if (new Date(timestamp).toISOString() === timestamp) {
            return timestamp;
         }
    }
    return null;
};

// --- GET Handler ---
export async function GET(req: Request) {
  try {
    // --- Add Null Check for adminDb --- 
    if (!adminDb) {
        console.error("API /user/me GET Error: Firebase Admin DB is not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    // --- End Null Check ---

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    // Now safe to use adminDb
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
    }
    const userData = userDoc.data();
    if (!userData) {
        return NextResponse.json({ message: 'User profile data is empty' }, { status: 404 });
    }

    type ApiResponseProfileData = {
        id: string;
        name: string | null; 
        email: string | null;
        phoneNumber: string | null;
        location: string | null;
        profilePictureUrl: string | null;
        mpesaPhoneNumber: string | null;
        createdAt: string | null;
        updatedAt: string | null;
        nameLastUpdatedAt?: string | null; 
        locationLastUpdatedAt?: string | null;
        mpesaLastUpdatedAt?: string | null;
    };

    const profileData: ApiResponseProfileData = {
        id: userId,
        name: userData.name || userData.username || null, 
        email: userData.email || null,
        phoneNumber: userData.phoneNumber || null,
        location: userData.location || null,
        profilePictureUrl: userData.profilePictureUrl || null,
        mpesaPhoneNumber: userData.mpesaPhoneNumber || null,
        createdAt: safeTimestampToString(userData.createdAt),
        updatedAt: safeTimestampToString(userData.updatedAt),
        nameLastUpdatedAt: safeTimestampToString(userData.nameLastUpdatedAt || userData.usernameLastUpdatedAt),
        locationLastUpdatedAt: safeTimestampToString(userData.locationLastUpdatedAt),
        mpesaLastUpdatedAt: safeTimestampToString(userData.mpesaLastUpdatedAt),
    };

    return NextResponse.json({ user: profileData }, { status: 200 });

  } catch (error: any) {
    console.error("API /user/me GET Error:", error);
    return NextResponse.json({ message: 'Failed to fetch user profile', error: error.message }, { status: 500 });
  }
}


// --- PATCH Handler ---
const profileUpdateSchema = z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    location: z.string().optional(), 
    mpesaPhoneNumber: z.string().optional(), 
    profilePictureUrl: z.string().url("Invalid profile picture URL").optional(),
}).strict();


export async function PATCH(req: Request) {
    console.log("--- API /user/me PATCH START ---");
    try {
        // --- Add Null Check for adminDb --- 
        if (!adminDb) {
            console.error("API /user/me PATCH Error: Firebase Admin DB is not initialized.");
            return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
        }
        // --- End Null Check ---

        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("API PATCH /user/me: Unauthorized.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API PATCH /user/me: Authenticated as user ${userId}`);
        // Now safe to use adminDb
        const userRef = adminDb.collection('users').doc(userId);

        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             console.warn(`API PATCH /user/me: User profile not found for ID: ${userId}`);
             return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
        }
        const currentData = userDoc.data() as UserProfile;
        console.log("API PATCH /user/me: Current user data fetched.");

        let body;
        try {
            body = await req.json();
             console.log("API PATCH /user/me: Request body received:", body);
        } catch (parseError) {
            console.error("API PATCH /user/me: Error parsing request body:", parseError);
            return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 });
        }

        const validationResult = profileUpdateSchema.safeParse(body);
        if (!validationResult.success) {
             console.warn("API PATCH /user/me: Validation failed.", validationResult.error.errors);
             return NextResponse.json({ message: 'Invalid input data.', errors: validationResult.error.flatten().fieldErrors }, { status: 400 });
        }
        const validatedData = validationResult.data;
         console.log("API PATCH /user/me: Validation successful:", validatedData);

        const now = new Date();
        const sixtyDays = 60; 
        const serverTimestamp = FieldValue.serverTimestamp(); 
        const updateData: { [key: string]: any } = {}; 
        let changesMade = false;

        // Check Name 
        if (validatedData.name !== undefined && validatedData.name !== (currentData.name || currentData.username)) {
             console.log(`API PATCH /user/me: Processing name change from "${currentData.name || currentData.username}" to "${validatedData.name}"`);
             const lastUpdateField = currentData.usernameLastUpdatedAt || currentData.usernameLastUpdatedAt;
             const lastUpdate = lastUpdateField instanceof Timestamp ? lastUpdateField.toDate() : null;
            if (lastUpdate && differenceInDays(now, lastUpdate) < sixtyDays) {
                 console.warn(`API PATCH /user/me: Name change blocked due to cooldown.`);
                 return NextResponse.json({ message: `Name can only be changed every ${sixtyDays} days.` }, { status: 400 });
            }
             updateData.name = validatedData.name;
             updateData.nameLastUpdatedAt = serverTimestamp;
             changesMade = true;
             console.log("API PATCH /user/me: Name update added to payload.");
        }

        // Check Location
        if (validatedData.location !== undefined && validatedData.location !== (currentData.location ?? "")) { 
            console.log(`API PATCH /user/me: Processing location change from "${currentData.location}" to "${validatedData.location}"`);
            updateData.location = validatedData.location;
            changesMade = true;
             console.log("API PATCH /user/me: Location update added to payload.");
        }

        // Check Mpesa Number
        if (validatedData.mpesaPhoneNumber !== undefined && validatedData.mpesaPhoneNumber !== (currentData.mpesaPhoneNumber ?? "")) { 
            console.log(`API PATCH /user/me: Processing Mpesa number change.`);
             updateData.mpesaPhoneNumber = validatedData.mpesaPhoneNumber;
            changesMade = true;
            console.log("API PATCH /user/me: Mpesa number update added to payload.");
        }

        // Check Profile Picture URL
        if (validatedData.profilePictureUrl !== undefined && validatedData.profilePictureUrl !== (currentData.profilePictureUrl ?? null)) {
             console.log(`API PATCH /user/me: Processing profile picture update.`);
            updateData.profilePictureUrl = validatedData.profilePictureUrl;
            changesMade = true;
             console.log("API PATCH /user/me: Profile picture update added to payload.");
        }

        if (changesMade) {
            console.log("API PATCH /user/me: Changes detected. Updating Firestore...");
            updateData.updatedAt = serverTimestamp;
            await userRef.update(updateData);
            console.log("API PATCH /user/me: Firestore updated successfully.");

            const updatedDoc = await userRef.get();
            const updatedUserData = updatedDoc.data();

            const responseData = {
                 id: userId,
                 name: updatedUserData?.name || updatedUserData?.username || null,
                 email: updatedUserData?.email || null,
                 phoneNumber: updatedUserData?.phoneNumber || null,
                 location: updatedUserData?.location || null,
                 profilePictureUrl: updatedUserData?.profilePictureUrl || null,
                 mpesaPhoneNumber: updatedUserData?.mpesaPhoneNumber || null,
                 createdAt: safeTimestampToString(updatedUserData?.createdAt),
                 updatedAt: safeTimestampToString(updatedUserData?.updatedAt),
                 nameLastUpdatedAt: safeTimestampToString(updatedUserData?.nameLastUpdatedAt || updatedUserData?.usernameLastUpdatedAt),
                 locationLastUpdatedAt: safeTimestampToString(updatedUserData?.locationLastUpdatedAt),
                 mpesaLastUpdatedAt: safeTimestampToString(updatedUserData?.mpesaLastUpdatedAt),
            };

            console.log("--- API /user/me PATCH SUCCESS ---");
            return NextResponse.json({ message: 'Profile updated successfully', user: responseData }, { status: 200 });
        } else {
             console.log("API PATCH /user/me: No changes detected.");
            return NextResponse.json({ message: 'No changes detected' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("--- API /user/me PATCH FAILED --- Error:", error);
        if (error instanceof z.ZodError) {
           return NextResponse.json({ message: 'Invalid input data.', errors: error.errors }, { status: 400 });
        }
        return NextResponse.json({ message: 'Failed to update profile', error: error.message }, { status: 500 });
    }
}
