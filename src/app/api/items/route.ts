import { NextResponse } from 'next/server';
import type { Item } from '@/lib/types'; // Import the Item type
import { adminDb } from '@/lib/firebase-admin'; // Use Firebase Admin SDK
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route'; // Adjust path if needed
import { FieldValue } from 'firebase-admin/firestore'; // For Timestamps
import { v4 as uuidv4 } from 'uuid'; // For generating item IDs

const itemsCollection = adminDb.collection('items');

// GET /api/items - Fetch items from Firestore with optional filtering
export async function GET(request: Request) {
    console.log("API: Fetching items from Firestore");
    const { searchParams } = new URL(request.url);
    const userIdToExclude = searchParams.get('userId'); // For main dashboard (exclude user's own)
    const sellerIdToInclude = searchParams.get('sellerId'); // For "My Listings" (fetch only user's own)
    const itemIdToFetch = searchParams.get('itemId'); // For single item details

    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = itemsCollection;

        if (itemIdToFetch) {
            console.log(`API: Fetching single item by ID: ${itemIdToFetch}`);
            const itemDoc = await itemsCollection.doc(itemIdToFetch).get();
            if (!itemDoc.exists) {
                return NextResponse.json({ message: "Item not found" }, { status: 404 });
            }
            // Return as an array for consistency with message page expectation
             return NextResponse.json([itemDoc.data()], { status: 200 });
        } else if (sellerIdToInclude) {
            console.log(`API: Filtering items to include only seller ID: ${sellerIdToInclude}`);
            query = query.where('sellerId', '==', sellerIdToInclude);
        } else if (userIdToExclude) {
            console.log(`API: Filtering items to exclude user ID: ${userIdToExclude}`);
            // Firestore doesn't directly support '!=' queries efficiently on their own.
            // Fetch all and filter, or fetch based on other criteria and filter.
            // For simplicity here, fetching all available items and filtering in code.
            // A better approach for large datasets might involve different data modeling or more complex queries.
             query = query.where('status', '==', 'available'); // Example: Fetch only available items first
        } else {
             console.log(`API: Fetching all available items.`);
             // Fetch only available items for the general homepage/dashboard view
             query = query.where('status', '==', 'available');
        }

        // Add ordering, e.g., by creation date descending
        query = query.orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        let itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Item[];

        // Apply exclusion filter if needed (after fetching)
        if (userIdToExclude && !sellerIdToInclude && !itemIdToFetch) {
             itemsData = itemsData.filter(item => item.sellerId !== userIdToExclude);
             console.log(`API: Found ${itemsData.length} items after excluding user ID: ${userIdToExclude}.`);
        } else if (!itemIdToFetch) {
             console.log(`API: Found ${itemsData.length} items matching query.`);
        }

        return NextResponse.json(itemsData);

    } catch (error: any) {
        console.error("API Error fetching items:", error);
        return NextResponse.json({ message: 'Failed to fetch items', error: error.message }, { status: 500 });
    }
}


// POST /api/items - Create a new item in Firestore
export async function POST(request: Request) {
    console.log("API: Attempting to create item in Firestore");

    // --- Get Authenticated User (Seller) ---
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        console.warn("API Create Item: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const sellerId = session.user.id;

    // --- TODO: Check KYC Status (when implemented) ---
    // Fetch user data from DB
    // const userDoc = await adminDb.collection('users').doc(sellerId).get();
    // const userData = userDoc.data();
    // if (!userData?.kycVerified) {
    //     console.warn(`API Create Item: User ${sellerId} attempted to list without KYC.`);
    //     return NextResponse.json({ message: 'KYC verification required to list items.' }, { status: 403 });
    // }
    // --- End KYC Check ---

    try {
        const body = await request.json();
        console.log("API: Received item data for creation:", body);

        // --- Basic Validation (Consider using Zod for more robust validation) ---
        const requiredFields = ['title', 'description', 'price', 'category', 'location'];
        const missingFields = requiredFields.filter(field => !(field in body) || !body[field]);

        if (missingFields.length > 0) {
            console.log(`API Create Item: Missing required fields: ${missingFields.join(', ')}`);
            return NextResponse.json({ message: `Missing required fields: ${missingFields.join(', ')}` }, { status: 400 });
        }
        if (!body.mediaUrls || body.mediaUrls.length === 0) {
             // Handle media URLs - assume they are passed in after upload for now
            console.log(`API Create Item: Missing mediaUrls`);
             //return NextResponse.json({ message: 'At least one media URL is required' }, { status: 400 });
             // For now, allow listing without images if needed, but maybe enforce later
        }

        // --- Prepare Item Data for Firestore ---
         const itemId = uuidv4(); // Generate a unique ID for the item
         const newItemData = {
            id: itemId, // Store ID within the document too
            sellerId: sellerId,
            title: body.title,
            description: body.description,
            category: body.category,
            price: parseFloat(body.price) || 0,
            location: body.location,
            offersDelivery: body.offersDelivery ?? false,
            acceptsInstallments: body.acceptsInstallments ?? false,
            discountPercentage: body.discountPercentage ?? null,
            mediaUrls: body.mediaUrls ?? [], // Should come from file upload process
            status: 'available', // Initial status
            createdAt: FieldValue.serverTimestamp(), // Use Firestore server timestamp
            updatedAt: FieldValue.serverTimestamp(),
         };

        // --- Save to Firestore ---
        await itemsCollection.doc(itemId).set(newItemData);
        console.log(`API: Created new item in Firestore with ID: ${itemId} by seller: ${sellerId}`);

         // Fetch the newly created doc to return timestamps correctly
        const createdDoc = await itemsCollection.doc(itemId).get();
        const responseData = createdDoc.data();

        return NextResponse.json(responseData, { status: 201 }); // Respond with the created item data

    } catch (error: any) {
        console.error("API Error creating item:", error);
        return NextResponse.json({ message: 'Failed to create item', error: error.message }, { status: 500 });
    }
}
