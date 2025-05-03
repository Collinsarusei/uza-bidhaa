// src/app/api/user/me/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
// Assuming you have your NextAuth options exported from your [...nextauth] route
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin'; // Import Firebase Admin SDK instance

export async function GET(req: Request) {
  try {
    // --- Get Authenticated User Session (Server-Side) ---
    // This is the secure way to get the session in an API route
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      console.warn("API /user/me: Unauthorized access attempt.");
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`API /user/me: Fetching profile for user ID: ${userId}`);

    // --- Fetch User Document from Firestore ---
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
       console.error(`API /user/me: User document not found for ID: ${userId}`);
      return NextResponse.json({ message: 'User profile not found' }, { status: 404 });
    }

    // --- Prepare Response Data ---
    const userData = userDoc.data();
    // Exclude sensitive information like password hash
    const { password, ...userProfile } = userData || {}; // Use empty object fallback

    console.log(`API /user/me: Profile data found for user ID: ${userId}`);
    return NextResponse.json({ user: userProfile }, { status: 200 });

  } catch (error: any) {
    console.error('API /user/me Error:', error);
    return NextResponse.json({ message: 'Failed to fetch user profile', error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
