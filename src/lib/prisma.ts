console.log('VERCEL_BUILD_DEBUG: TOP OF @/lib/prisma.ts');

// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-unused-vars
  var prisma: PrismaClient | undefined;
}

console.log('VERCEL_BUILD_DEBUG: Attempting to initialize Prisma Client in @/lib/prisma.ts...');
const prisma =
  global.prisma ||
  new PrismaClient({
    // log: ['query', 'info', 'warn', 'error'], // Optional: Enable logging for debugging
  });
console.log('VERCEL_BUILD_DEBUG: Prisma Client potentially initialized in @/lib/prisma.ts.');

if (process.env.NODE_ENV !== 'production') {
  console.log('VERCEL_BUILD_DEBUG: Assigning Prisma Client to global in @/lib/prisma.ts (dev mode).');
  global.prisma = prisma;
}

export default prisma;
