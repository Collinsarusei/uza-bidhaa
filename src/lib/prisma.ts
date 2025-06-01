console.log('VERCEL_BUILD_DEBUG_PRISMA: Entering @/lib/prisma.ts');

import { PrismaClient } from '@prisma/client';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-unused-vars
  var prisma: PrismaClient | undefined;
}

// --- VERCEL BUILD DEBUGGING for DATABASE_URL ---
const dbUrl = process.env.DATABASE_URL;
console.log(`VERCEL_BUILD_DEBUG_PRISMA: DATABASE_URL is ${dbUrl ? 'SET' : 'NOT SET'}`);
if (dbUrl) {
  console.log(`VERCEL_BUILD_DEBUG_PRISMA: DATABASE_URL (first 30 chars): ${dbUrl.substring(0, 30)}`);
  const atSymbolIndex = dbUrl.indexOf('@');
  const schemaPartIndex = dbUrl.indexOf('?'); // Look for ?schema= or other params
  let identifiableUrlPart = dbUrl;
  if (atSymbolIndex > 0) {
    identifiableUrlPart = dbUrl.substring(atSymbolIndex + 1);
    if (schemaPartIndex > atSymbolIndex) {
      identifiableUrlPart = dbUrl.substring(atSymbolIndex + 1, schemaPartIndex);
    }
  }
  console.log(`VERCEL_BUILD_DEBUG_PRISMA: DATABASE_URL (host/db part if discernible): ${identifiableUrlPart}`);
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.warn('VERCEL_BUILD_WARN_PRISMA: DATABASE_URL does not seem to start with postgresql:// or postgres://');
  }
} else {
  console.error('VERCEL_BUILD_ERROR_PRISMA: DATABASE_URL IS NOT SET in process.env!');
  // Early exit or throw to make failure more obvious if DATABASE_URL is missing
  // throw new Error('CRITICAL_SETUP_ERROR: DATABASE_URL is missing for Prisma Client in Vercel build.');
}
// --- END VERCEL BUILD DEBUGGING for DATABASE_URL ---

let prismaInstance: PrismaClient;

console.log('VERCEL_BUILD_DEBUG_PRISMA: About to check global.prisma');
if (global.prisma) {
  console.log('VERCEL_BUILD_DEBUG_PRISMA: Reusing existing global.prisma instance.');
  prismaInstance = global.prisma;
} else {
  try {
    console.log('VERCEL_BUILD_DEBUG_PRISMA: Creating new PrismaClient instance...');
    prismaInstance = new PrismaClient({
      // log: [{ emit: 'stdout', level: 'query' }], // Consider very verbose logging if desperate
    });
    console.log('VERCEL_BUILD_DEBUG_PRISMA: New PrismaClient instance CREATED SUCCESSFULLY.');
  } catch (error: any) {
    console.error(`VERCEL_BUILD_ERROR_PRISMA: FAILED to initialize PrismaClient constructor: ${error.message}`);
    console.error(`VERCEL_BUILD_ERROR_PRISMA: Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    // Re-throwing the error is important to make the build fail here if this is the cause.
    throw new Error(`PrismaClient_INIT_FAILED_IN_LIB_PRISMA: ${error.message}`);
  }
}

if (process.env.NODE_ENV !== 'production') {
  console.log('VERCEL_BUILD_DEBUG_PRISMA: Assigning PrismaClient to global in @/lib/prisma.ts (dev mode).');
  global.prisma = prismaInstance;
}

console.log('VERCEL_BUILD_DEBUG_PRISMA: Exiting @/lib/prisma.ts - Prisma instance exported.');
export default prismaInstance;
