import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import prisma from './prisma';

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    callbacks: {
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.sub!;
                // Fetch user role from database
                const user = await prisma.user.findUnique({
                    where: { id: token.sub! },
                    select: { role: true }
                });
                if (user) {
                    (session.user as any).role = user.role;
                }
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth',
    },
}; 