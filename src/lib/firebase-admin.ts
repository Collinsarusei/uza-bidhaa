// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// --- VERCEL BUILD DEBUGGING (TOP OF FILE) ---
console.log("VERCEL_BUILD_DEBUG: Attempting to read Firebase Admin env vars...");
const projectId_debug = process.env.FIREBASE_PROJECT_ID;
const clientEmail_debug = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey_debug = process.env.FIREBASE_PRIVATE_KEY;

console.log(`VERCEL_BUILD_DEBUG: FIREBASE_PROJECT_ID: ${projectId_debug ? `SET (val: ${projectId_debug})` : "NOT SET"}`);
console.log(`VERCEL_BUILD_DEBUG: FIREBASE_CLIENT_EMAIL: ${clientEmail_debug ? `SET (val: ${clientEmail_debug})` : "NOT SET"}`);
console.log(`VERCEL_BUILD_DEBUG: FIREBASE_PRIVATE_KEY: ${rawPrivateKey_debug ? `SET (length: ${rawPrivateKey_debug.length})` : "NOT SET"}`);
if (rawPrivateKey_debug) {
    console.log(`VERCEL_BUILD_DEBUG: FIREBASE_PRIVATE_KEY (first 60 chars): ${rawPrivateKey_debug.substring(0, 60)}`);
    console.log(`VERCEL_BUILD_DEBUG: FIREBASE_PRIVATE_KEY (last 60 chars): ${rawPrivateKey_debug.substring(rawPrivateKey_debug.length - 60)}`);
}
// --- END VERCEL BUILD DEBUGGING ---

// --- Environment Variable Check ---
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

// Validate that all required variables are present
if (!projectId || !clientEmail || !rawPrivateKey) {
    console.error('VERCEL_BUILD_ERROR: Missing Firebase Admin SDK configuration environment variables!');
    console.error(`VERCEL_BUILD_ERROR: projectId set: ${!!projectId}, clientEmail set: ${!!clientEmail}, rawPrivateKey set: ${!!rawPrivateKey}`);
    throw new Error('Firebase Admin SDK configuration is incomplete for Vercel build.');
}

let app;

// Check if Firebase Admin has already been initialized
if (!getApps().length) {
    console.log('VERCEL_BUILD_DEBUG: Attempting Firebase Admin SDK Initialization...');

    try {
        // Process the private key
        const privateKey = rawPrivateKey
            .replace(/\\n/g, '\n') // <--- CORRECTED LINE
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

        console.log('VERCEL_BUILD_DEBUG: Firebase Admin SDK Initialized Successfully.');
    } catch (error: any) {
        console.error(`VERCEL_BUILD_ERROR: Firebase Admin SDK Initialization Error: ${error.message}`);
        console.error(`VERCEL_BUILD_ERROR: Project ID Used: ${projectId}`);
        console.error(`VERCEL_BUILD_ERROR: Client Email Used: ${clientEmail}`);
        console.error(`VERCEL_BUILD_ERROR: Private Key Present (in rawPrivateKey variable): ${!!rawPrivateKey}`);

        if (error.message?.includes('PEM')) {
            console.error('VERCEL_BUILD_ERROR: Error might be related to invalid private key format. Ensure the key is properly formatted.');
        } else if (error.message?.includes('cert')) {
            console.error('VERCEL_BUILD_ERROR: Error might be related to invalid certificate format. Check your service account credentials.');
        }

        throw new Error(`Firebase Admin Initialization Failed during Vercel build: ${error.message}`);
    }
} else {
    console.log('VERCEL_BUILD_DEBUG: Firebase Admin SDK already initialized. Getting existing app.');
    app = getApps()[0];
}

// Initialize services
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

if (app) {
    try {
        adminDb = getFirestore(app);
        adminAuth = getAuth(app);
        console.log('VERCEL_BUILD_DEBUG: Firebase services (Firestore, Auth) obtained successfully.');
    } catch (error: any) {
        console.error(`VERCEL_BUILD_ERROR: Error initializing Firebase services (getFirestore, getAuth): ${error.message}`);
        throw new Error(`Failed to initialize Firebase services during Vercel build: ${error.message}`);
    }
} else {
    console.error('VERCEL_BUILD_ERROR: Firebase Admin App instance is not available after initialization attempt.');
    throw new Error('Firebase Admin App instance is not available for Vercel build');
}

// Export services
export { adminDb, adminAuth, app };