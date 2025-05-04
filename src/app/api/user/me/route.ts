// src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { UserProfile } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';

// --- GET Handler --- 
export async function GET(req: Request) {
  try {
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
    
    const safeTimestampToString = (timestamp: any): string | null => {
        if (timestamp && typeof timestamp.toDate === 'function') {
            return timestamp.toDate().toISOString();
        }
        return null;
    };

    // Define a type for the data structure being returned in the API response
    type ApiResponseProfileData = {
        id: string;
        username: string | null;
        email: string | null;
        phoneNumber: string | null;
        location: string | null;
        profilePictureUrl: string | null;
        mpesaPhoneNumber: string | null;
        createdAt: string | null; // Timestamps as strings
        updatedAt: string | null;
        usernameLastUpdatedAt: string | null;
        locationLastUpdatedAt: string | null;
        mpesaLastUpdatedAt: string | null;
    };

    // Assign data to the response type
    const profileData: ApiResponseProfileData = {
        id: userId,
        username: userData.username || null,
        email: userData.email || null,
        phoneNumber: userData.phoneNumber || null,
        location: userData.location || null,
        profilePictureUrl: userData.profilePictureUrl || null,
        mpesaPhoneNumber: userData.mpesaPhoneNumber || null,
        // Assign the converted string | null values
        createdAt: safeTimestampToString(userData.createdAt),
        updatedAt: safeTimestampToString(userData.updatedAt),
        usernameLastUpdatedAt: safeTimestampToString(userData.usernameLastUpdatedAt),
        locationLastUpdatedAt: safeTimestampToString(userData.locationLastUpdatedAt),
        mpesaLastUpdatedAt: safeTimestampToString(userData.mpesaLastUpdatedAt),
    };

    return NextResponse.json({ user: profileData }, { status: 200 });

  } catch (error: any) {
    console.error("API /user/me GET Error:", error);
    return NextResponse.json({ message: 'Failed to fetch user profile', error: error.message }, { status: 500 });
  }
}

// --- PUT Handler --- 
export async function PUT(req: Request) {
    try {
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
        const currentData = userDoc.data() as UserProfile;

        const body = await req.json();
        const { username, location, mpesaPhoneNumber } = body;

        // Validation
        if (typeof username !== 'string' || !username.trim()) return NextResponse.json({ message: 'Username cannot be empty' }, { status: 400 });
        if (typeof mpesaPhoneNumber !== 'string' || !mpesaPhoneNumber.trim()) return NextResponse.json({ message: 'M-Pesa number cannot be empty' }, { status: 400 });
        if (typeof location !== 'string') return NextResponse.json({ message: 'Invalid location format' }, { status: 400 });

        // Cooldown Checks
        const now = new Date();
        const sixtyDays = 60;
        const serverTimestamp = FieldValue.serverTimestamp();
        const updateData: { [key: string]: any } = { updatedAt: serverTimestamp };
        let changesMade = false;

        // Check Username
        if (username.trim() !== currentData.username) {
             const lastUpdate = currentData.usernameLastUpdatedAt instanceof Timestamp ? currentData.usernameLastUpdatedAt.toDate() : null;
            if (lastUpdate && differenceInDays(now, lastUpdate) < sixtyDays) return NextResponse.json({ message: `Username can only be changed every ${sixtyDays} days.` }, { status: 400 });
             updateData.username = username.trim(); updateData.usernameLastUpdatedAt = serverTimestamp; changesMade = true;
        }
        // Check Location
        if (location.trim() !== currentData.location) {
            const lastUpdate = currentData.locationLastUpdatedAt instanceof Timestamp ? currentData.locationLastUpdatedAt.toDate() : null;
             if (lastUpdate && differenceInDays(now, lastUpdate) < sixtyDays) return NextResponse.json({ message: `Location can only be changed every ${sixtyDays} days.` }, { status: 400 });
            updateData.location = location.trim(); updateData.locationLastUpdatedAt = serverTimestamp; changesMade = true;
        }
        // Check Mpesa Number
        if (mpesaPhoneNumber.trim() !== currentData.mpesaPhoneNumber) {
            const lastUpdate = currentData.mpesaLastUpdatedAt instanceof Timestamp ? currentData.mpesaLastUpdatedAt.toDate() : null;
            if (lastUpdate && differenceInDays(now, lastUpdate) < sixtyDays) return NextResponse.json({ message: `M-Pesa number can only be changed every ${sixtyDays} days.` }, { status: 400 });
             updateData.mpesaPhoneNumber = mpesaPhoneNumber.trim(); updateData.mpesaLastUpdatedAt = serverTimestamp; changesMade = true;
        }

        // Update Firestore
        if (changesMade) {
             await userRef.update(updateData);
             // --- Prepare response data including potentially new timestamps ---
             // Fetch the updated doc to get accurate server timestamps
             const updatedDoc = await userRef.get();
             const updatedUserData = updatedDoc.data();

             // Convert timestamps to strings for the response
             const safeTimestampToString = (timestamp: any): string | null => {
                 if (timestamp && typeof timestamp.toDate === 'function') {
                     return timestamp.toDate().toISOString();
                 }
                 return null;
             };

             const responseData = {
                 id: userId,
                 username: updatedUserData?.username || null,
                 email: updatedUserData?.email || null,
                 phoneNumber: updatedUserData?.phoneNumber || null,
                 location: updatedUserData?.location || null,
                 profilePictureUrl: updatedUserData?.profilePictureUrl || null,
                 mpesaPhoneNumber: updatedUserData?.mpesaPhoneNumber || null,
                 createdAt: safeTimestampToString(updatedUserData?.createdAt),
                 updatedAt: safeTimestampToString(updatedUserData?.updatedAt),
                 usernameLastUpdatedAt: safeTimestampToString(updatedUserData?.usernameLastUpdatedAt),
                 locationLastUpdatedAt: safeTimestampToString(updatedUserData?.locationLastUpdatedAt),
                 mpesaLastUpdatedAt: safeTimestampToString(updatedUserData?.mpesaLastUpdatedAt),
             };

             return NextResponse.json({ message: 'Profile updated successfully', user: responseData }, { status: 200 });
        } else {
             return NextResponse.json({ message: 'No changes detected' }, { status: 200 });
        }

    } catch (error: any) {
        console.error("API /user/me PUT Error:", error);
        return NextResponse.json({ message: 'Failed to update profile', error: error.message }, { status: 500 });
    }
}
