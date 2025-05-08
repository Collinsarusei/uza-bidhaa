// src/app/api/payment/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Item, Payment, UserProfile } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod';

// --- Environment Variables & Constants ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
// This webhook URL is correct for Paystack to SEND events TO, but NOT for user redirect.
// const PLATFORM_WEBHOOK_URL_PAYSTACK = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/paystack` : '';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '';

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}
if (!APP_BASE_URL) {
    console.error("FATAL: Missing App Base URL (NEXT_PUBLIC_APP_URL).");
}

const paymentInitiateSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
    amount: z.number().positive("Amount must be positive"),
});

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/initiate START ---");

    if (!adminDb) { 
        console.error("Payment Initiate Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    if (!PAYSTACK_SECRET_KEY || !APP_BASE_URL) { 
        console.error("Payment Initiate Error: Paystack Secret Key or App Base URL not configured.");
        return NextResponse.json({ message: 'Server payment configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) { 
        console.warn("Payment Initiate: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const userId = session!.user!.id; 
    const userName = session!.user!.name || 'User'; 
    const userEmail = session!.user!.email; 

    console.log(`Payment Initiate: Authenticated as user ${userId}, email: ${userEmail}`);

    try {
        const body = await req.json();
        const validation = paymentInitiateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { itemId, amount } = validation.data;
        const amountInKobo = Math.round(amount * 100);

        console.log(`Payment Initiate: Request for itemId: ${itemId}, amount: ${amount} (Kobo: ${amountInKobo})`);

        const itemRef = adminDb!.collection('items').doc(itemId);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) {
            return NextResponse.json({ message: 'Item not found.' }, { status: 404 });
        }
        const itemData = itemDoc.data() as Item;
        if (itemData.status !== 'available') {
            return NextResponse.json({ message: 'Item is no longer available.' }, { status: 400 });
        }
        if (itemData.sellerId === userId) {
            return NextResponse.json({ message: 'You cannot purchase your own item.' }, { status: 400 });
        }

        const paymentId = uuidv4();
        const paystackReference = `payment_${paymentId}`;

        // Construct the correct callback URL for user redirect (back to item page)
        const userCallbackUrl = `${APP_BASE_URL}/item/${itemId}?payment_status=pending&ref=${paystackReference}`;
        console.log(`Payment Initiate: Using callback URL for user redirect: ${userCallbackUrl}`);

        const paymentData: Payment = {
            id: paymentId,
            buyerId: userId,
            sellerId: itemData.sellerId,
            itemId: itemId,
            itemTitle: itemData.title, 
            amount: amount,
            currency: 'KES', 
            status: 'initiated',
            paymentGateway: 'paystack',
            paystackReference: paystackReference,
            createdAt: FieldValue.serverTimestamp() as any, 
            updatedAt: FieldValue.serverTimestamp() as any, 
        };
        await adminDb!.collection('payments').doc(paymentId).set(paymentData);
        console.log(`Payment Initiate: Payment record ${paymentId} created in Firestore with status 'initiated'.`);

        const paystackPayload = {
            email: userEmail,
            amount: amountInKobo,
            currency: 'KES',
            reference: paystackReference,
            callback_url: userCallbackUrl, // Use the user-facing URL here
            metadata: {
                payment_id: paymentId,
                user_id: userId,
                item_id: itemId,
                item_name: itemData.title.substring(0, 50), 
                description: `Payment for ${itemData.title}`.substring(0, 100),
            },
            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'] 
        };

        console.log("Payment Initiate: Calling Paystack Initialize Transaction API with payload:", paystackPayload);

        const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paystackPayload),
        });

        const paystackResult = await paystackResponse.json();

        if (!paystackResponse.ok || !paystackResult.status) {
            console.error("Paystack Initialize Transaction Error:", paystackResult);
            await adminDb!.collection('payments').doc(paymentId).update({
                status: 'failed',
                failureReason: paystackResult.message || 'Paystack API error during initialization.',
                updatedAt: FieldValue.serverTimestamp(),
            });
            return NextResponse.json({ message: paystackResult.message || 'Failed to initialize payment with Paystack.' }, { status: 502 });
        }

        await adminDb!.collection('payments').doc(paymentId).update({
            status: 'initiated',
            paystackAuthorizationUrl: paystackResult.data.authorization_url, 
            paystackAccessCode: paystackResult.data.access_code, 
            updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`Payment Initiate: Payment ${paymentId} updated with Paystack auth URL. Status: 'initiated'.`);

        console.log("--- API POST /api/payment/initiate SUCCESS ---");
        return NextResponse.json({
            message: 'Payment initiated successfully. Redirect user to Paystack.',
            authorization_url: paystackResult.data.authorization_url,
            access_code: paystackResult.data.access_code,
            reference: paystackResult.data.reference,
            paymentId: paymentId,
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payment/initiate FAILED --- Catch Block Error:", error);
        return NextResponse.json({ message: error.message || 'Failed to initiate payment.' }, { status: 500 });
    }
}
