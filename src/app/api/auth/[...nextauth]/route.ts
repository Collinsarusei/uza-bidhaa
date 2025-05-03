// src/app/api/auth/[...nextauth]/route.ts

// --- Core Imports ---
import NextAuth, {
  AuthOptions,
  User as NextAuthDefaultUser, // Default User
  Session as NextAuthDefaultSession, // Default Session
  DefaultUser // Import DefaultUser explicitly for Session augmentation
} from "next-auth";
import { JWT as NextAuthDefaultJWT } from "next-auth/jwt"; // Default JWT
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from 'bcrypt';
import { adminDb } from '@/lib/firebase-admin';

// --- Define OUR Application User Structure ---
// This represents the raw data shape, often used internally or returned by authorize
interface AppUser {
  id: string;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  // ... other fields from Firestore
}

// --- NextAuth Configuration ---
export const authOptions: AuthOptions = {
providers: [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: "Email", type: "email", placeholder: "test@example.com" },
      password: { label: "Password", type: "password" }
    },
    // This function MUST return an object matching the augmented 'User' type below (or null/throw)
    async authorize(credentials, req): Promise<AppUser | null> { // Returning our internal AppUser shape
      if (!credentials?.email || !credentials?.password) {
        throw new Error("Please enter both email and password.");
      }
      console.log(`Auth: Attempting login for ${credentials.email}`);
      try {
        const usersRef = adminDb.collection('users');
        const q = usersRef.where('email', '==', credentials.email).limit(1);
        const querySnapshot = await q.get();

        if (querySnapshot.empty) {
          throw new Error("No user found with this email.");
        }
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        if (!userData.password) {
          throw new Error("Login configuration error for this user.");
        }
        const passwordMatch = await bcrypt.compare(credentials.password, userData.password);

        if (passwordMatch) {
          console.log(`Auth: Login successful for ${credentials.email}`);
          // Map Firestore data to our AppUser type.
          // This object's shape MUST align with the augmented next-auth User type below.
          const user: AppUser = {
            id: userDoc.id,
            name: userData.name || null,
            email: userData.email || null,
            phoneNumber: userData.phoneNumber || null,
          };
          return user;
        } else {
          throw new Error("Incorrect password.");
        }
      } catch (error: any) {
          console.error("Authorize Error:", error);
          if (error.message === "No user found with this email." || error.message === "Incorrect password.") {
               throw error;
          }
          throw new Error("An error occurred during authentication.");
      }
    }
  })
],

// --- Callbacks ---
callbacks: {
  // The 'user' object passed here matches the augmented 'User' type if sign-in is successful
  async jwt({ token, user }: { token: NextAuthDefaultJWT; user?: NextAuthDefaultUser }): Promise<NextAuthDefaultJWT> {
      // The 'user' object has the fields defined in the augmented 'User' interface
      if (user) {
          // Assign properties from the user object to the token.
          // The token type is augmented below.
          token.id = user.id;
          token.phoneNumber = (user as any).phoneNumber; // Use type assertion or ensure User type includes it
          token.name = user.name; // Ensure these are present if needed
          token.email = user.email;
          // Any other fields from the augmented User type you need in the token
      }
      return token;
  },

  // The 'token' object here matches the augmented 'JWT' type
  // The 'session' object starts as the default but we modify its 'user' property
  async session({ session, token }: { session: NextAuthDefaultSession; token: NextAuthDefaultJWT }): Promise<NextAuthDefaultSession> {
      // The 'token' contains the fields added in the jwt callback.
      // We add these fields to session.user. The session.user type is augmented below.
      if (token && session.user) {
          session.user.id = token.id as string; // Assign from token
          session.user.phoneNumber = token.phoneNumber as string | null | undefined; // Assign from token
          // Ensure default fields are assigned if needed (often NextAuth does this)
          session.user.name = token.name;
          session.user.email = token.email;
      }
      return session;
  },
},

// --- Session Strategy ---
session: {
  strategy: "jwt",
},

// --- Custom Pages ---
pages: {
  signIn: '/auth',
  error: '/auth',
},

// --- Secret ---
secret: process.env.NEXTAUTH_SECRET,

// --- Debug ---
debug: process.env.NODE_ENV === 'development',
};

// --- Export the handler ---
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };


// ========================================================
// --- Type Augmentation for NextAuth (Recommended: types/next-auth.d.ts) ---
// ========================================================

declare module "next-auth" {
/**
 * This merges with the default `User` type defined by NextAuth.
 * The object returned by the `authorize` callback must match this merged type.
 */
interface User {
  // Add your custom fields here. Make sure they match the object structure
  // returned by your `authorize` function.
  id: string;
  phoneNumber?: string | null;
  // You can potentially omit name/email/image if they are already in DefaultUser
  // and you are returning them from authorize. Check DefaultUser definition.
  // name?: string | null;
  // email?: string | null;
}

/**
 * This merges with the default `Session` type.
 * This is the type you'll get from `useSession` or `getSession`.
 */
interface Session {
  // The `user` object within Session should now reflect the augmented `User` type.
  // We explicitly add the custom fields to the Session['user'] definition.
  user?: {
    id?: string | null;
    phoneNumber?: string | null;
  } & DefaultUser; // Merge custom fields with the default User fields (name, email, image)
                   // Using DefaultUser here is less likely to cause recursion.
}
}

declare module "next-auth/jwt" {
/**
 * This merges with the default `JWT` type.
 * This is the shape of the token passed to the `session` callback
 * and the shape of the token stored in the cookie.
 */
interface JWT {
  // Add the custom fields you assigned in the `jwt` callback.
  id?: string;
  phoneNumber?: string | null;
  // Other fields like name, email, picture, sub, iat, exp, jti might be added automatically
}
}