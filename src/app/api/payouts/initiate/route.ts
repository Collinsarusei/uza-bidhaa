// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Earning, Withdrawal } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// --- Environment Variables --- 
const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
// Publishable Key likely needed for Send Money API Token
const INTASEND_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_INTASEND_PUBLISHABLE_KEY; 
// You might need a specific Wallet ID to PAY FROM, or it defaults to your primary balance
const INTASEND_PAYOUT_WALLET_ID = process.env.INTASEND_PAYOUT_WALLET_ID; // Optional: Wallet to send from

if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
    console.error("FATAL: Missing IntaSend Secret or Publishable Key environment variables for Payouts.");
}

// Minimum withdrawal amount (example)
const MINIMUM_WITHDRAWAL_AMOUNT = 100; // KES 100

// --- POST Handler --- 
export async function POST(req: Request) {
    console.log("--- API POST /api/payouts/initiate START ---");

    if (!adminDb) {
        console.error("Payout Initiate Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
         console.error("Payout Initiate Error: IntaSend environment variables missing.");
        return NextResponse.json({ message: 'Payment gateway configuration error.' }, { status: 500 });
    }

    // --- Authentication --- 
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Payout Initiate: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`Payout Initiate: Authenticated as user ${userId}`);

    try {
        // --- Get User Data (Balance and Mpesa Number) --- 
        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             console.error(`Payout Initiate: User profile not found for ${userId}.`);
             return NextResponse.json({ message: 'User profile not found.' }, { status: 404 });
        }
        const userData = userDoc.data();
        const availableBalance = userData?.availableBalance ?? 0;
        const mpesaPhoneNumber = userData?.mpesaPhoneNumber;

        console.log(`Payout Initiate: User ${userId}, Balance=${availableBalance}, Mpesa=${mpesaPhoneNumber}`);

        // --- Validation --- 
        if (!mpesaPhoneNumber) {
             console.warn(`Payout Initiate: User ${userId} missing M-Pesa number.`);
             return NextResponse.json({ message: 'M-Pesa payout number not set in your profile.' }, { status: 400 });
        }
        // Basic phone number format check (adapt as needed for Kenya)
        if (!/^\+?254\d{9}$/.test(mpesaPhoneNumber.replace(/\s+/g, '')) && !/^0[17]\d{8}$/.test(mpesaPhoneNumber.replace(/\s+/g, ''))) {
            console.warn(`Payout Initiate: Invalid M-Pesa number format for user ${userId}: ${mpesaPhoneNumber}`);
            return NextResponse.json({ message: 'Invalid M-Pesa number format in profile.' }, { status: 400 });
        }
        
        // For now, withdraw full balance if > minimum
        if (availableBalance < MINIMUM_WITHDRAWAL_AMOUNT) {
            console.warn(`Payout Initiate: Insufficient balance for user ${userId}. Balance=${availableBalance}, Min=${MINIMUM_WITHDRAWAL_AMOUNT}`);
            return NextResponse.json({ message: `Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT}.` }, { status: 400 });
        }
        const withdrawalAmount = availableBalance; // Withdraw full available balance
        console.log(`Payout Initiate: Attempting to withdraw KES ${withdrawalAmount} for user ${userId}.`);

        // --- Prepare IntaSend Send Money Request --- 
        const intasendTokenUrl = 'https://api.intasend.com/api/v1/token/';
        const intasendPayoutUrl = 'https://api.intasend.com/api/v1/send-money/initiate/';

        // 1. Get IntaSend API Token
        console.log("Payout Initiate: Requesting IntaSend API token...");
        const tokenResponse = await fetch(intasendTokenUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ public_key: INTASEND_PUBLISHABLE_KEY })
        });
        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({ detail: 'Failed to fetch IntaSend token' }));
            console.error("IntaSend Token Error:", errorData);
            throw new Error(errorData.detail || `IntaSend token request failed: ${tokenResponse.status}`);
        }
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.token;
        if (!accessToken) {
             console.error("IntaSend Token Error: Token not found in response.", tokenData);
             throw new Error('Failed to retrieve IntaSend API token.');
        }
        console.log("Payout Initiate: IntaSend API token obtained.");

        // 2. Prepare Send Money Payload
        const payoutPayload = {
            wallet_id: INTASEND_PAYOUT_WALLET_ID || undefined, // Specify source wallet if needed, otherwise uses default
            currency: 'KES',
            transactions: [
                {
                    account: mpesaPhoneNumber.replace(/\s+/g, ''), // Ensure no spaces
                    name: userData?.name || 'User Payout',
                    amount: withdrawalAmount,
                    narrative: `Payout from Uza Bidhaa Marketplace` // Customize narration
                }
                // Add more transactions here if sending to multiple recipients in one batch
            ]
        };

        // --- Firestore Transaction & IntaSend Call --- 
        const withdrawalId = uuidv4();
        const withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);

        console.log(`Payout Initiate: Starting Firestore transaction for withdrawal ${withdrawalId}...`);
        // Use transaction to ensure balance is updated ONLY if IntaSend call is initiated (or seems likely to succeed)
        // Note: IntaSend call is outside the transaction, so there's a small risk.
        // A more robust system might use Cloud Tasks to handle the IntaSend call after the transaction commits.
        
        await adminDb.runTransaction(async (transaction) => {
             // Decrement user balance
             transaction.update(userRef, {
                 availableBalance: FieldValue.increment(-withdrawalAmount)
             });
             // Create Withdrawal Record
             transaction.set(withdrawalRef, {
                 id: withdrawalId,
                 userId: userId,
                 amount: withdrawalAmount,
                 status: 'pending', // Pending confirmation from IntaSend webhook
                 mpesaPhoneNumber: mpesaPhoneNumber,
                 requestedAt: FieldValue.serverTimestamp(),
             });
             // TODO: Update related Earning documents status to 'withdrawal_pending' if using that method
        });
        console.log(`Payout Initiate: Firestore transaction committed for withdrawal ${withdrawalId}. Balance updated.`);

        // 3. Initiate IntaSend Send Money
        console.log("Payout Initiate: Calling IntaSend Send Money API...");
        const payoutResponse = await fetch(intasendPayoutUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payoutPayload)
        });

        const payoutResult = await payoutResponse.json();

        if (!payoutResponse.ok || payoutResult.status === 'Failed') {
            console.error("IntaSend Send Money Error:", payoutResult);
            // --- IMPORTANT: Revert Firestore Transaction --- 
            // Since the IntaSend call failed AFTER the Firestore transaction committed,
            // we need to attempt to revert the balance update.
            console.warn(`Payout Initiate: IntaSend call failed for ${withdrawalId}. Attempting to revert balance...`);
            await adminDb.runTransaction(async (revertTransaction) => {
                 revertTransaction.update(userRef, {
                     availableBalance: FieldValue.increment(withdrawalAmount) // Add back
                 });
                 revertTransaction.update(withdrawalRef, {
                     status: 'failed',
                     failureReason: `IntaSend API Error: ${payoutResult.error || payoutResult.message || 'Unknown'}`
                 });
                 // TODO: Revert Earning statuses if applicable
            });
             console.warn(`Payout Initiate: Firestore balance reverted for failed withdrawal ${withdrawalId}.`);
            // ---------------------------------------------
            throw new Error(payoutResult.error || payoutResult.message || `IntaSend Send Money request failed with status ${payoutResponse.status}`);
        }
        
        // If IntaSend initiation is successful, store the tracking ID
        console.log(`Payout Initiate: IntaSend Send Money initiated successfully for ${withdrawalId}. Tracking ID: ${payoutResult.tracking_id}`);
         await withdrawalRef.update({
             status: 'processing', // Update status to processing
             intasendTransferId: payoutResult.tracking_id || null // Store IntaSend tracking ID
         });

        // --- Send Notification --- 
        try {
             await createNotification({
                 userId: userId,
                 type: 'withdrawal_initiated',
                 message: `Your withdrawal request of KES ${withdrawalAmount.toLocaleString()} is being processed.`,
                 relatedWithdrawalId: withdrawalId
             });
        } catch (notifyError) {
            console.error(`Payout Initiate: Failed to send notification for ${withdrawalId}:`, notifyError);
        }

        console.log("--- API POST /api/payouts/initiate SUCCESS ---");
        return NextResponse.json({ message: 'Withdrawal initiated successfully.', withdrawalId: withdrawalId }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate FAILED --- Error:", error);
        // Ensure balance wasn't left in incorrect state if error happened before revert logic
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}
