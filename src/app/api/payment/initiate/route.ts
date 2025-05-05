// src/app/api/payment/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';
import { Item, Payment } from '@/lib/types';

// --- Environment Variables --- 
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_INTASEND_PUBLISHABLE_KEY; 
const INTASEND_WALLET_ID = process.env.INTASEND_WALLET_ID; // This might be unset in Sandbox
const CALLBACK_BASE_URL = process.env.CALLBACK_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';

// Only check for SECRET key as critical, wallet ID might be optional in Sandbox
if (!INTASEND_SECRET_KEY) {
    console.error("FATAL: Missing IntaSend Secret Key environment variable.");
}

const initiateSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
});

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/initiate START ---");

    if (!adminDb) {
        console.error("Initiate Payment Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    // Check only for secret key here
    if (!INTASEND_SECRET_KEY) {
         console.error("Initiate Payment Error: IntaSend Secret Key environment variable missing.");
        return NextResponse.json({ message: 'Payment gateway configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
        console.warn("Initiate Payment: Unauthorized or missing email.");
        return NextResponse.json({ message: 'Unauthorized or user email missing' }, { status: 401 });
    }
    const buyerId = session.user.id;
    const buyerEmail = session.user.email;
    const buyerName = session.user.name || 'Customer';
    console.log(`Initiate Payment: Authenticated as buyer ${buyerId}`);

    try {
        let body;
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 }); }
        
        const validation = initiateSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { itemId } = validation.data;
        console.log(`Initiate Payment: Request for itemId: ${itemId}`);

        const itemRef = adminDb.collection('items').doc(itemId);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) {
             console.warn(`Initiate Payment: Item ${itemId} not found.`);
             return NextResponse.json({ message: 'Item not found' }, { status: 404 });
        }
        const itemData = itemDoc.data() as Item;

        if (itemData.status !== 'available') {
            console.warn(`Initiate Payment: Item ${itemId} is not available (status: ${itemData.status}).`);
            return NextResponse.json({ message: `Item is not available for purchase (status: ${itemData.status})` }, { status: 400 });
        }
        if (itemData.sellerId === buyerId) {
            console.warn(`Initiate Payment: Buyer ${buyerId} attempted to buy own item ${itemId}.`);
            return NextResponse.json({ message: 'You cannot buy your own item' }, { status: 400 });
        }

        const paymentId = uuidv4();
        const paymentRef = adminDb.collection('payments').doc(paymentId);
        const paymentData: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'intasendInvoiceId' | 'intasendTrackingId' | 'failureReason'> = {
            itemId: itemId,
            buyerId: buyerId,
            sellerId: itemData.sellerId,
            amount: itemData.price,
            currency: 'KES',
            status: 'initiated',
        };
        await paymentRef.set({
             ...paymentData,
             createdAt: FieldValue.serverTimestamp(),
             updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Initiate Payment: Internal payment record ${paymentId} created.`);

        const intasendApiUrl = 'https://api.intasend.com/api/v1/checkout/';
        const callbackUrl = CALLBACK_BASE_URL.startsWith('http') ? `${CALLBACK_BASE_URL}/api/payment/callback` : `https://${CALLBACK_BASE_URL}/api/payment/callback`;

        const checkoutPayload: any = {
            public_key: INTASEND_PUBLISHABLE_KEY, 
            first_name: buyerName.split(' ')[0] || 'Buyer',
            last_name: buyerName.split(' ').slice(1).join(' ') || 'User',
            email: buyerEmail,
            host: callbackUrl, 
            amount: itemData.price,
            currency: 'KES', 
            api_ref: paymentId, 
        };

        // --- Conditionally add wallet_id --- 
        if (INTASEND_WALLET_ID) {
            checkoutPayload.wallet_id = INTASEND_WALLET_ID;
            console.log(`Initiate Payment: Using Wallet ID: ${INTASEND_WALLET_ID}`);
        } else {
             console.log("Initiate Payment: INTASEND_WALLET_ID not set, proceeding without it (likely Sandbox).");
        }
        // ------------------------------------

        console.log("Initiate Payment: Calling IntaSend Create Checkout with payload:", checkoutPayload);

        const response = await fetch(intasendApiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${INTASEND_SECRET_KEY}`
            },
            body: JSON.stringify(checkoutPayload)
        });

        const intasendResult = await response.json();

        if (!response.ok || !intasendResult.url) {
            console.error("IntaSend Create Checkout Error:", intasendResult);
            await paymentRef.update({ status: 'failed', failureReason: `IntaSend API Error: ${intasendResult.detail || response.statusText}`, updatedAt: FieldValue.serverTimestamp() });
            throw new Error(intasendResult.detail || `IntaSend API request failed with status ${response.status}`);
        }

         await paymentRef.update({
            intasendInvoiceId: intasendResult.invoice_id,
             updatedAt: FieldValue.serverTimestamp(),
         });

        console.log(`Initiate Payment: IntaSend checkout URL generated: ${intasendResult.url}`);
        console.log("--- API POST /api/payment/initiate SUCCESS ---");

        return NextResponse.json({ checkoutUrl: intasendResult.url }, { status: 200 });

    } catch (error: any) {
        console.error("API Initiate Payment Error:", error);
        return NextResponse.json({ message: 'Failed to initiate payment', error: error.message }, { status: 500 });
    }
}
