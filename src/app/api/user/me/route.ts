// src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // adminDb can be null!
import { UserProfile } from '@/lib/types'; 
import { FieldValue, Timestamp } from 'firebase-admin/firestore'; // Keep Timestamp for FieldValue.serverTimestamp()
import { differenceInDays, parseISO } from 'date-fns'; // Import parseISO
import * as z from 'zod';

// Helper function to safely convert Firestore Timestamps
const safeTimestampToString = (timestamp: any): string | null => {
    // Check for Firestore Admin Timestamp
    if (timestamp instanceof Timestamp) { 
        try { return timestamp.toDate().toISOString(); } catch { return null; }
    }
    // Check for JS Date object
    if (timestamp instanceof Date) {
         try { return timestamp.toISOString(); } catch { return null; }
    }
     // Check if it's already a valid ISO string
    if (typeof timestamp === 'string') {
         try {
             if (new Date(timestamp).toISOString() === timestamp) return timestamp;
         } catch { /* ignore */ }
    }
    return null;
};

// --- GET Handler ---
export async function GET(req: Request) {
  try {
    if (!adminDb) {
        console.error("API /user/me GET Error: Firebase Admin DB is not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
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
        if (!adminDb) {
            console.error("API /user/me PATCH Error: Firebase Admin DB is not initialized.");
            return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
        }

        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("API PATCH /user/me: Unauthorized.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`API PATCH /user/me: Authenticated as user ${userId}`);
        const userRef = adminDb.collection('users').doc(userId);

        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             console.warn(`API PATCH /user/me: User profile not found for ID: ${userId}`);
             return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
        }
        // Fetch raw data; conversion to string happens before sending response
        const currentRawData = userDoc.data(); 
        if (!currentRawData) {
             console.warn(`API PATCH /user/me: User profile data is empty for ID: ${userId}`);
             return NextResponse.json({ message: 'User profile data unavailable' }, { status: 404 });
        }
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
        if (validatedData.name !== undefined && validatedData.name !== (currentRawData.name || currentRawData.username)) {
             console.log(`API PATCH /user/me: Processing name change from "${currentRawData.name || currentRawData.username}" to "${validatedData.name}"`);
             const lastUpdateFieldRaw = currentRawData.nameLastUpdatedAt || currentRawData.usernameLastUpdatedAt; // Get raw timestamp (Admin Timestamp or null/undefined)
             
             // --- FIX: Cooldown check based on Admin Timestamp --- 
             let lastUpdateDate: Date | null = null;
             if (lastUpdateFieldRaw instanceof Timestamp) { // Check if it's an Admin Timestamp
                  try { lastUpdateDate = lastUpdateFieldRaw.toDate(); } catch {} 
             }
             // --- End FIX ---

             if (lastUpdateDate && differenceInDays(now, lastUpdateDate) < sixtyDays) {
                 console.warn(`API PATCH /user/me: Name change blocked due to cooldown.`);
                 return NextResponse.json({ message: `Name can only be changed every ${sixtyDays} days.` }, { status: 400 });
             }
             updateData.name = validatedData.name;
             updateData.nameLastUpdatedAt = serverTimestamp;
             changesMade = true;
             console.log("API PATCH /user/me: Name update added to payload.");
        }

        // Check Location
        if (validatedData.location !== undefined && validatedData.location !== (currentRawData.location ?? "")) { 
            console.log(`API PATCH /user/me: Processing location change from "${currentRawData.location}" to "${validatedData.location}"`);
            updateData.location = validatedData.location;
            changesMade = true;
             console.log("API PATCH /user/me: Location update added to payload.");
        }

        // Check Mpesa Number
        if (validatedData.mpesaPhoneNumber !== undefined && validatedData.mpesaPhoneNumber !== (currentRawData.mpesaPhoneNumber ?? "")) { 
            console.log(`API PATCH /user/me: Processing Mpesa number change.`);
             updateData.mpesaPhoneNumber = validatedData.mpesaPhoneNumber;
            changesMade = true;
            console.log("API PATCH /user/me: Mpesa number update added to payload.");
        }

        // Check Profile Picture URL
        if (validatedData.profilePictureUrl !== undefined && validatedData.profilePictureUrl !== (currentRawData.profilePictureUrl ?? null)) {
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
            const updatedRawData = updatedDoc.data();

            // Convert timestamps to strings for the response
            const responseData = {
                 id: userId,
                 name: updatedRawData?.name || updatedRawData?.username || null,
                 email: updatedRawData?.email || null,
                 phoneNumber: updatedRawData?.phoneNumber || null,
                 location: updatedRawData?.location || null,
                 profilePictureUrl: updatedRawData?.profilePictureUrl || null,
                 mpesaPhoneNumber: updatedRawData?.mpesaPhoneNumber || null,
                 createdAt: safeTimestampToString(updatedRawData?.createdAt),
                 updatedAt: safeTimestampToString(updatedRawData?.updatedAt),
                 nameLastUpdatedAt: safeTimestampToString(updatedRawData?.nameLastUpdatedAt || updatedRawData?.usernameLastUpdatedAt),
                 locationLastUpdatedAt: safeTimestampToString(updatedRawData?.locationLastUpdatedAt),
                 mpesaLastUpdatedAt: safeTimestampToString(updatedRawData?.mpesaLastUpdatedAt),
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
