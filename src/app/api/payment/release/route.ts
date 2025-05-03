import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route'; // Adjust path if needed
import { adminDb } from '@/lib/firebase-admin'; // Import Firebase Admin
import { FieldValue } from 'firebase-admin/firestore'; // For Timestamps

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
const itemsCollection = adminDb.collection('items');
const usersCollection = adminDb.collection('users');

// --- Intasend API Configuration ---
const INTASEND_PAYOUT_URL = process.env.INTASEND_PAYOUT_API_URL || 'https://sandbox.intasend.com/api/v1/payouts/mpesa/'; // Use specific MPESA Payout URL
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE_KEY = process.env.INTASEND_PUBLISHABLE_KEY; // May still be needed for headers
const PAYOUT_CALLBACK_URL = `${process.env.NEXTAUTH_URL}/api/payment/payout-callback`; // Endpoint for payout status updates

export async function POST(req: Request) {

    // --- Check Environment Variables ---
     if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
        console.error("Payment Release API Error: Intasend API keys are not configured.");
        return NextResponse.json({ message: 'Server configuration error: Payment gateway keys missing.' }, { status: 500 });
    }
    // Payout callback URL is optional for the API call itself, but needed if you want status updates

    let paymentDocRef: FirebaseFirestore.DocumentReference | null = null; // Keep track for potential rollback

    try {
        const body = await req.json();
        console.log("Payment Release API: Received body:", body);
        const { itemId } = body; // Expecting itemId from frontend

        if (!itemId) {
            console.error("Payment Release API: Missing itemId");
            return NextResponse.json({ message: 'Missing item identifier' }, { status: 400 });
        }

        // --- Get Authenticated User ID (Secure Way) ---
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("Payment Release API: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        const buyerId = session.user.id;

        // --- Fetch Payment Record in Firestore ---
        console.log(`Payment Release API: Finding payment for Item ID: ${itemId}, Buyer ID: ${buyerId}`);
        const paymentQuery = paymentsCollection
            .where('itemId', '==', itemId)
            .where('buyerId', '==', buyerId)
            .limit(1);
        const paymentSnapshot = await paymentQuery.get();

        if (paymentSnapshot.empty) {
            console.error(`Payment Release API: Payment record not found in Firestore for Item ID: ${itemId}, Buyer ID: ${buyerId}`);
            return NextResponse.json({ message: 'Payment record not found' }, { status: 404 });
        }
        paymentDocRef = paymentSnapshot.docs[0].ref; // Get reference for updates
        const paymentRecord = paymentSnapshot.docs[0].data();

        // --- Verify Payment Status ---
        if (paymentRecord?.status !== 'escrow') {
            console.warn(`Payment Release API: Payment ${paymentDocRef.id} for item ${itemId} is not in escrow state. Current status: ${paymentRecord?.status}`);
            return NextResponse.json({ message: `Payment is not in a state to be released (${paymentRecord?.status})` }, { status: 400 });
        }

        const sellerId = paymentRecord.sellerId;
        const paymentAmount = paymentRecord.amount;
        const paymentCurrency = paymentRecord.currency || 'KES';

        console.log(`Initiating release for payment ${paymentDocRef.id} for item ${itemId} by buyer ${buyerId} to seller ${sellerId}`);

        // --- Fetch Seller Payout Details from Firestore ---
         console.log(`Payment Release API: Fetching seller details for ID ${sellerId}`);
         const sellerDoc = await usersCollection.doc(sellerId).get();
         if (!sellerDoc.exists) {
              console.error(`Payment Release API: Seller user document not found for ID: ${sellerId}`);
              return NextResponse.json({ message: 'Seller account details not found. Cannot process release.' }, { status: 500 });
         }
         const sellerDetails = sellerDoc.data();
         // !! IMPORTANT: Fetch the correct payout field (e.g., 'mpesaPhoneNumber', 'bankAccountNumber') !!
         const payoutAccount = sellerDetails?.mpesaPhoneNumber; // Assumes M-Pesa for now
         const sellerName = sellerDetails?.name || 'Seller'; // Get seller name

         if (!payoutAccount) {
            console.error(`Payment Release API: Seller (${sellerId}) payout details (M-Pesa number) not found or incomplete in user document.`);
            return NextResponse.json({ message: 'Seller payout information is missing. Cannot process release.' }, { status: 500 });
         }
         // Format phone number for M-Pesa
         const formattedPhoneNumber = payoutAccount.startsWith('254') ? payoutAccount : `254${payoutAccount.slice(-9)}`;

        // --- Update Payment Status to 'Releasing' ---
        console.log(`Payment Release API: Updating payment ${paymentDocRef.id} status to 'releasing'`);
        await paymentDocRef.update({
             status: 'releasing',
             updatedAt: FieldValue.serverTimestamp()
        });

        // --- Prepare Intasend Payout Payload ---
         // Fetch item title for narrative (optional but good)
         let itemTitle = 'Item';
         try {
             const itemDoc = await itemsCollection.doc(itemId).get();
             if (itemDoc.exists) itemTitle = itemDoc.data()?.title || 'Item';
         } catch (itemFetchError) { console.error("Error fetching item title for narrative:", itemFetchError); }


        const payoutPayload = {
            currency: paymentCurrency,
            transactions: [
                {
                    name: sellerName,
                    account: formattedPhoneNumber,
                    amount: paymentAmount,
                    narrative: `Payout for ${itemTitle} (ID: ${itemId})`, // Use fetched title
                }
            ],
             callback_url: PAYOUT_CALLBACK_URL, // Use defined payout callback URL
        };

         const intasendHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTASEND_SECRET_KEY}`,
            'INTASEND_API_KEY': INTASEND_PUBLISHABLE_KEY
        };

        console.log("Calling Intasend Payout API...");
        // --- Actual Call to Intasend Payout API ---
        const response = await fetch(INTASEND_PAYOUT_URL, {
            method: 'POST',
            headers: intasendHeaders,
            body: JSON.stringify(payoutPayload),
        });

         const intasendPayoutResponse = await response.json();

         if (!response.ok) {
             console.error(`Intasend Payout API Error (${response.status}):`, intasendPayoutResponse);
              // If payout fails, update payment status to 'release_failed'
             await paymentDocRef.update({
                  status: 'release_failed',
                  payoutFailureReason: intasendPayoutResponse?.error || intasendPayoutResponse?.detail || `API Error: ${response.statusText}`,
                  updatedAt: FieldValue.serverTimestamp()
              });
             const errorMessage = intasendPayoutResponse?.error || intasendPayoutResponse?.detail || `Payout gateway error: ${response.statusText}`;
             throw new Error(errorMessage);
         }

         console.log("Intasend Payout Initiation Response:", intasendPayoutResponse);

        // --- Update Payment Status to 'Payout Initiated' ---
        // Store the Intasend payout transaction ID if available in response
         const payoutTransactionId = intasendPayoutResponse?.transactions?.[0]?.transaction_id || intasendPayoutResponse?.reference; // Adjust based on actual response structure
         await paymentDocRef.update({
              status: 'payout_initiated',
              intasendPayoutId: payoutTransactionId || null, // Store Intasend's ID for this payout
              updatedAt: FieldValue.serverTimestamp()
         });
         console.log(`Payment Release API: Payment ${paymentDocRef.id} status updated to 'payout_initiated'. Payout ID: ${payoutTransactionId}`);

        // --- Update Item Status to 'Sold' ---
        console.log(`Payment Release API: Updating item ${itemId} status to 'sold'`);
        await itemsCollection.doc(itemId).update({
             status: 'sold',
             updatedAt: FieldValue.serverTimestamp()
        });

        // --- Return Success Response ---
        return NextResponse.json({ message: 'Payment release initiated successfully', payoutDetails: intasendPayoutResponse }, { status: 200 });

    } catch (error: any) {
        console.error('Payment Release API Error:', error);
         // Attempt to mark payment as failed if an error occurred after 'releasing'
         if (paymentDocRef) {
             try {
                  await paymentDocRef.update({
                     status: 'release_failed',
                     payoutFailureReason: error.message || 'Unknown error during release process',
                     updatedAt: FieldValue.serverTimestamp()
                  });
             } catch (rollbackError) {
                  console.error("Error attempting to rollback payment status:", rollbackError);
             }
         }
        return NextResponse.json({ message: error.message || 'Failed to initiate payment release' }, { status: 500 });
    }
}
