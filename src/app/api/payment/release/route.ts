import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, UpdateData } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import type { Payment } from '@/lib/types'; // Import Payment type

// --- Firestore Collections ---
const paymentsCollection = adminDb.collection('payments');
const itemsCollection = adminDb.collection('items');
const usersCollection = adminDb.collection('users');

// --- Intasend API Configuration ---
const INTASEND_PAYOUT_URL = process.env.INTASEND_PAYOUT_API_URL || 'https://sandbox.intasend.com/api/v1/payouts/mpesa/';
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE_KEY = process.env.INTASEND_PUBLISHABLE_KEY;
const PAYOUT_CALLBACK_URL = `${process.env.NEXTAUTH_URL}/api/payment/payout-callback`;

export async function POST(req: Request) {

    if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
        console.error("Payment Release API Error: Intasend API keys are not configured.");
        return NextResponse.json({ message: 'Server configuration error: Payment gateway keys missing.' }, { status: 500 });
    }

    let paymentDocRef: FirebaseFirestore.DocumentReference | null = null;
    let itemId: string | null = null;
    let sellerId: string | null = null;
    let buyerId: string | null = null;

    try {
        const body = await req.json();
        console.log("Payment Release API: Received body:", body);
        itemId = body.itemId;

        if (!itemId) {
            console.error("Payment Release API: Missing itemId");
            return NextResponse.json({ message: 'Missing item identifier' }, { status: 400 });
        }

        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            console.warn("Payment Release API: Unauthorized access attempt.");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }
        buyerId = session.user.id;

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
        paymentDocRef = paymentSnapshot.docs[0].ref;
        const paymentRecord = paymentSnapshot.docs[0].data() as Payment;

        if (paymentRecord?.status !== 'escrow') {
            console.warn(`Payment Release API: Payment ${paymentDocRef.id} for item ${itemId} is not in escrow state. Current status: ${paymentRecord?.status}`);
            return NextResponse.json({ message: `Payment is not in a state to be released (${paymentRecord?.status})` }, { status: 400 });
        }

        sellerId = paymentRecord.sellerId; // Assign to outer scope
        const paymentAmount = paymentRecord.amount;
        const paymentCurrency = paymentRecord.currency || 'KES';

        // Check if sellerId is valid before proceeding
        if (!sellerId) {
             console.error(`Payment Release API: Seller ID is missing in the payment record ${paymentDocRef.id}. Cannot proceed.`);
             return NextResponse.json({ message: 'Internal error: Seller information missing in payment record.' }, { status: 500 });
        }

        console.log(`Initiating release for payment ${paymentDocRef.id} for item ${itemId} by buyer ${buyerId} to seller ${sellerId}`);

        console.log(`Payment Release API: Fetching seller details for ID ${sellerId}`);
         // Corrected: Use the non-null sellerId
         const sellerDoc = await usersCollection.doc(sellerId).get();
         if (!sellerDoc.exists) {
              console.error(`Payment Release API: Seller user document not found for ID: ${sellerId}`);
              return NextResponse.json({ message: 'Seller account details not found. Cannot process release.' }, { status: 500 });
         }
         const sellerDetails = sellerDoc.data();
         const payoutAccount = sellerDetails?.mpesaPhoneNumber;
         const sellerName = sellerDetails?.name || 'Seller';

         if (!payoutAccount) {
            console.error(`Payment Release API: Seller (${sellerId}) payout details (M-Pesa number) not found or incomplete in user document.`);
            return NextResponse.json({ message: 'Seller payout information is missing. Cannot process release.' }, { status: 500 });
         }
         const formattedPhoneNumber = payoutAccount.startsWith('254') ? payoutAccount : `254${payoutAccount.slice(-9)}`;

        console.log(`Payment Release API: Updating payment ${paymentDocRef.id} status to 'releasing'`);
        await paymentDocRef.update({
             status: 'releasing',
             updatedAt: FieldValue.serverTimestamp()
        });

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
                    narrative: `Payout for ${itemTitle} (ID: ${itemId})`,
                }
            ],
             callback_url: PAYOUT_CALLBACK_URL,
        };

         const intasendHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTASEND_SECRET_KEY}`,
            'INTASEND_API_KEY': INTASEND_PUBLISHABLE_KEY
        };

        console.log("Calling Intasend Payout API...");
        const response = await fetch(INTASEND_PAYOUT_URL, {
            method: 'POST',
            headers: intasendHeaders,
            body: JSON.stringify(payoutPayload),
        });

         const intasendPayoutResponse = await response.json();

         if (!response.ok) {
             console.error(`Intasend Payout API Error (${response.status}):`, intasendPayoutResponse);
             await paymentDocRef.update({
                  status: 'release_failed',
                  payoutFailureReason: intasendPayoutResponse?.error || intasendPayoutResponse?.detail || `API Error: ${response.statusText}`,
                  updatedAt: FieldValue.serverTimestamp()
              });
             const errorMessage = intasendPayoutResponse?.error || intasendPayoutResponse?.detail || `Payout gateway error: ${response.statusText}`;
             throw new Error(errorMessage);
         }

         console.log("Intasend Payout Initiation Response:", intasendPayoutResponse);
         const payoutTransactionId = intasendPayoutResponse?.transactions?.[0]?.transaction_id || intasendPayoutResponse?.reference;

         const itemUpdatePromise = itemsCollection.doc(itemId).update({
              status: 'sold',
              updatedAt: FieldValue.serverTimestamp()
         });

         const paymentUpdatePromise = paymentDocRef.update({
              status: 'payout_initiated',
              intasendPayoutId: payoutTransactionId || null,
              updatedAt: FieldValue.serverTimestamp()
         });

         // Create notification for the BUYER confirming release
         // Corrected: Use sellerId || undefined for relatedUserId
         const buyerNotificationPromise = createNotification({
              userId: buyerId, // Notify the BUYER
              type: 'payment_released',
              message: `You have successfully released the payment for "${itemTitle}".`,
              relatedItemId: itemId,
              relatedUserId: sellerId || undefined // Convert null to undefined
         });

         await Promise.all([itemUpdatePromise, paymentUpdatePromise, buyerNotificationPromise]);

         console.log(`Payment Release API: Item ${itemId} status updated to 'sold'.`);
         console.log(`Payment Release API: Payment ${paymentDocRef.id} status updated to 'payout_initiated'. Payout ID: ${payoutTransactionId}`);

         return NextResponse.json({ message: 'Payment release initiated successfully', payoutDetails: intasendPayoutResponse }, { status: 200 });

    } catch (error: any) {
        console.error('Payment Release API Error:', error);
         if (paymentDocRef) {
             try {
                  const currentPaymentData = await paymentDocRef.get();
                  // Corrected: Use currentPaymentData.exists property
                  if(currentPaymentData.exists && currentPaymentData.data()?.status === 'releasing') {
                       await paymentDocRef.update({
                         status: 'release_failed',
                         payoutFailureReason: error.message || 'Unknown error during release process',
                         updatedAt: FieldValue.serverTimestamp()
                      });
                      console.log("Rolled back payment status to 'release_failed' due to error.");

                      if (buyerId && sellerId && itemId) {
                          const itemTitle = 'the item';
                          await Promise.allSettled([
                               createNotification({
                                   userId: buyerId,
                                   type: 'unusual_activity',
                                   message: `Failed to release payment for "${itemTitle}". Please try again or contact support. Reason: ${error.message}`,
                                   relatedItemId: itemId,
                                   relatedUserId: sellerId || undefined // Convert null to undefined
                               }),
                               createNotification({
                                    userId: sellerId,
                                    type: 'unusual_activity',
                                    message: `The buyer attempted to release payment for "${itemTitle}", but it failed. Reason: ${error.message}`,
                                    relatedItemId: itemId,
                                    relatedUserId: buyerId || undefined // Convert null to undefined
                                })
                          ]);
                      }
                  }
             } catch (rollbackError) {
                  console.error("Error attempting to rollback payment status:", rollbackError);
             }
         }
        return NextResponse.json({ message: error.message || 'Failed to initiate payment release' }, { status: 500 });
    }
}
