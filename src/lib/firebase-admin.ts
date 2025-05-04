// src/lib/firebase-admin.ts

import admin from 'firebase-admin';

let app: admin.app.App;

// --- Initialize Firebase Admin SDK (if not already initialized) --- 
if (!admin.apps.length) {
    console.log("Attempting to initialize Firebase Admin SDK...");

    // --- Read and Validate Environment Variables *inside* the init block --- 
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId) {
        console.error("FATAL ERROR: FIREBASE_PROJECT_ID environment variable is not set.");
        throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PROJECT_ID');
    }
    if (!clientEmail) {
        console.error("FATAL ERROR: FIREBASE_CLIENT_EMAIL environment variable is not set.");
        throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_CLIENT_EMAIL');
    }
    if (!privateKeyEnv) {
        console.error("FATAL ERROR: FIREBASE_PRIVATE_KEY environment variable is not set.");
        throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PRIVATE_KEY');
    }
    // --- End Validation --- 

    // --- Format the private key correctly ---
    const privateKey = privateKeyEnv.replace(/\\n/g, '\n');

    // --- Construct the Service Account object ---
    const serviceAccount: admin.ServiceAccount = {
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
    };

    const expectedBucketName = `${projectId}.firebasestorage.app`;
    console.log(`Using bucket name for init: ${expectedBucketName}`);
    
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: expectedBucketName 
        });
        console.log('Firebase Admin SDK Initialized Successfully.');
    } catch (error: any) {
        console.error('Firebase Admin SDK Initialization Error:', error);
        console.error('Bucket name used during init attempt:', expectedBucketName);
        console.error('Check project ID and service account credentials in environment variables.');
        throw new Error(`Firebase Admin Initialization Failed: ${error.message}`);
    }
} 

// Assign the app instance (either newly created or existing)
app = admin.app(); 

// --- Export the initialized Firebase Admin services ---
// These assume initialization succeeded or was already done.
// The error handling above should prevent the app from reaching here if init failed.
export const adminAuth = app.auth();
export const adminDb = app.firestore();
export const adminStorage = app.storage();
