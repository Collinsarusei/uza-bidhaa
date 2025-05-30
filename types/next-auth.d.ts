// types/next-auth.d.ts
import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";
import { UserRole } from "@prisma/client"; // Import UserRole enum

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    phoneNumber?: string | null;
    phoneVerified?: boolean | null;
    role?: UserRole | null; // Added role
  }

  interface Session extends DefaultSession {
    user?: {
      id?: string | null;
      phoneNumber?: string | null;
      phoneVerified?: boolean | null;
      role?: UserRole | null; // Added role
      // These are from DefaultSession["user"]
      name?: string | null;
      email?: string | null;
      image?: string | null;
    } & Omit<DefaultUser, 'id'>; // Omit default id to avoid conflict if DefaultUser has it typed differently
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    phoneNumber?: string | null;
    phoneVerified?: boolean | null;
    role?: UserRole | null; // Added role
  }
}
