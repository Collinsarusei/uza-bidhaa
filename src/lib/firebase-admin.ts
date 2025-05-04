// src/lib/firebase-admin.ts

import admin from 'firebase-admin';

// --- Ensure environment variables are loaded and available ---
if (!process.env.FIREBASE_PROJECT_ID) {
    console.error("FATAL ERROR: FIREBASE_PROJECT_ID environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PROJECT_ID');
}
if (!process.env.FIREBASE_CLIENT_EMAIL) {
    console.error("FATAL ERROR: FIREBASE_CLIENT_EMAIL environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_CLIENT_EMAIL');
}
if (!process.env.FIREBASE_PRIVATE_KEY) {
    console.error("FATAL ERROR: FIREBASE_PRIVATE_KEY environment variable is not set.");
    throw new Error('Firebase Admin Setup Failed: Missing FIREBASE_PRIVATE_KEY');
}

// --- Format the private key correctly ---
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')

// --- Construct the Service Account object ---
const serviceAccount: admin.ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
};

let app: admin.app.App;

// --- Initialize Firebase Admin SDK (if not already initialized) ---
if (!admin.apps.length) {
    const expectedBucketName = `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
    console.log(`Attempting to initialize Firebase Admin SDK with bucket: ${expectedBucketName}`);
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // --- Using the .firebasestorage.app format --- 
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
app = admin.app(); 

// --- Export the initialized Firebase Admin services ---
export const adminAuth = app.auth();
export const adminDb = app.firestore();
export const adminStorage = app.storage();
