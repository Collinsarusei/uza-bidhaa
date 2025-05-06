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
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const CALLBACK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
    // Consider throwing an error here or handling it more gracefully if needed for build/startup
}

const initiateSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
});

// Helper function to mask secrets in logs
const maskSecret = (secret: string | undefined): string => {
    if (!secret) return "UNDEFINED";
    if (secret.length < 8) return "******";
    return `${secret.substring(0, 4)}******${secret.substring(secret.length - 4)}`;
}

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/initiate (Paystack) START ---");

    if (!adminDb) {
        console.error("Initiate Payment Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    if (!PAYSTACK_SECRET_KEY) {
         console.error("Initiate Payment Error: Paystack Secret Key environment variable missing.");
        return NextResponse.json({ message: 'Payment gateway configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
        console.warn("Initiate Payment: Unauthorized or missing email.");
        return NextResponse.json({ message: 'Unauthorized or user email missing' }, { status: 401 });
    }
    const buyerId = session.user.id;
    const buyerEmail = session.user.email;
    console.log(`Initiate Payment: Authenticated as buyer ${buyerId}`);

    // Initialize paymentId and paymentRef here for broader scope, especially for the final catch block
    const paymentId = uuidv4();
    const paymentRef = adminDb.collection('payments').doc(paymentId);

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

        const amountInKobo = Math.round(itemData.price * 100);

        const paymentDataToStore: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'gatewayTransactionId' | 'gatewayReference' | 'failureReason'> = {
            itemId: itemId,
            buyerId: buyerId,
            sellerId: itemData.sellerId,
            amount: itemData.price,
            currency: 'KES',
            status: 'initiated',
            paymentGateway: 'paystack',
        };
        await paymentRef.set({
             ...paymentDataToStore,
             id: paymentId, // Ensure 'id' field is explicitly set in the document
             createdAt: FieldValue.serverTimestamp(),
             updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Initiate Payment: Internal payment record ${paymentId} created.`);

        const paystackApiUrl = 'https://api.paystack.co/transaction/initialize';
        const userFacingCallbackUrl = `${CALLBACK_BASE_URL}/order-confirmation/${paymentId}`;

        const paystackPayload = {
            email: buyerEmail,
            amount: amountInKobo,
            currency: 'KES',
            reference: paymentId,
            callback_url: userFacingCallbackUrl,
            metadata: {
                internal_payment_id: paymentId,
                item_id: itemId,
                buyer_id: buyerId,
                description: `Payment for ${itemData.title || 'Item'}`.substring(0, 100)
            }
        };

        console.log("Initiate Payment (Paystack): Sending request to Paystack with Authorization:", maskSecret(PAYSTACK_SECRET_KEY));
        console.log("Initiate Payment (Paystack): Payload:", paystackPayload);

        const response = await fetch(paystackApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paystackPayload)
        });

        // --- START OF THE CRUCIAL DEBUGGING BLOCK ---
        const responseText = await response.text(); // Get response as text first
        console.log("Paystack API Response Status:", response.status);
        // console.log("Paystack API Response Headers:", JSON.stringify(Object.fromEntries(response.headers.entries()))); // Optional: can be verbose
        console.log("Paystack API Response Body (Text):", responseText); // <<< --- THIS IS THE LOG YOU NEED TO CHECK --- >>>

        let paystackResult;
        try {
            paystackResult = JSON.parse(responseText); // Now try to parse the text
        } catch (parseError) {
            console.error("Paystack API Error: Failed to parse Paystack response as JSON.", parseError);
            console.error("Paystack response was HTML or malformed. Body (first 500 chars):", responseText.substring(0, 500));
            // Update Firestore record to failed
            await paymentRef.update({
                status: 'failed',
                failureReason: `Paystack API response not JSON. Status: ${response.status}. Body: ${responseText.substring(0, 200)}`, // Log part of body
                updatedAt: FieldValue.serverTimestamp()
            });
            // Return a proper JSON error from YOUR API
            return NextResponse.json({ message: 'Error communicating with payment gateway: Invalid response format.', details: responseText.substring(0,200) }, { status: 502 }); // 502 Bad Gateway
        }
        // --- END OF THE CRUCIAL DEBUGGING BLOCK ---

        if (!response.ok || !paystackResult.status || !paystackResult.data?.authorization_url) {
            console.error(`Paystack Initialize Transaction Error (${response.status}):`, paystackResult);
            await paymentRef.update({
                status: 'failed',
                failureReason: `Paystack API Error (${response.status}): ${paystackResult.message || JSON.stringify(paystackResult)}`,
                updatedAt: FieldValue.serverTimestamp()
            });
            const errorMessage = paystackResult.message || `Paystack API request failed with status ${response.status}`;
            // Propagate Paystack's status code if it's a client error (4xx)
            const errorStatus = response.status >= 400 && response.status < 500 ? response.status : 502;
            return NextResponse.json({ message: 'Failed to initiate payment with gateway.', error: errorMessage, paystack_response: paystackResult }, { status: errorStatus });
        }

         await paymentRef.update({
            gatewayReference: paystackResult.data.reference, // This should match paymentId
            updatedAt: FieldValue.serverTimestamp(),
         });

        console.log(`Initiate Payment (Paystack): Paystack authorization URL generated: ${paystackResult.data.authorization_url}`);
        console.log("--- API POST /api/payment/initiate (Paystack) SUCCESS ---");

        return NextResponse.json({ checkoutUrl: paystackResult.data.authorization_url }, { status: 200 });

    } catch (error: any) {
        console.error("API Initiate Payment Error (Paystack) in CATCH block:", error);
        // Attempt to update the payment record to 'failed' if an unexpected error occurs
        // after the record has been created but before/during the Paystack call.
        try {
            await paymentRef.update({ // paymentRef is defined in the outer scope
                status: 'failed',
                failureReason: `Internal server error: ${error.message || 'Unknown error'}`,
                updatedAt: FieldValue.serverTimestamp()
            });
        } catch (dbError) {
            console.error("Failed to update payment record to 'failed' in main catch block:", dbError);
            // Log this but proceed to return the original error to the client
        }
        return NextResponse.json({ message: 'Failed to initiate payment', error: error.message }, { status: 500 });
    }
}