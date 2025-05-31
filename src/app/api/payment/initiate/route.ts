// src/app/api/payment/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid'; // Still used for Paystack reference if not using Prisma ID for it
import * as z from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// --- Environment Variables & Constants ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '';

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}
if (!APP_BASE_URL) {
    console.error("FATAL: Missing App Base URL (NEXT_PUBLIC_APP_URL).");
}

const paymentInitiateSchema = z.object({
    itemId: z.string().min(1, "Item ID is required"),
    amount: z.number().positive("Amount must be positive"), // This should match item price
});

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/initiate (Prisma) START ---");

    if (!PAYSTACK_SECRET_KEY || !APP_BASE_URL) { 
        console.error("Payment Initiate Error: Paystack Secret Key or App Base URL not configured.");
        return NextResponse.json({ message: 'Server payment configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) { // Ensure email is present for Paystack
        console.warn("Payment Initiate: Unauthorized attempt or missing user email.");
        return NextResponse.json({ message: 'Unauthorized or user email missing' }, { status: 401 });
    }

    const userId = session.user.id; 
    const userEmail = session.user.email; 

    console.log(`Payment Initiate: Authenticated as user ${userId}, email: ${userEmail}`);

    let paymentRecordId: string | null = null; // To store Prisma Payment ID for cleanup on error

    try {
        const body = await req.json();
        const validation = paymentInitiateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { itemId, amount } = validation.data;
        
        const item = await prisma.item.findUnique({
            where: { id: itemId }
        });

        if (!item) {
            return NextResponse.json({ message: 'Item not found.' }, { status: 404 });
        }
        // Validate amount against item price (important!)
        if (!new Decimal(amount).equals(item.price)) {
            console.error(`Payment Initiate: Amount mismatch. Requested: ${amount}, Item Price: ${item.price}`);
            return NextResponse.json({ message: 'Payment amount does not match item price.' }, { status: 400 });
        }
        if (item.status !== 'AVAILABLE') {
            return NextResponse.json({ message: 'Item is no longer available.' }, { status: 400 });
        }
        if (item.sellerId === userId) {
            return NextResponse.json({ message: 'You cannot purchase your own item.' }, { status: 400 });
        }

        const amountInKobo = Math.round(amount * 100);
        console.log(`Payment Initiate: Request for itemId: ${itemId}, amount: ${amount} (Kobo: ${amountInKobo})`);

        // Prisma will generate the payment ID (cuid)
        // We can use a part of this Prisma ID or generate a separate reference for Paystack if needed for idempotency
        const paystackReference = `payment_ref_${uuidv4().replace(/-/g, '')}`.substring(0, 100); // Ensure unique & within Paystack length limits

        const createdPayment = await prisma.payment.create({
            data: {
                buyerId: userId,
                sellerId: item.sellerId,
                itemId: itemId,
                itemTitle: item.title,
                amount: new Decimal(amount),
                currency: 'KES',
                status: 'INITIATED',
                paymentGateway: 'paystack',
                paystackReference: paystackReference,
                // createdAt and updatedAt are handled by Prisma
            }
        });
        paymentRecordId = createdPayment.id; // Store for potential cleanup
        console.log(`Payment Initiate: Payment record ${paymentRecordId} created in Prisma with status 'INITIATED'.`);

        const userCallbackUrl = `${APP_BASE_URL}/item/${itemId}?payment_status=pending&ref=${paystackReference}&paymentId=${paymentRecordId}`;
        console.log(`Payment Initiate: Using callback URL for user redirect: ${userCallbackUrl}`);

        const paystackPayload = {
            email: userEmail,
            amount: amountInKobo,
            currency: 'KES',
            reference: paystackReference,
            callback_url: userCallbackUrl,
            metadata: {
                payment_id_prisma: paymentRecordId, // Use Prisma payment ID in metadata
                user_id: userId,
                item_id: itemId,
                item_name: item.title.substring(0, 50),
                description: `Payment for ${item.title}`.substring(0, 100),
            },
            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'] 
        };

        console.log("Payment Initiate: Calling Paystack Initialize Transaction API.");
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
            await prisma.payment.update({
                where: { id: paymentRecordId },
                data: {
                    status: 'FAILED',
                    // failureReason: paystackResult.message || 'Paystack API error during initialization.', // Add if you have a failureReason field
                }
            });
            return NextResponse.json({ message: paystackResult.message || 'Failed to initialize payment with Paystack.' }, { status: 502 });
        }

        await prisma.payment.update({
            where: { id: paymentRecordId },
            data: {
                status: 'PENDING_CONFIRMATION', // Update status as user is being redirected
                paystackAuthorizationUrl: paystackResult.data.authorization_url,
                paystackAccessCode: paystackResult.data.access_code,
            }
        });
        console.log(`Payment Initiate: Payment ${paymentRecordId} updated with Paystack auth URL. Status: PENDING_CONFIRMATION.`);

        console.log("--- API POST /api/payment/initiate (Prisma) SUCCESS ---");
        return NextResponse.json({
            message: 'Payment initiated successfully. Redirect user to Paystack.',
            authorization_url: paystackResult.data.authorization_url,
            access_code: paystackResult.data.access_code,
            reference: paystackResult.data.reference, // This is paystackReference
            paymentId: paymentRecordId, // Prisma Payment ID
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payment/initiate (Prisma) FAILED --- Catch Block Error:", error);
        if (paymentRecordId) { // If payment record was created, try to mark as failed
            try {
                await prisma.payment.update({
                    where: { id: paymentRecordId },
                    data: { status: 'FAILED' /*, failureReason: 'Internal server error' */ }
                });
            } catch (updateError) {
                console.error("Failed to mark payment as FAILED during catch block:", updateError);
            }
        }
        return NextResponse.json({ message: error.message || 'Failed to initiate payment.' }, { status: 500 });
    }
}
