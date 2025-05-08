// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import { Withdrawal, UserProfile } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// --- Environment Variables ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Set the correct Paystack bank code for M-Pesa Kenya
const PAYSTACK_MPESA_BANK_CODE_KENYA = 'MPESA'; // Correct code based on API response

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}

const MINIMUM_WITHDRAWAL_AMOUNT = 100; // KES 100

export async function POST(req: Request) {
    console.log("--- API POST /api/payouts/initiate (Paystack) START ---"); 

    if (!adminDb) { 
        console.error("Payout Initiate Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error.' }, { status: 500 });
    }
    if (!PAYSTACK_SECRET_KEY) { 
        console.error("Payout Initiate Error: Paystack Secret Key not configured.");
        return NextResponse.json({ message: 'Server payment configuration error.' }, { status: 500 });
     }
    // Removed the incorrect placeholder check here

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) { 
        console.warn("Payout Initiate: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
     }

    const userId = session!.user!.id;
    const userName = session!.user!.name || 'User';
    console.log(`Payout Initiate: Authenticated as user ${userId}`);

    const withdrawalId = uuidv4();
    const userRef = adminDb!.collection('users').doc(userId);
    const withdrawalRef = userRef.collection('withdrawals').doc(withdrawalId);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) { 
            console.warn(`Payout Initiate: User ${userId} not found in Firestore.`);
            return NextResponse.json({ message: 'User profile not found.'}, { status: 404 });
        }
        const userData = userDoc.data() as UserProfile;
        const availableBalance = userData?.availableBalance ?? 0;
        const rawMpesaPhoneNumber = userData?.mpesaPhoneNumber;
        const bankName = userData?.bankName;
        const bankAccountNumber = userData?.bankAccountNumber;
        const bankCode = userData?.bankCode;

        console.log(`Payout Initiate: User ${userId}, Balance=${availableBalance}, Mpesa=${rawMpesaPhoneNumber}, BankName=${bankName}, BankAcc=${bankAccountNumber}, BankCode=${bankCode}`);

        // Determine payout method based on available user details
        let determinedPayoutTypeForPaystack: 'mobile_money' | 'nuban' | 'basic' = 'mobile_money';
        let determinedBankCodeForPaystack: string = '';
        let recipientAccountNumber: string = '';
        let payoutMethodForRecord: Withdrawal['payoutMethod'] = 'mobile_money';
        let recipientNeedsUpdate = false;
        let lastVerifiedFieldToCheck = '';

        // Prioritize M-Pesa if available and valid
        if (rawMpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(rawMpesaPhoneNumber.replace(/\s+/g, ''))) {
            determinedPayoutTypeForPaystack = 'mobile_money';
            determinedBankCodeForPaystack = PAYSTACK_MPESA_BANK_CODE_KENYA; // Use the correct code
            const cleanedMpesa = rawMpesaPhoneNumber.replace(/\s+/g, '');
            recipientAccountNumber = cleanedMpesa.startsWith('0') ? `254${cleanedMpesa.substring(1)}` : cleanedMpesa.startsWith('+') ? cleanedMpesa.substring(1) : cleanedMpesa;
            payoutMethodForRecord = 'mobile_money';
            lastVerifiedFieldToCheck = userData?.lastVerifiedMpesa || '';
            console.log(`Payout Initiate: Selected M-Pesa. Type: ${determinedPayoutTypeForPaystack}, Bank Code: ${determinedBankCodeForPaystack}, Account: ${recipientAccountNumber}`);
        } 
        // Fallback to Bank if M-Pesa is not available/valid but Bank details are
        else if (bankCode && bankAccountNumber && bankName) {
            determinedPayoutTypeForPaystack = 'nuban'; 
            determinedBankCodeForPaystack = bankCode;
            recipientAccountNumber = bankAccountNumber;
            payoutMethodForRecord = 'bank_account';
            lastVerifiedFieldToCheck = userData?.lastVerifiedBankAcc || '';
            console.log(`Payout Initiate: Selected Bank Account. Type: ${determinedPayoutTypeForPaystack}, Bank Code: ${determinedBankCodeForPaystack}, Account: ${recipientAccountNumber}`);
        } 
        else {
            console.warn(`Payout Initiate: User ${userId} missing valid M-Pesa number or complete bank details.`);
            return NextResponse.json({ message: 'Payout details (valid M-Pesa or Bank Account with Bank Name & Code) not set in your profile.' }, { status: 400 });
        }

        if (availableBalance < MINIMUM_WITHDRAWAL_AMOUNT) { 
            return NextResponse.json({ message: `Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT}. Your balance is KES ${availableBalance.toLocaleString()}.` }, { status: 400 });
         }
        const withdrawalAmount = availableBalance;
        const amountInKobo = Math.round(withdrawalAmount * 100);
        console.log(`Payout Initiate: Attempting to withdraw KES ${withdrawalAmount} (Kobo ${amountInKobo}) for user ${userId} via ${payoutMethodForRecord}.`);

        // --- Step 1: Create/Update Paystack Transfer Recipient ---
        let recipientCode = userData?.paystackRecipientCode; // Can be string | null | undefined here
        recipientNeedsUpdate = !recipientCode || 
                               lastVerifiedFieldToCheck !== recipientAccountNumber || 
                               userData?.lastVerifiedPayoutMethod !== payoutMethodForRecord;

        if (recipientNeedsUpdate) {
            console.log(`Payout Initiate: Creating/updating Paystack Transfer Recipient for ${userId} (${payoutMethodForRecord})...`);
            const recipientPayload = {
                type: determinedPayoutTypeForPaystack, 
                name: userData.name || userName,
                account_number: recipientAccountNumber,
                bank_code: determinedBankCodeForPaystack, // This uses the constant now
                currency: 'KES',
                metadata: { internal_user_id: userId, payout_method: payoutMethodForRecord }
            };

            console.log("Recipient Payload to Paystack:", recipientPayload);
            const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(recipientPayload)
            });
            const recipientResult = await recipientResponse.json();

            if (!recipientResponse.ok || !recipientResult.status || !recipientResult.data?.recipient_code) {
                console.error("Paystack Create Recipient Error:", recipientResult);
                const errorMsg = recipientResult.message || 'Failed to create Paystack recipient.';
                 if (errorMsg.toLowerCase().includes("invalid") && (errorMsg.toLowerCase().includes("bank") || errorMsg.toLowerCase().includes("account number"))) {
                      return NextResponse.json({ message: `The payout details provided seem invalid. Paystack error: ${errorMsg}` }, { status: 400 });
                 }
                 if (recipientResult.code === 'invalid_bank_code' || errorMsg.toLowerCase().includes('invalid bank code') || errorMsg.toLowerCase().includes('bank is invalid')) {
                    console.error(`CRITICAL: The configured PAYSTACK_MPESA_BANK_CODE_KENYA ('${PAYSTACK_MPESA_BANK_CODE_KENYA}') seems incorrect based on Paystack response.`);
                    return NextResponse.json({ message: `Paystack recipient creation failed: Invalid bank code configured for M-Pesa. Please contact support.` }, { status: 500 });
                 }
                return NextResponse.json({ message: `Paystack recipient creation error: ${errorMsg}` }, { status: 502 });
            }
            // At this point, recipientResult.data.recipient_code is guaranteed to be a string
            recipientCode = recipientResult.data.recipient_code; 

            // Define the update object with explicit types for Firestore write
            const userProfileUpdate: {
                paystackRecipientCode: string | null; // Type allows null
                lastVerifiedPayoutMethod: Withdrawal['payoutMethod'];
                updatedAt: FieldValue;
                lastVerifiedMpesa: string | null;
                lastVerifiedBankAcc: string | null;
                lastVerifiedBankCode: string | null;
            } = {
                paystackRecipientCode: recipientCode!, // Use non-null assertion here
                lastVerifiedPayoutMethod: payoutMethodForRecord,
                updatedAt: FieldValue.serverTimestamp(),
                // Initialize all verification fields to null initially
                lastVerifiedMpesa: null,
                lastVerifiedBankAcc: null,
                lastVerifiedBankCode: null,
            };

            // Set the correct verification field based on the method
            if (payoutMethodForRecord === 'mobile_money') {
                userProfileUpdate.lastVerifiedMpesa = recipientAccountNumber;
            } else { // bank_account case
                userProfileUpdate.lastVerifiedBankAcc = recipientAccountNumber;
                userProfileUpdate.lastVerifiedBankCode = determinedBankCodeForPaystack;
            }
            
            await userRef.update(userProfileUpdate); // Update Firestore
            console.log(`Payout Initiate: Paystack Recipient ${recipientCode} created/updated for ${userId}.`);
        } else {
             // If recipient didn't need update, recipientCode could still be null if it was never created before.
             // We need a valid recipientCode to proceed. Throw error if it's null/undefined here.
            if (!recipientCode) {
                 console.error(`Payout Initiate: Logic error - Recipient code is missing for user ${userId} even though recipientNeedsUpdate is false.`);
                 return NextResponse.json({ message: 'User payout recipient code is missing. Please try saving payout details again.' }, { status: 500 });
             }
            console.log(`Payout Initiate: Using existing Paystack Recipient Code ${recipientCode} for ${payoutMethodForRecord} withdrawal for user ${userId}.`);
        }

        // --- Step 2: Initiate Transfer ---
        const paystackTransferReference = `wdrl_${withdrawalId}`;

        await adminDb!.runTransaction(async (transaction) => {
             transaction.update(userRef, {
                 availableBalance: FieldValue.increment(-withdrawalAmount)
             });
             const withdrawalDataToSet: Withdrawal = {
                 id: withdrawalId,
                 userId: userId,
                 amount: withdrawalAmount,
                 status: 'pending_gateway',
                 payoutMethod: payoutMethodForRecord, 
                 payoutDetailsMasked: `${recipientAccountNumber.substring(0,(payoutMethodForRecord === 'mobile_money' ? 6: 3))}****${recipientAccountNumber.substring(recipientAccountNumber.length - (payoutMethodForRecord === 'mobile_money' ? 2: 4))}`,
                 paymentGateway: 'paystack',
                 paystackRecipientCode: recipientCode, // recipientCode is guaranteed string here
                 paystackTransferReference: paystackTransferReference,
                 requestedAt: FieldValue.serverTimestamp() as any,
                 updatedAt: FieldValue.serverTimestamp() as any,
                 ...(payoutMethodForRecord === 'mobile_money' && { mpesaPhoneNumber: recipientAccountNumber }),
             };
             transaction.set(withdrawalRef, withdrawalDataToSet);
        });
        console.log(`Payout Initiate: Firestore transaction committed for withdrawal ${withdrawalId}.`);

        const transferPayload = {
            source: "balance",
            amount: amountInKobo,
            recipient: recipientCode, // recipientCode is guaranteed string here
            currency: 'KES',
            reason: `Uza Bidhaa Payout - ${withdrawalId.substring(0,8)}`,
            reference: paystackTransferReference
        };

        console.log("Payout Initiate: Calling Paystack Initiate Transfer API with payload:", transferPayload);
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
             method: 'POST',
             headers: {
                 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                 'Content-Type': 'application/json'
             },
             body: JSON.stringify(transferPayload)
        });
        const transferResult = await transferResponse.json();

        // --- Handle Transfer Initiation Response ---
        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            console.error(`Paystack Initiate Transfer Error/Failure (${payoutMethodForRecord}):`, transferResult);
            const failureMsg = transferResult.message || (transferResult.data ? `${transferResult.data.status}: ${transferResult.data.message || transferResult.data.gateway_response}` : 'Unknown Paystack transfer error.');
            console.warn(`Payout Initiate: Paystack transfer failed for ${withdrawalId}. Reverting balance...`);
            await adminDb!.runTransaction(async (revertTransaction) => {
                 revertTransaction.update(userRef, {
                     availableBalance: FieldValue.increment(withdrawalAmount)
                 });
                 revertTransaction.update(withdrawalRef, {
                     status: 'failed',
                     failureReason: `Paystack API Error: ${failureMsg}`,
                     updatedAt: FieldValue.serverTimestamp()
                 });
            });
            console.warn(`Payout Initiate: Firestore balance reverted for failed withdrawal ${withdrawalId}.`);
            return NextResponse.json({ message: failureMsg || 'Failed to initiate transfer with Paystack.' }, { status: 502 });
        }

        // --- Update Withdrawal Status on Success ---
        console.log(`Payout Initiate: Paystack Transfer initiated for ${withdrawalId}. Status: ${transferResult.data.status}, Code: ${transferResult.data.transfer_code}`);
         await withdrawalRef.update({
             status: transferResult.data.status === 'otp' ? 'pending_gateway' : 'processing',
             paystackTransferCode: transferResult.data.transfer_code,
             updatedAt: FieldValue.serverTimestamp()
         });

        // --- Send Notification ---
        try {
            await createNotification({
                userId: userId, 
                type: 'withdrawal_initiated', 
                message: `Your ${payoutMethodForRecord === 'mobile_money' ? 'M-Pesa' : 'Bank'} withdrawal of KES ${withdrawalAmount.toLocaleString()} has been initiated. Status: ${transferResult.data.status}.`,
                relatedWithdrawalId: withdrawalId 
            });
        } catch (notifyError) { 
            console.error(`Payout Initiate: Failed to send notification for withdrawal ${withdrawalId}:`, notifyError);
         }

        console.log("--- API POST /api/payouts/initiate (Paystack) SUCCESS ---"); 
        return NextResponse.json({
            message: `Withdrawal initiated. Status: ${transferResult.data.status}.`,
            withdrawalId: withdrawalId,
            paystackStatus: transferResult.data.status
        }, { status: 200 });


    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate (Paystack) FAILED --- Catch Block Error:", error);
        try {
            await adminDb?.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId).update({ 
                status: 'failed',
                failureReason: error.message || 'System error during withdrawal initiation.',
                updatedAt: FieldValue.serverTimestamp()
             });
        } catch (dbError) { 
            console.error(`Payout Initiate: FAILED to update withdrawal ${withdrawalId} to failed status after catch:`, dbError);
        }
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}
