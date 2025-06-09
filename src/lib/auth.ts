import { AuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "./prisma";
import { adminAuth } from "./firebase-admin";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      id: "firebase-phone",
      name: "Firebase Phone Sign-in",
      credentials: {
        idToken: { label: "Firebase ID Token", type: "text" },
      },
      async authorize(credentials, req) {
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
              role: 'USER',
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
              role: user.role,
            };
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
      async authorize(credentials, req) {
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
            role: user.role,
          };
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
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.image = user.image;
        token.phoneNumber = user.phoneNumber;
        token.phoneVerified = user.phoneVerified;
        token.role = user.role;
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
        (session.user as any).role = token.role as 'USER' | 'ADMIN' | null | undefined;
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