// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-unused-vars
  var prisma: PrismaClient | undefined;
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
    // Depending on the environment, you might want to handle this more gracefully
    // or ensure the application doesn't start/build if Prisma fails.
    throw new Error(`Failed to initialize Prisma Client: ${error.message}`);
  }
}

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prismaInstance;
}

export default prismaInstance;
