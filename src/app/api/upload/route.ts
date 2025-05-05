// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import { v4 as uuidv4 } from 'uuid';
import { Bucket } from '@google-cloud/storage'; // Import Bucket type for correct typing

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

    // --- Check Storage Initialization and Get Bucket --- 
    if (!adminStorage) {
        console.error("API Upload Error: Firebase Admin Storage Bucket is not initialized!");
        // Log this specifically - it means firebase-admin.ts failed earlier
        return NextResponse.json({ message: 'Storage service internal error.' }, { status: 500 });
    }
    // adminStorage IS the bucket, just assign it and type it correctly
    const bucket: Bucket = adminStorage;
    console.log(`API Upload: Using storage bucket: ${bucket.name}`);
    // Removed the try-catch here as the check is done above

    try {
        // --- Use standard req.formData() --- 
        console.log("API Upload: Parsing form data using req.formData()...");
        const formData = await req.formData();
        console.log("API Upload: FormData parsed.");

        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            console.log("API Upload: No files found in FormData.");
            return NextResponse.json({ message: 'No files uploaded.' }, { status: 400 });
        }
        console.log(`API Upload: Found ${files.length} file(s).`);

        const uploadPromises = files.map(async (file) => {
            console.log(`API Upload: Processing file: ${file.name} (Type: ${file.type}, Size: ${file.size} bytes)`);
            
            if (!file.type || !(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                console.warn(`API Upload: Skipping non-media file: ${file.name}`);
                return null; 
            }
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                 console.warn(`API Upload: Skipping file due to size limit: ${file.name} (${file.size} bytes)`);
                 return { error: `File ${file.name} exceeds 10MB limit.` };
            }

            let fileBuffer: Buffer;
            try {
                 const bytes = await file.arrayBuffer();
                 fileBuffer = Buffer.from(bytes);
                 console.log(`API Upload: Read ${file.name} to buffer (${fileBuffer.length} bytes).`);
            } catch (bufferError) {
                console.error(`API Upload: Failed to read file to buffer: ${file.name}`, bufferError);
                return { error: `Failed to process file ${file.name}` };
            }

            const originalFilename = file.name || 'uploaded_file';
            const fileExtension = originalFilename.split('.').pop() || '';
            const uniqueFilename = `${uuidv4()}.${fileExtension}`;
            const filePath = `items/${userId}/${uniqueFilename}`;
            // Use the bucket directly here
            const fileUploadRef = bucket.file(filePath);

            console.log(`API Upload: Attempting to save ${originalFilename} to Storage at ${filePath}...`);
            try {
                await fileUploadRef.save(fileBuffer, {
                    metadata: {
                        contentType: file.type,
                        metadata: { originalFilename: originalFilename, uploaderId: userId }
                    },
                    public: true,
                });
                console.log(`API Upload: Successfully saved ${filePath} to Storage.`);
            } catch (saveError: any) {
                 console.error(`API Upload: Failed to save file ${filePath} to Storage:`, saveError);
                  return { error: `Storage save failed for ${originalFilename}: ${saveError.message}` };
            }

             const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
            console.log(`API Upload: Generated public URL for ${originalFilename}: ${publicUrl}`);
            return { url: publicUrl };
        });

        console.log("API Upload: Waiting for all upload promises...");
        const results = await Promise.all(uploadPromises);
        console.log("API Upload: All uploads finished. Results:", results);

        const successfulUrls = results.filter(r => r?.url).map(r => r!.url);
        const uploadErrors = results.filter(r => r?.error).map(r => r!.error);

        if (uploadErrors.length > 0) {
             console.warn(`API Upload: Completed with ${uploadErrors.length} errors.`);
             return NextResponse.json({ 
                 message: `Upload completed with errors: ${uploadErrors.join('; ')}`,
                 errors: uploadErrors,
                 successfulUrls: successfulUrls
             }, { status: 400 });
        }

        if (successfulUrls.length === 0) {
             console.log("API Upload: No files were successfully uploaded.");
             return NextResponse.json({ message: 'No valid files were processed.' }, { status: 400 });
        }

        console.log("--- API /api/upload SUCCESS ---");
        return NextResponse.json({ message: 'Files uploaded successfully', urls: successfulUrls }, { status: 200 });

    } catch (error: any) {
        console.error("--- API /api/upload FAILED (Outer Catch) --- Error:", error);
        let statusCode = 500;
        let message = error.message || 'Failed to process upload request.';
        return NextResponse.json({ message: message }, { status: statusCode });
    }
}
