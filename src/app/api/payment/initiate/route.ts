import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin'; // Import Firebase Admin
import { FieldValue } from 'firebase-admin/firestore'; // For Timestamps
import { v4 as uuidv4 } from 'uuid'; // For payment ID

// --- Intasend API Configuration ---
const INTASEND_CHECKOUT_URL = process.env.INTASEND_API_URL || 'https://sandbox.intasend.com/api/v1/checkout/';
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE_KEY = process.env.INTASEND_PUBLISHABLE_KEY;
const CALLBACK_BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'; // Default for local dev

// --- Firestore Collections ---
const itemsCollection = adminDb.collection('items');
const paymentsCollection = adminDb.collection('payments');

export async function POST(req: Request) {

    // --- Check Environment Variables ---
    if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
        console.error("Payment Initiation API Error: Intasend API keys are not configured in environment variables.");
        return NextResponse.json({ message: 'Server configuration error: Payment gateway keys missing.' }, { status: 500 });
    }
    if (!CALLBACK_BASE_URL) {
         console.error("Payment Initiation API Error: NEXTAUTH_URL environment variable is not set.");
         return NextResponse.json({ message: 'Server configuration error: Base URL missing.' }, { status: 500 });
    }

    try {
        const body = await req.json();
        console.log("Payment Initiation API: Received body:", body);
        const { itemId } = body;

        if (!itemId) {
            console.error("Payment Initiation API: Missing itemId");
            return NextResponse.json({ message: 'Missing item ID' }, { status: 400 });
        }

        // --- Get Authenticated User ID (Secure Way) ---
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("Payment Initiation API: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const buyerId = session.user.id;
        const buyerEmail = session.user.email; // Get buyer email from session if available

        // --- Fetch Item Details from Firestore ---
        console.log(`Payment Initiation API: Fetching item ${itemId} from Firestore.`);
        const itemDoc = await itemsCollection.doc(itemId).get();

        if (!itemDoc.exists) {
            console.error(`Payment Initiation API: Item not found in Firestore for ID: ${itemId}`);
            return NextResponse.json({ message: 'Item not found' }, { status: 404 });
        }
        const item = itemDoc.data();
        if (!item) {
            // Should not happen if itemDoc.exists is true, but good practice
            console.error(`Payment Initiation API: Item data is missing for ID: ${itemId}`);
             return NextResponse.json({ message: 'Item data unavailable' }, { status: 500 });
        }

         // Check if item is available for purchase
         if (item.status !== 'available') {
              console.warn(`Payment Initiation API: Item ${itemId} is not available for purchase (status: ${item.status}).`);
              return NextResponse.json({ message: `Item is no longer available (${item.status})` }, { status: 400 });
         }


        // Ensure the buyer is not the seller
        if (item.sellerId === buyerId) {
            console.warn(`Payment Initiation API: Seller (User ID: ${buyerId}) attempted to pay for their own item (${itemId})`);
            return NextResponse.json({ message: 'Cannot pay for your own item' }, { status: 400 });
        }

        console.log(`Initiating payment for Item: ${item.title}, Amount: ${item.price}, Buyer: ${buyerId}, Seller: ${item.sellerId}`);

        // --- Prepare Intasend Checkout Payload ---
         const paymentRef = `Order_${itemId}_${buyerId}_${Date.now()}`; // Store this ref
         const paymentId = uuidv4(); // Generate unique internal payment ID

        const intasendPayload = {
            public_key: INTASEND_PUBLISHABLE_KEY,
            currency: 'KES',
            amount: item.price,
            email: buyerEmail || undefined,
            ref: paymentRef, // Use the generated unique reference
            callback_url: `${CALLBACK_BASE_URL}/api/payment/callback`,
            redirect_url: `${CALLBACK_BASE_URL}/messages?sellerId=${item.sellerId}&itemId=${itemId}&payment_status=success`,
            cancel_url: `${CALLBACK_BASE_URL}/messages?sellerId=${item.sellerId}&itemId=${itemId}&payment_status=cancelled`,
            metadata: JSON.stringify({ // Metadata should be a JSON string
                item_id: itemId,
                buyer_id: buyerId,
                seller_id: item.sellerId,
                internal_payment_id: paymentId, // Include our internal payment ID
                description: `Payment for ${item.title}`
            }),
        };

        const intasendHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTASEND_SECRET_KEY}`,
            'INTASEND_API_KEY': INTASEND_PUBLISHABLE_KEY
        };

        console.log("Calling Intasend Checkout API...");
        // --- Actual Call to Intasend API ---
        const response = await fetch(INTASEND_CHECKOUT_URL, {
            method: 'POST',
            headers: intasendHeaders,
            body: JSON.stringify(intasendPayload),
        });

        const intasendResponse = await response.json();

        if (!response.ok) {
             console.error(`Intasend API Error (${response.status}):`, intasendResponse);
            const errorMessage = intasendResponse?.detail || intasendResponse?.error || `Payment gateway error: ${response.statusText}`;
            throw new Error(errorMessage);
        }

        console.log("Intasend API Response:", intasendResponse);

        if (!intasendResponse.url || !intasendResponse.invoice_id) {
             console.error("Intasend response missing required fields (url or invoice_id).", intasendResponse);
             throw new Error("Invalid response received from payment gateway.");
        }

        // --- Store Payment Intent in Firestore ---
        console.log(`Saving payment intent to Firestore for item ${itemId}, buyer ${buyerId}, Intasend invoice ${intasendResponse.invoice_id}`);
        const paymentData = {
            id: paymentId, // Store internal ID
            itemId: itemId,
            buyerId: buyerId,
            sellerId: item.sellerId,
            amount: item.price,
            currency: 'KES',
            status: 'initiated', // Initial status
            intasendInvoiceId: intasendResponse.invoice_id,
            intasendRef: paymentRef, // Store the reference sent to Intasend
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };
        await paymentsCollection.doc(paymentId).set(paymentData);
         console.log(`Payment intent ${paymentId} saved successfully.`);

        // --- Return Redirect URL to Frontend ---
        return NextResponse.json({ redirectUrl: intasendResponse.url }, { status: 200 });

    } catch (error: any) {
        console.error('Payment Initiation API Error:', error);
        return NextResponse.json({ message: error.message || 'Failed to initiate payment' }, { status: 500 });
    }
}
