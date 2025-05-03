// src/lib/firebase.ts
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // <-- Import Firestore

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCe5qTpvGcdIDmSgO1gtj-AqEZjiwB3B88", // Replace with your actual API key if different
  authDomain: "nyeri-connect.firebaseapp.com",
  projectId: "nyeri-connect",
  storageBucket: "nyeri-connect.firebasestorage.app", // Corrected the property name
  messagingSenderId: "204127025942",
  appId: "1:204127025942:web:538c2f66c80ec68665ee37",
  measurementId: "G-7JW2CTNR3J"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app); // <-- Initialize Firestore

export { app, auth, db }; // <-- Export db
