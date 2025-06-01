console.log('VERCEL_BUILD_DEBUG: TOP OF @/lib/firebase-admin.ts');

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// --- VERCEL BUILD DEBUGGING ---
console.log("VERCEL_BUILD_DEBUG: Reading Firebase Admin env vars in @/lib/firebase-admin.ts...");
const projectId_debug = process.env.FIREBASE_PROJECT_ID;
const clientEmail_debug = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey_debug = process.env.FIREBASE_PRIVATE_KEY;

console.log(`VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: FIREBASE_PROJECT_ID is ${projectId_debug ? `SET (val: ${projectId_debug})` : 'NOT SET'}`);
console.log(`VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: FIREBASE_CLIENT_EMAIL is ${clientEmail_debug ? `SET (val: ${clientEmail_debug})` : 'NOT SET'}`);
console.log(`VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: FIREBASE_PRIVATE_KEY is ${rawPrivateKey_debug ? 'SET (length: ' + rawPrivateKey_debug.length + ')' : 'NOT SET'}`);
// --- END VERCEL BUILD DEBUGGING ---

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawPrivateKey) {
    console.error('VERCEL_BUILD_ERROR_FIREBASE_ADMIN: Missing Firebase Admin SDK config env vars!');
    throw new Error('Firebase Admin SDK config incomplete for Vercel build.');
} 

let app;
console.log('VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: Checking if Firebase app already initialized...');
if (!getApps().length) {
    console.log('VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: Initializing Firebase Admin SDK...');
    try {
        const privateKey = rawPrivateKey
            .replace(/\\n/g, '\n')      // Ensure this correctly handles escaped newlines from .env if Vercel doesn't auto-convert
            .replace(/^"|"$/g, '')      // Remove surrounding quotes if any (e.g. from .env files)
            .trim();                   // Trim whitespace

        app = initializeApp({ // ****** THIS LINE WAS MISSING THE ASSIGNMENT ********
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
        console.log('VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: Firebase Admin SDK Initialized Successfully.');
    } catch (error: any) {
        console.error(`VERCEL_BUILD_ERROR_FIREBASE_ADMIN: SDK Initialization Error: ${error.message}`);
        // Log more details about the error if available
        if (error.code) console.error(`VERCEL_BUILD_ERROR_FIREBASE_ADMIN: SDK Error Code: ${error.code}`);
        // console.error('VERCEL_BUILD_ERROR_FIREBASE_ADMIN: Full SDK Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw new Error(`Firebase Admin Init Failed (Vercel build): ${error.message}`);
    }
} else {
    console.log('VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: Firebase Admin SDK already initialized. Getting existing app.');
    app = getApps()[0];
}

let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

if (app) {
    try {
        adminDb = getFirestore(app);
        adminAuth = getAuth(app);
        console.log('VERCEL_BUILD_DEBUG_FIREBASE_ADMIN: Firestore & Auth services obtained.');
    } catch (error: any) {
        console.error(`VERCEL_BUILD_ERROR_FIREBASE_ADMIN: Error getting Firestore/Auth services: ${error.message}`);
        throw new Error(`Firebase Services Init Failed (Vercel build): ${error.message}`);
    }
} else {
    // This block should ideally not be reached if the above logic is correct and initializeApp either succeeds or throws.
    console.error('VERCEL_BUILD_ERROR_FIREBASE_ADMIN: Firebase app instance is null after init attempt. This indicates a logic error in initialization sequence or an unhandled case.');
    throw new Error('Firebase App instance null (Vercel build) - Unexpected state');
}

export { adminDb, adminAuth, app };
