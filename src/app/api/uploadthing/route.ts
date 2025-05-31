// src/app/api/uploadthing/route.ts
import { createRouteHandler } from "uploadthing/next"; // <--- CORRECTED IMPORT NAME
import { ourFileRouter } from "./core";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

// Export routes for Next App Router
export const { GET, POST } = createRouteHandler({ // <--- CORRECTED FUNCTION NAME
  router: ourFileRouter,
  // Optionally, add your UploadThing app ID and secret if not using environment variables directly
  // config: {
  //   uploadthingId: process.env.UPLOADTHING_APP_ID,
  //   uploadthingSecret: process.env.UPLOADTHING_SECRET,
  // },
});