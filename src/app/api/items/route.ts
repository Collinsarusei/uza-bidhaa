import { NextResponse } from 'next/server';
import type { Item } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from '@/lib/notifications'; // Import the helper

const itemsCollection = adminDb.collection('items');

// GET /api/items - Fetch items from Firestore with optional filtering
export async function GET(request: Request) {
    console.log("API: Fetching items from Firestore");
    const { searchParams } = new URL(request.url);
    const userIdToExclude = searchParams.get('userId');
    const sellerIdToInclude = searchParams.get('sellerId');
    const itemIdToFetch = searchParams.get('itemId');

    try {
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = itemsCollection;

        if (itemIdToFetch) {
            console.log(`API: Fetching single item by ID: ${itemIdToFetch}`);
            const itemDoc = await itemsCollection.doc(itemIdToFetch).get();
            if (!itemDoc.exists) {
                return NextResponse.json({ message: "Item not found" }, { status: 404 });
            }
            return NextResponse.json([itemDoc.data()], { status: 200 });
        } else if (sellerIdToInclude) {
            console.log(`API: Filtering items to include only seller ID: ${sellerIdToInclude}`);
            // Firestore index needed: sellerId ASC, createdAt DESC
            query = query.where('sellerId', '==', sellerIdToInclude).orderBy('createdAt', 'desc');
        } else if (userIdToExclude) {
            console.log(`API: Filtering items to exclude user ID: ${userIdToExclude}`);
            // Firestore index needed: status ASC, createdAt DESC
            // Fetch available items NOT belonging to the user
            query = query.where('status', '==', 'available').orderBy('createdAt', 'desc');
            // Filtering out the user's own items happens later in code
        } else {
             console.log(`API: Fetching all available items.`);
             // Firestore index needed: status ASC, createdAt DESC
             query = query.where('status', '==', 'available').orderBy('createdAt', 'desc');
        }

        const snapshot = await query.get();
        let itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Item[];

        // Apply exclusion filter in code if needed (for homepage)
        if (userIdToExclude && !sellerIdToInclude && !itemIdToFetch) {
             itemsData = itemsData.filter(item => item.sellerId !== userIdToExclude);
             console.log(`API: Found ${itemsData.length} items after excluding user ID: ${userIdToExclude}.`);
        } else if (!itemIdToFetch) {
             console.log(`API: Found ${itemsData.length} items matching query.`);
        }

        return NextResponse.json(itemsData);

    } catch (error: any) {
        console.error("API Error fetching items:", error);
        // Check for missing index error specifically
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
            console.error("Firestore index missing for items query. Check required indexes based on query type (status/createdAt or sellerId/createdAt).");
            return NextResponse.json({ message: 'Database query failed. Index potentially missing.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to fetch items', error: error.message }, { status: 500 });
    }
}


// POST /api/items - Create a new item in Firestore
export async function POST(request: Request) {
    console.log("API: Attempting to create item in Firestore");

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        console.warn("API Create Item: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const sellerId = session.user.id;

    // --- TODO: Check KYC Status --- 

    try {
        const body = await request.json();
        console.log("API: Received item data for creation:", body);

        const requiredFields = ['title', 'description', 'price', 'category', 'location'];
        const missingFields = requiredFields.filter(field => !(field in body) || !body[field]);

        if (missingFields.length > 0) {
            console.log(`API Create Item: Missing required fields: ${missingFields.join(', ')}`);
            return NextResponse.json({ message: `Missing required fields: ${missingFields.join(', ')}` }, { status: 400 });
        }

        const itemId = uuidv4();
         const newItemData = {
            id: itemId,
            sellerId: sellerId,
            title: body.title,
            description: body.description,
            category: body.category,
            price: parseFloat(body.price) || 0,
            location: body.location,
            offersDelivery: body.offersDelivery ?? false,
            acceptsInstallments: body.acceptsInstallments ?? false,
            discountPercentage: body.discountPercentage ?? null,
            mediaUrls: body.mediaUrls ?? [],
            status: 'available', // Initial status
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
         };

        await itemsCollection.doc(itemId).set(newItemData);
        console.log(`API: Created new item in Firestore with ID: ${itemId} by seller: ${sellerId}`);

        // --- Create Notification for Seller --- 
        try {
            await createNotification({
                userId: sellerId,
                type: 'item_listed',
                message: `Your item "${body.title}" has been successfully listed!`,
                relatedItemId: itemId,
            });
        } catch (notificationError) {
             console.error("Failed to create notification after listing item:", notificationError);
             // Decide if this failure should affect the API response
        }
        // --- End Notification --- 

        const createdDoc = await itemsCollection.doc(itemId).get();
        const responseData = createdDoc.data();

        return NextResponse.json(responseData, { status: 201 });

    } catch (error: any) {
        console.error("API Error creating item:", error);
        return NextResponse.json({ message: 'Failed to create item', error: error.message }, { status: 500 });
    }
}
