// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// --- Environment Variable Check ---
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

// Validate that all required variables are present
if (!projectId || !clientEmail || !rawPrivateKey) {
    console.error('Missing Firebase Admin SDK configuration environment variables!');
    console.error('Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in your environment.');
    throw new Error('Firebase Admin SDK configuration is incomplete.');
}

let app;

// Check if Firebase Admin has already been initialized
if (!getApps().length) {
    try {
        // Process the private key
        const privateKey = rawPrivateKey
        .replace(/\\n/g, '\n')
            .replace(/^"|"$/g, '')
            .trim();

        // Initialize Firebase Admin
        app = initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
        // console.log('Firebase Admin SDK Initialized Successfully.'); // Optional: keep for initial successful deployment check
    } catch (error: any) {
        console.error('Firebase Admin SDK Initialization Error:', error.message);
        if (error.code) console.error('Firebase Admin SDK Error Code:', error.code);
        throw new Error(`Firebase Admin Initialization Failed: ${error.message}`);
    }
} else {
    app = getApps()[0];
}

// Initialize services
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

if (app) {
    try {
        adminDb = getFirestore(app);
        adminAuth = getAuth(app);
    } catch (error: any) {
        console.error('Error initializing Firebase services (getFirestore, getAuth):', error.message);
        throw new Error(`Failed to initialize Firebase services: ${error.message}`);
    }
} else {
    // This path should ideally not be hit if the above logic is correct.
    console.error('Firebase Admin App instance is null after initialization attempt. This usually indicates an issue with environment variables or the private key format.');
    throw new Error('Firebase Admin App instance is not available - check server logs for initialization errors.');
}

// Export services
export { adminDb, adminAuth, app };
