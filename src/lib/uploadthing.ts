// src/lib/uploadthing.ts
import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core"; // Adjust path if your core.ts is elsewhere
 
export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>();
