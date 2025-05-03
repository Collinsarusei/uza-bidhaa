// src/lib/firebase-admin.ts

import admin from 'firebase-admin';

// --- Ensure environment variables are loaded and available ---
// These checks are crucial for diagnosing setup issues early.
if (!process.env.FIREBASE_PROJECT_ID) {
    console.error("ERROR: FIREBASE_PROJECT_ID environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PROJECT_ID');
}
if (!process.env.FIREBASE_CLIENT_EMAIL) {
    console.error("ERROR: FIREBASE_CLIENT_EMAIL environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_CLIENT_EMAIL');
}
if (!process.env.FIREBASE_PRIVATE_KEY) {
    console.error("ERROR: FIREBASE_PRIVATE_KEY environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PRIVATE_KEY');
}

// --- Format the private key correctly ---
// The value read from .env.local will have literal "\\n" characters.
// Firebase Admin SDK requires actual newline characters.
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

// --- Construct the Service Account object ---
// This object is used by the Admin SDK to authenticate.
const serviceAccount: admin.ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
};

// --- Initialize Firebase Admin SDK (if not already initialized) ---
// The `!admin.apps.length` check prevents re-initialization during hot-reloads in development,
// which would otherwise cause errors.
if (!admin.apps.length) {
    try {
        // Initialize the app using the constructed service account credentials
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Optional: If using Firebase Realtime Database, uncomment and set the URL
            // databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
        });
        // Log success only if initialization happens
        console.log('Firebase Admin SDK Initialized Successfully.');
    } catch (error: any) {
        // Log any errors during initialization
        console.error('Firebase Admin SDK Initialization Error:', error.message);
        // Depending on how critical Firebase Admin is at startup, you might:
        // - Rethrow the error: throw error; (halts the application/build)
        // - Log and continue: Allow other parts of the app to potentially run
    }
} else {
    // Optional: Log if already initialized (useful for debugging hot reloads)
    // console.log('Firebase Admin SDK already initialized.');
}

// --- Export the initialized Firebase Admin services ---
// These can be imported and used in your server-side code (API routes, server components, etc.)
export const adminAuth = admin.auth(); // For user management (tokens, etc.)
export const adminDb = admin.firestore(); // For database operations (Firestore)
// export const adminStorage = admin.storage(); // Uncomment if using Firebase Storage via Admin SDK