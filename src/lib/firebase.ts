// src/lib/firebase.ts
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Import storage if needed on client

// Retrieve client-side environment variables
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

// Validate that all required variables are present
if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    console.error("Firebase Client Config Error: Missing one or more NEXT_PUBLIC_FIREBASE_ environment variables.");
    // Optionally throw an error or handle this case depending on your app's needs
    // If Firebase is critical for the client, throwing might be appropriate.
    // throw new Error("Firebase client configuration is incomplete. Check environment variables.");
}

// Construct the Firebase configuration object using environment variables
const firebaseConfig: FirebaseOptions = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
  // measurementId is optional, only include if defined
  measurementId: measurementId ? measurementId : undefined 
};

// Initialize Firebase (prevent reinitialization)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // Initialize storage if needed

console.log("Firebase Client SDK Initialized (firebase.ts)"); // Add log for confirmation

export { app, auth, db, storage }; // Export storage too
