// src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';
// Corrected import: Use adminDb from firebase-admin for backend operations
import { adminDb } from '@/lib/firebase-admin';

// --- Zod Schema for validation ---
const registerApiSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  phoneNumber: z.string()
                  .min(10, "Phone number seems too short")
                  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +1234567890)"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // --- Validate Input ---
    const validationResult = registerApiSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors;
      console.error("Registration Validation Failed:", errors);
      return NextResponse.json({ message: 'Invalid input', errors }, { status: 400 });
    }

    const { name, email, phoneNumber, password } = validationResult.data;
    // Now using the Firestore instance from the Admin SDK
    const usersCollection = adminDb.collection('users');

    // --- Check for Existing Email ---
    const emailQuery = usersCollection.where('email', '==', email).limit(1);
    const emailSnapshot = await emailQuery.get();
    if (!emailSnapshot.empty) {
        console.warn(`Registration attempt with existing email: ${email}`);
        return NextResponse.json({ message: 'Email address is already registered.' }, { status: 409 });
    }

    // --- Check for Existing Phone Number ---
    const phoneQuery = usersCollection.where('phoneNumber', '==', phoneNumber).limit(1);
    const phoneSnapshot = await phoneQuery.get();
    if (!phoneSnapshot.empty) {
        console.warn(`Registration attempt with existing phone number: ${phoneNumber}`);
        return NextResponse.json({ message: 'Phone number is already registered.' }, { status: 409 });
    }

    // --- Hash Password ---
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // --- Create User Document in Firestore ---
    const userId = uuidv4(); // Generate a unique ID for the document
    const newUserRef = usersCollection.doc(userId);

    const newUser = {
        id: userId, // Store the ID within the document as well
        name,
        email,
        phoneNumber,
        password: hashedPassword, // Store the hashed password
        phoneVerified: true, // Phone is verified via OTP flow
        emailVerified: null, // Or false, depending on your flow
        createdAt: new Date().toISOString(), // Use ISO string for Firestore timestamp consistency
        kycVerified: false, // <-- Added this field
        // Add any other default fields
    };

    await newUserRef.set(newUser);
    console.log(`User document created in Firestore for: ${email} / ${phoneNumber} with ID: ${userId}`);

    // --- Prepare Response (exclude password) ---
    const { password: _, ...userResponse } = newUser;

    return NextResponse.json({ message: 'User registered successfully.', user: userResponse }, { status: 201 });

  } catch (error: any) {
    console.error('Registration API Error:', error);
    // Log Firestore specific errors if possible
    if (error.code) {
        console.error(`Firestore Error Code: ${error.code}, Message: ${error.message}`);
    }
    return NextResponse.json({ message: 'An unexpected error occurred during registration.' }, { status: 500 });
  }
}
