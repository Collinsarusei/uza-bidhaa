// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { AuthOptions, User as NextAuthUser } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../../../../lib/prisma"; 
import { adminAuth } from "../../../../lib/firebase-admin"; 
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

interface AppUser extends NextAuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  phoneVerified?: boolean | null;
  image?: string | null;
  role?: 'USER' | 'ADMIN' | null;
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      id: "firebase-phone", 
      name: "Firebase Phone Sign-in",
      credentials: {
        idToken: { label: "Firebase ID Token", type: "text" },
      },
      async authorize(credentials, req): Promise<AppUser | null> { 
        if (!credentials?.idToken) {
          throw new Error("Firebase ID Token not provided.");
        }
        if (!adminAuth) {
          throw new Error("Authentication service not available.");
        }
        try {
          const decodedToken = await adminAuth.verifyIdToken(credentials.idToken);
          const firebaseUser = await adminAuth.getUser(decodedToken.uid);
          if (!firebaseUser.phoneNumber) {
            throw new Error("Phone number missing from authenticated user.");
          }
          const phoneNumber = firebaseUser.phoneNumber;
          const user = await prisma.user.upsert({
            where: { phoneNumber: phoneNumber },
            update: {
              name: firebaseUser.displayName || undefined,
              image: firebaseUser.photoURL || undefined,
              email: firebaseUser.email || undefined, 
              phoneVerified: true,
              updatedAt: new Date(),
            },
            create: {
              phoneNumber: phoneNumber,
              phoneVerified: true,
              email: firebaseUser.email || null,
              name: firebaseUser.displayName || null,
              image: firebaseUser.photoURL || null,
              role: 'USER', // Default role for new users via phone OTP
            },
          });
          if (user) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              phoneNumber: user.phoneNumber,
              phoneVerified: user.phoneVerified,
              role: user.role, // Include role
            } as AppUser;
          }
          return null;
        } catch (error) {
          console.error("NextAuth: Error in Firebase phone authorize:", error);
          throw new Error("Invalid or expired Firebase session. Please sign in again.");
        }
      },
    }),
    CredentialsProvider({
      id: "credentials", 
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req): Promise<AppUser | null> { 
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter both email and password.");
        }
        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });
          if (!user) {
            throw new Error("No user found with this email.");
          }
          if (!user.password) {
            throw new Error("This account is likely setup for social or phone login.");
          }
          const isValidPassword = await bcrypt.compare(credentials.password, user.password);
          if (!isValidPassword) {
            throw new Error("Incorrect password.");
          }
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            phoneNumber: user.phoneNumber,
            phoneVerified: user.phoneVerified,
            role: user.role, // Include role
          } as AppUser;
        } catch (error: any) {
          if (error.message === "No user found with this email." || error.message === "Incorrect password." || error.message === "This account is likely setup for social or phone login.") {
            throw error;
          }
          throw new Error("An error occurred during authentication.");
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const appUser = user as AppUser;
        token.id = appUser.id;
        token.name = appUser.name;
        token.email = appUser.email;
        token.image = appUser.image;
        token.phoneNumber = appUser.phoneNumber;
        token.phoneVerified = appUser.phoneVerified;
        token.role = appUser.role; // Add role to JWT token
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null | undefined;
        session.user.email = token.email as string | null | undefined;
        session.user.image = token.image as string | null | undefined;
        (session.user as any).phoneNumber = token.phoneNumber as string | null | undefined;
        (session.user as any).phoneVerified = token.phoneVerified as boolean | null | undefined;
        (session.user as any).role = token.role as 'USER' | 'ADMIN' | null | undefined; // Add role to session user object
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth', 
    error: '/auth/error', 
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
