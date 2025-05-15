// src/app/api/items/route.ts
import { NextResponse } from 'next/server';
import type { Item } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../auth/[...nextauth]/route';
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from '@/lib/notifications';

// Helper to safely convert Firestore Admin Timestamp to ISO string or return null
const adminTimestampToISOStringOrNull = (timestamp: any): string | null => {
    if (timestamp instanceof AdminTimestamp) {
        try {
            return timestamp.toDate().toISOString();
        } catch (e) {
            console.error("Error converting admin timestamp to ISO string:", e);
            return null;
        }
    }
    if (typeof timestamp === 'string') {
        try {
            if (new Date(timestamp).toISOString() === timestamp) {
                return timestamp;
            }
        } catch (e) { /* ignore */ }
    }
    return null;
};


// GET /api/items - Fetch items from Firestore with optional filtering
export async function GET(request: Request) {
    if (!adminDb) {
        console.error("API /api/items GET Error: Firebase Admin DB is not initialized. adminDb is null.");
        return NextResponse.json({ message: "Server configuration error: Database not available." }, { status: 500 });
    }
    const itemsCollection = adminDb.collection('items');

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
            const itemData = itemDoc.data();
            if (itemData) {
                const processedItem = {
                    ...itemData,
                    id: itemDoc.id,
                    createdAt: adminTimestampToISOStringOrNull(itemData.createdAt),
                    updatedAt: adminTimestampToISOStringOrNull(itemData.updatedAt),
                };
                return NextResponse.json([processedItem], { status: 200 });
            }
            return NextResponse.json({ message: "Item data malformed" }, { status: 500 });

        } else if (sellerIdToInclude) {
            console.log(`API: Filtering items to include only seller ID: ${sellerIdToInclude}`);
            query = query.where('sellerId', '==', sellerIdToInclude).orderBy('createdAt', 'desc');
        } else if (userIdToExclude) {
            console.log(`API: Filtering items to exclude user ID: ${userIdToExclude}`);
            query = query.where('status', '==', 'available').orderBy('createdAt', 'desc');
        } else {
             console.log(`API: Fetching all available items.`);
             query = query.where('status', '==', 'available').orderBy('createdAt', 'desc');
        }

        const snapshot = await query.get();
        let itemsData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: adminTimestampToISOStringOrNull(data.createdAt),
                updatedAt: adminTimestampToISOStringOrNull(data.updatedAt),
            } as Item;
        });

        if (userIdToExclude && !sellerIdToInclude && !itemIdToFetch) {
             itemsData = itemsData.filter(item => item.sellerId !== userIdToExclude);
             console.log(`API: Found ${itemsData.length} items after excluding user ID: ${userIdToExclude}.`);
        } else if (!itemIdToFetch) {
             console.log(`API: Found ${itemsData.length} items matching query.`);
        }

        return NextResponse.json(itemsData);

    } catch (error: any) {
        console.error("API Error fetching items:", error);
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
            console.error("Firestore index missing for items query. Check required indexes based on query type (status/createdAt or sellerId/createdAt).");
            return NextResponse.json({ message: 'Database query failed. Index potentially missing.', details: error.message }, { status: 500 });
        }
        return NextResponse.json({ message: 'Failed to fetch items', error: error.message }, { status: 500 });
    }
}


// POST /api/items - Create a new item in Firestore
export async function POST(request: Request) {
    if (!adminDb) {
        console.error("API /api/items POST Error: Firebase Admin DB is not initialized. adminDb is null.");
        return NextResponse.json({ message: "Server configuration error: Database not available." }, { status: 500 });
    }
    const itemsCollection = adminDb.collection('items');
    console.log("API: Attempting to create item in Firestore");

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        console.warn("API Create Item: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const sellerId = session.user.id;

    try {
        const body = await request.json();
        console.log("API: Received item data for creation:", body);

        const requiredFields = ['title', 'description', 'price', 'category', 'location', 'quantity'];
        const missingFields = requiredFields.filter(field => !(field in body) || body[field] === undefined || body[field] === null || body[field] === '');

        if (missingFields.length > 0) {
            console.log(`API Create Item: Missing required fields: ${missingFields.join(', ')}`);
            return NextResponse.json({ message: `Missing required fields: ${missingFields.join(', ')}` }, { status: 400 });
        }

        const quantity = parseInt(body.quantity);
        if (isNaN(quantity) || quantity <= 0) {
            return NextResponse.json({ message: 'Invalid quantity. Must be a number greater than 0.'}, { status: 400 });
        }

        const itemId = uuidv4();
         const newItemData = {
            id: itemId,
            sellerId: sellerId,
            title: body.title,
            description: body.description,
            category: body.category,
            price: parseFloat(body.price) || 0,
            quantity: quantity,
            location: body.location,
            offersDelivery: body.offersDelivery ?? false,
            acceptsInstallments: body.acceptsInstallments ?? false,
            discountPercentage: body.discountPercentage ?? null,
            mediaUrls: body.mediaUrls ?? [],
            status: 'available',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
         };

        await itemsCollection.doc(itemId).set(newItemData);
        console.log(`API: Created new item in Firestore with ID: ${itemId} by seller: ${sellerId} with quantity: ${quantity}`);

        try {
            await createNotification({
                userId: sellerId,
                type: 'item_listed',
                message: `Your item "${body.title}" (x${quantity}) has been successfully listed!`,
                relatedItemId: itemId,
            });
        } catch (notificationError) {
             console.error("Failed to create notification after listing item:", notificationError);
        }

        const createdDoc = await itemsCollection.doc(itemId).get();
        const responseData = createdDoc.data();

        if (responseData) {
            const processedResponse = {
                ...responseData,
                createdAt: adminTimestampToISOStringOrNull(responseData.createdAt),
                updatedAt: adminTimestampToISOStringOrNull(responseData.updatedAt),
            };
            return NextResponse.json(processedResponse, { status: 201 });
        }
        return NextResponse.json({ message: "Failed to retrieve created item data"}, { status: 500});

    } catch (error: any) {
        console.error("API Error creating item:", error);
        return NextResponse.json({ message: 'Failed to create item', error: error.message }, { status: 500 });
    }
}