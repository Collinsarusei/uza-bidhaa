// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import { v4 as uuidv4 } from 'uuid';
// Removed formidable imports
// Removed fs import (no longer needed for reading temp files)

// Removed config object (no longer disabling body parser)

export async function POST(req: Request) {
    console.log("--- API /api/upload START ---");

    // --- Authentication --- 
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Upload: Unauthorized.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`API Upload: Authenticated as user ${userId}`);

    // --- Check Storage Initialization ---
    if (!adminStorage) {
        console.error("API Upload Error: Firebase Admin Storage is not initialized!");
        return NextResponse.json({ message: 'Storage service unavailable.' }, { status: 500 });
    }
    let bucket;
    try {
         bucket = adminStorage.bucket();
         console.log(`API Upload: Using storage bucket: ${bucket.name}`);
    } catch (err: any) {
         console.error("API Upload Error: Failed to get storage bucket instance.", err);
         return NextResponse.json({ message: 'Failed to access storage bucket.' }, { status: 500 });
    }

    try {
        // --- Use standard req.formData() --- 
        console.log("API Upload: Parsing form data using req.formData()...");
        const formData = await req.formData();
        console.log("API Upload: FormData parsed.");

        // Get all files associated with the 'files' key
        const files = formData.getAll('files') as File[]; // Cast to standard File objects

        if (!files || files.length === 0) {
            console.log("API Upload: No files found in FormData.");
            return NextResponse.json({ message: 'No files uploaded.' }, { status: 400 });
        }
        console.log(`API Upload: Found ${files.length} file(s).`);

        // --- Upload each file --- 
        const uploadPromises = files.map(async (file) => {
            console.log(`API Upload: Processing file: ${file.name} (Type: ${file.type}, Size: ${file.size} bytes)`);
            
            // Basic validation (can add more)
            if (!file.type || !(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                console.warn(`API Upload: Skipping non-media file: ${file.name}`);
                return null; 
            }
            if (file.size > 10 * 1024 * 1024) { // 10MB limit check
                 console.warn(`API Upload: Skipping file due to size limit: ${file.name} (${file.size} bytes)`);
                 // Optionally throw an error or return a specific marker
                 // throw new Error(`File ${file.name} exceeds the 10MB limit.`); 
                 return { error: `File ${file.name} exceeds 10MB limit.` }; // Return error object instead of null
            }

            let fileBuffer: Buffer;
            try {
                 // Get buffer from standard File object
                 const bytes = await file.arrayBuffer();
                 fileBuffer = Buffer.from(bytes);
                 console.log(`API Upload: Read ${file.name} to buffer (${fileBuffer.length} bytes).`);
            } catch (bufferError) {
                console.error(`API Upload: Failed to read file to buffer: ${file.name}`, bufferError);
                return { error: `Failed to process file ${file.name}` }; // Return error object
            }

            const originalFilename = file.name || 'uploaded_file';
            const fileExtension = originalFilename.split('.').pop() || '';
            const uniqueFilename = `${uuidv4()}.${fileExtension}`;
            const filePath = `items/${userId}/${uniqueFilename}`;
            const fileUploadRef = bucket.file(filePath);

            console.log(`API Upload: Attempting to save ${originalFilename} to Storage at ${filePath}...`);
            try {
                await fileUploadRef.save(fileBuffer, {
                    metadata: {
                        contentType: file.type, // Use file.type directly
                        metadata: { originalFilename: originalFilename, uploaderId: userId }
                    },
                    public: true, // Still assuming public access needed
                });
                console.log(`API Upload: Successfully saved ${filePath} to Storage.`);
            } catch (saveError: any) { // Catch specific save error
                 console.error(`API Upload: Failed to save file ${filePath} to Storage:`, saveError);
                  return { error: `Storage save failed for ${originalFilename}: ${saveError.message}` }; // Return error object
            }

             const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
            console.log(`API Upload: Generated public URL for ${originalFilename}: ${publicUrl}`);
            return { url: publicUrl }; // Return success object
        });

        console.log("API Upload: Waiting for all upload promises...");
        const results = await Promise.all(uploadPromises);
        console.log("API Upload: All uploads finished. Results:", results);

        // Separate successful URLs and errors
        const successfulUrls = results.filter(r => r?.url).map(r => r!.url);
        const uploadErrors = results.filter(r => r?.error).map(r => r!.error);

        if (uploadErrors.length > 0) {
             console.warn(`API Upload: Completed with ${uploadErrors.length} errors.`);
             // Decide how to handle partial success: return only good URLs? Return error? 
             // Returning error if ANY file failed:
             return NextResponse.json({ 
                 message: `Upload completed with errors: ${uploadErrors.join('; ')}`,
                 errors: uploadErrors,
                 successfulUrls: successfulUrls // Optionally return successful ones too
             }, { status: 400 }); // Use 400 or 500 depending on error type
        }

        if (successfulUrls.length === 0) {
             console.log("API Upload: No files were successfully uploaded (perhaps all were skipped or failed).");
             return NextResponse.json({ message: 'No valid files were processed.' }, { status: 400 });
        }

        console.log("--- API /api/upload SUCCESS ---");
        return NextResponse.json({ message: 'Files uploaded successfully', urls: successfulUrls }, { status: 200 });

    } catch (error: any) {
        // Catch errors from req.formData() or other unexpected issues
        console.error("--- API /api/upload FAILED (Outer Catch) --- Error:", error);
        // Check for specific error types if needed (e.g., body size limits)
        let statusCode = 500;
        let message = error.message || 'Failed to process upload request.';
        // Example: Check if error is related to request size limit (might need specific error inspection)
        // if (error.type === 'entity.too.large') { statusCode = 413; message = "Request body too large."; }

        return NextResponse.json({ message: message }, { status: statusCode });
    }
}
