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
    console.log('Attempting Firebase Admin SDK Initialization...');
    
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

        console.log('Firebase Admin SDK Initialized Successfully.');
    } catch (error: any) {
        console.error('Firebase Admin SDK Initialization Error:', error);
        console.error('Project ID Used:', projectId);
        console.error('Client Email Used:', clientEmail);
        console.error('Private Key Present:', !!rawPrivateKey);

        if (error.message?.includes('PEM')) {
            console.error('Error: Invalid private key format. Ensure the key is properly formatted.');
        } else if (error.message?.includes('cert')) {
            console.error('Error: Invalid certificate format. Check your service account credentials.');
        }

        throw new Error(`Firebase Admin Initialization Failed: ${error.message}`);
    }
} else {
    console.log('Firebase Admin SDK already initialized. Getting existing app.');
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
        console.error('Error initializing Firebase services:', error);
        throw new Error(`Failed to initialize Firebase services: ${error.message}`);
    }
} else {
    throw new Error('Firebase Admin App instance is not available');
}

// Export services
export { adminDb, adminAuth, app };