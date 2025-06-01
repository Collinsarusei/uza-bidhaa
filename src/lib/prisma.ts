// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-unused-vars
  var prisma: PrismaClient | undefined;
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  // This error will be caught during build or server start if DATABASE_URL is missing.
  // It's good to have an early, clear indicator.
  console.error('CRITICAL_ERROR_PRISMA: DATABASE_URL environment variable is not defined.');
  throw new Error('DATABASE_URL environment variable is not defined. PrismaClient cannot be initialized.');
}

let prismaInstance: PrismaClient;

if (global.prisma) {
  prismaInstance = global.prisma;
} else {
  try {
    prismaInstance = new PrismaClient({
      // log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  } catch (error: any) {
    console.error(`PrismaClient Initialization Error: ${error.message}`);
    // Re-throwing the error is important to make the build/runtime fail clearly if Prisma can't init
    throw new Error(`Failed to initialize Prisma Client: ${error.message}`);
  }
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prismaInstance;
}

export default prismaInstance;
