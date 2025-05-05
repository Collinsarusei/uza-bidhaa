// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';
import { getApps, App } from 'firebase-admin/app';
import { Bucket } from '@google-cloud/storage'; // FIX: Import Bucket type

// --- Environment Variable Check ---
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY; // FIX: Read the RAW private key

// Validate that all required variables are present
if (!projectId || !clientEmail || !rawPrivateKey) {
    console.error('Missing Firebase Admin SDK configuration environment variables!');
    console.error('Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (the full, raw multi-line key) are set in your environment (e.g., Vercel settings).');
    throw new Error('Firebase Admin SDK configuration is incomplete.');
}

// --- FIX: Declare storageBucketName outside the try block ---
// Common formats are <project-id>.appspot.com or <project-id>.firebasestorage.app
// Verify the correct one for YOUR project in the Firebase Console -> Storage section.
// Using the one potentially mentioned in your earlier logs:
const storageBucketName = `${projectId}.firebasestorage.app`;
// If that causes issues later, try uncommenting this line and commenting the one above:
// const storageBucketName = `${projectId}.appspot.com`;

let app: App | undefined = undefined; // Initialize as undefined

// Check if Firebase Admin has already been initialized
if (!getApps().length) {
    // --- FIX: Log the bucket name before trying initialization ---
    console.log(`Using storage bucket: ${storageBucketName}`);
    console.log('Attempting Firebase Admin SDK Initialization...');
    try {
        // --- FIX: Replace escaped newlines from env vars ---
        const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

        // --- Construct Service Account Object ---
        const serviceAccount: admin.ServiceAccount = {
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey, // Use the processed key
        };

        // --- Initialize Firebase Admin SDK ---
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: storageBucketName // Use variable declared outside try block
        });
        console.log('Firebase Admin SDK Initialized Successfully.');
        app = admin.app(); // Assign the initialized app

    } catch (error: any) {
        console.error('Firebase Admin SDK Initialization Error:', error);
        // Log details helpful for debugging
        console.error('Project ID Used:', projectId);
        console.error('Client Email Used:', clientEmail);
        console.error('Private Key Env Var Present:', !!rawPrivateKey);

        // Log specific error types
        if (error.message && error.message.includes('PEM')) {
             const processedKeySnippet = rawPrivateKey.replace(/\\n/g, '\n');
             console.error('Specific Error: Failed to parse the private key. Ensure FIREBASE_PRIVATE_KEY in Vercel contains the *exact* multi-line key from the service account JSON, pasted directly.');
             console.error('Key Snippet (start):', processedKeySnippet?.substring(0, 60));
             console.error('Key Snippet (end):', processedKeySnippet?.substring(processedKeySnippet.length - 60));
        } else if (error.message && error.message.includes('cert') && error.message.includes('json')) {
             console.error('Specific Error: Check if the SDK is trying to parse the key as JSON. Ensure `admin.credential.cert()` is used.');
        }
        // --- FIX: storageBucketName is now accessible here ---
        else if (error.code === 'storage/invalid-argument' || (error.message && error.message.toLowerCase().includes('bucket'))) {
            console.error(`Specific Error: Issue with storage bucket name "${storageBucketName}". Verify this is the correct bucket name for project "${projectId}" in your Firebase console.`);
        }

        // Re-throw the error to prevent the app from starting in a broken state
        throw new Error(`Firebase Admin Initialization Failed: ${error.message}`);
    }
} else {
    console.log('Firebase Admin SDK already initialized. Getting existing app.');
    app = admin.app(); // Use the existing app instance
}

// --- Safer Exporting ---
let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: Bucket | null = null; // FIX: Use imported Bucket type

if (app) {
    try {
        adminDb = admin.firestore(app);
        adminAuth = admin.auth(app);
        // Ensure storage().bucket() doesn't throw if the bucket name was wrong during init,
        // although the init itself should have thrown earlier if the name was invalid.
        adminStorage = admin.storage(app).bucket();
    } catch (serviceError: any) {
         console.error("Error getting Firebase Admin services (db, auth, storage) from initialized app:", serviceError);
         // Decide if this is critical enough to throw
         // throw new Error("Failed to initialize critical Firebase Admin services even after app initialization.");
    }
} else {
     console.error("Firebase Admin App instance is not available. Services (db, auth, storage) cannot be initialized.");
     // Throw error here if admin access is absolutely mandatory for the app function
     // throw new Error("Firebase Admin App could not be initialized.");
}

// Export potentially null services. Calling code MUST handle null checks where these are used.
export { adminDb, adminAuth, adminStorage, app }; // Export app instance if needed elsewhere