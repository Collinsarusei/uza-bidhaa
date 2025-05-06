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
// PAYSTACK_PUBLIC_KEY is often used on the client-side for Paystack Inline, not strictly needed here for backend init.
const CALLBACK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'; // Use your app's public URL

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}

const initiateSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
});

// Helper function to mask secrets in logs (can be reused)
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
    // Paystack doesn't strictly need name for init, but email and amount are key
    // const buyerName = session.user.name || 'Customer';
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

        const paymentId = uuidv4(); // This will be our Paystack reference
        const paymentRef = adminDb.collection('payments').doc(paymentId);

        // Amount should be in Kobo for Paystack (multiply by 100 if your price is in KES)
        const amountInKobo = Math.round(itemData.price * 100);

        const paymentDataToStore: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'gatewayTransactionId' | 'gatewayReference' | 'failureReason'> = {
            itemId: itemId,
            buyerId: buyerId,
            sellerId: itemData.sellerId,
            amount: itemData.price, // Store original amount in KES
            currency: 'KES', // Paystack also uses standard currency codes
            status: 'initiated',
            paymentGateway: 'paystack', // Add a field to denote the gateway
        };
        await paymentRef.set({
             ...paymentDataToStore,
             createdAt: FieldValue.serverTimestamp(),
             updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Initiate Payment: Internal payment record ${paymentId} created.`);

        const paystackApiUrl = 'https://api.paystack.com/transaction/initialize';
        // Paystack webhook URL, ensure this is configured in your Paystack dashboard
        const callbackUrlForPaystack = `${CALLBACK_BASE_URL}/api/webhooks/paystack`;

        const paystackPayload = {
            email: buyerEmail,
            amount: amountInKobo, // Amount in Kobo
            currency: 'KES',
            reference: paymentId, // Your unique reference for this transaction
            callback_url: `${CALLBACK_BASE_URL}/order-confirmation/${paymentId}`, // Page user lands on after payment
            // channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'], // Optional: specify channels
            metadata: { // Optional: send custom data
                internal_payment_id: paymentId,
                item_id: itemId,
                buyer_id: buyerId,
                description: `Payment for ${itemData.title}`
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

        const paystackResult = await response.json();

        if (!response.ok || !paystackResult.status || !paystackResult.data?.authorization_url) {
            console.error(`Paystack Initialize Transaction Error (${response.status}):`, paystackResult);
            await paymentRef.update({ 
                status: 'failed', 
                failureReason: `Paystack API Error (${response.status}): ${paystackResult.message || JSON.stringify(paystackResult)}`, 
                updatedAt: FieldValue.serverTimestamp() 
            });
            throw new Error(paystackResult.message || `Paystack API request failed with status ${response.status}`);
        }

         await paymentRef.update({
            // Store Paystack's reference if different, or just use our paymentId as the primary ref.
            // Paystack's main transaction ID is usually available in the webhook.
            gatewayReference: paystackResult.data.reference, // This should match your paymentId
            updatedAt: FieldValue.serverTimestamp(),
         });

        console.log(`Initiate Payment (Paystack): Paystack authorization URL generated: ${paystackResult.data.authorization_url}`);
        console.log("--- API POST /api/payment/initiate (Paystack) SUCCESS ---");

        // Return Paystack's authorization_url for redirection
        return NextResponse.json({ checkoutUrl: paystackResult.data.authorization_url }, { status: 200 });

    } catch (error: any) {
        console.error("API Initiate Payment Error (Paystack):", error);
        return NextResponse.json({ message: 'Failed to initiate payment', error: error.message }, { status: 500 });
    }
}