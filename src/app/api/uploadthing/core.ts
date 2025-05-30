// src/app/api/uploadthing/core.ts
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Adjusted path

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique name
  mediaUploader: f({
    image: { maxFileSize: "16MB", maxFileCount: 5 }, // Allow up to 5 images, 10MB each
    video: { maxFileSize: "16MB", maxFileCount: 1 }, // Allow 1 video, 10MB
    // For mixed types, you could use a generic route:
    // blob: { maxFileSize: "10MB" }, 
  })
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req }) => {
      // This code runs on your server before upload
      const session = await getServerSession(authOptions);

      // If you throw, the user will not be able to upload
      if (!session || !session.user?.id) {
        console.log("UploadThing Middleware: User not authenticated.");
        throw new Error("Unauthorized");
      }

      console.log(`UploadThing Middleware: User ${session.user.id} authenticated.`);
      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("UploadThing: Upload complete for userId:", metadata.userId);
      console.log("UploadThing: File url", file.url);
      console.log("UploadThing: File name", file.name);
      console.log("UploadThing: File key", file.key); // The key is often used as the unique identifier in storage

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId, fileUrl: file.url, fileName: file.name, fileKey: file.key };
    }),
  
  // Example route for profile pictures (if you need different rules)
  profilePictureUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      const session = await getServerSession(authOptions);
      if (!session || !session.user?.id) throw new Error("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("UploadThing: Profile picture upload complete for userId:", metadata.userId);
      console.log("UploadThing: File url", file.url);
      // Here you might want to update the user's profilePictureUrl in Prisma directly
      // or return the URL to the client to handle the update.
      return { uploadedBy: metadata.userId, fileUrl: file.url };
    }),

} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
