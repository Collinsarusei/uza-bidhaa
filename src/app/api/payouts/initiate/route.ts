// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod'; // Not strictly used in this version of POST, but good to keep if you add body validation later
import { createNotification } from '@/lib/notifications';
import { Earning, Withdrawal, UserProfile } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// --- Environment Variables ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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
         console.error("Payout Initiate Error: Paystack Secret Key missing.");
        return NextResponse.json({ message: 'Payment gateway configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("Payout Initiate: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const userName = session.user.name || 'User'; // Get user's name for recipient
    console.log(`Payout Initiate: Authenticated as user ${userId}`);

    // Initialize withdrawalId here for use in the final catch block if needed
    const withdrawalId = uuidv4();
    const userRef = adminDb.collection('users').doc(userId);
    const withdrawalRef = userRef.collection('withdrawals').doc(withdrawalId);


    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             console.error(`Payout Initiate: User profile not found for ${userId}.`);
             return NextResponse.json({ message: 'User profile not found.' }, { status: 404 });
        }
        const userData = userDoc.data() as UserProfile;
        const availableBalance = userData?.availableBalance ?? 0;
        const mpesaPhoneNumber = userData?.mpesaPhoneNumber?.replace(/\s+/g, ''); // Cleaned M-Pesa
        const bankName = userData?.bankName;
        const bankAccountNumber = userData?.bankAccountNumber?.replace(/\s+/g, ''); // Cleaned bank account
        const bankCode = userData?.bankCode; // Paystack specific bank code from user profile

        console.log(`Payout Initiate: User ${userId}, Balance=${availableBalance}, Mpesa=${mpesaPhoneNumber}, BankName=${bankName}, BankAcc=${bankAccountNumber}, BankCode=${bankCode}`);

        // --- Determine Payout Method and Details ---
        let determinedPayoutType = ''; // e.g., 'mobile_money' or 'bank_account' for Paystack recipient type
        let determinedBankCodeForPaystack = ''; // Specific bank_code for Paystack recipient API
        let recipientAccountNumber = '';
        let payoutMethodForRecord: Withdrawal['payoutMethod'] = 'mobile_money'; // Default for our records

        if (mpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(mpesaPhoneNumber)) {
            determinedPayoutType = 'mobile_money';
            determinedBankCodeForPaystack = 'mpesa'; // ** Using 'mpesa' as bank_code for M-PESA type **
            recipientAccountNumber = mpesaPhoneNumber.startsWith('0') ? `254${mpesaPhoneNumber.substring(1)}` : mpesaPhoneNumber.startsWith('+') ? mpesaPhoneNumber.substring(1) : mpesaPhoneNumber; // Ensure 2547... format
            payoutMethodForRecord = 'mobile_money';
            console.log(`Payout Initiate: Selected M-Pesa. Type: ${determinedPayoutType}, Bank Code: ${determinedBankCodeForPaystack}, Account: ${recipientAccountNumber}`);
        } else if (bankAccountNumber && bankCode && bankName) {
            // For bank accounts, Paystack often uses "nuban" as type for many regions,
            // or "bank_account". Let's assume "nuban" is general enough or check Paystack docs for specific Kenyan bank type.
            // The bank_code is the one stored from when the user provided their bank.
            determinedPayoutType = 'nuban'; // Or 'bank_transfer' or similar if Paystack docs specify for KE banks
            determinedBankCodeForPaystack = bankCode; // This comes from user's profile (e.g., '011' for KCB)
            recipientAccountNumber = bankAccountNumber;
            payoutMethodForRecord = 'bank_account';
            console.log(`Payout Initiate: Selected Bank Account. Type: ${determinedPayoutType}, Bank Code: ${determinedBankCodeForPaystack}, Account: ${recipientAccountNumber}`);
        } else {
            console.warn(`Payout Initiate: User ${userId} missing valid M-Pesa number or complete bank details.`);
            return NextResponse.json({ message: 'Payout details (valid M-Pesa or Bank Account with Bank Name & Code) not set in your profile.' }, { status: 400 });
        }

        if (availableBalance < MINIMUM_WITHDRAWAL_AMOUNT) {
            return NextResponse.json({ message: `Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT}. Your balance is KES ${availableBalance.toLocaleString()}.` }, { status: 400 });
        }
        const withdrawalAmount = availableBalance; // Withdraw full available balance for now
        const amountInKobo = Math.round(withdrawalAmount * 100);
        console.log(`Payout Initiate: Attempting to withdraw KES ${withdrawalAmount} (Kobo ${amountInKobo}) for user ${userId} via ${payoutMethodForRecord}.`);

        // --- Step 1: Create/Update Paystack Transfer Recipient ---
        let recipientCode = userData?.paystackRecipientCode;
        const lastStoredPayoutType = userData?.lastVerifiedMpesa ? 'mobile_money' : userData?.lastVerifiedBankAcc ? 'bank_account' : null;

        // Determine if recipient needs update based on selected method and stored details
        let recipientNeedsUpdate = !recipientCode;
        if (recipientCode) {
            if (payoutMethodForRecord === 'mobile_money' && (userData?.lastVerifiedMpesa !== recipientAccountNumber || lastStoredPayoutType !== 'mobile_money')) {
                recipientNeedsUpdate = true;
            } else if (payoutMethodForRecord === 'bank_account' &&
                       (userData?.lastVerifiedBankAcc !== recipientAccountNumber ||
                        userData?.lastVerifiedBankCode !== determinedBankCodeForPaystack ||
                        lastStoredPayoutType !== 'bank_account')) {
                recipientNeedsUpdate = true;
            }
        }


        if (recipientNeedsUpdate) {
            console.log(`Payout Initiate: Creating/updating Paystack Transfer Recipient for ${userId}...`);
            const recipientPayload: any = {
                type: determinedPayoutType,
                name: userData.name || userName, // Use profile name or session name
                account_number: recipientAccountNumber,
                bank_code: determinedBankCodeForPaystack,
                currency: 'KES',
                metadata: { internal_user_id: userId, payout_method: payoutMethodForRecord }
            };
            // Description is sometimes useful for bank recipients, not typically for mobile money
            if (payoutMethodForRecord === 'bank_account' && bankName) {
                recipientPayload.description = `Payout to ${bankName}`;
            }


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
                const errorMsg = recipientResult.message || 'Failed to create/update Paystack transfer recipient.';
                // If the error is specifically "Bank is invalid", provide that context
                if (errorMsg.toLowerCase().includes("bank") && errorMsg.toLowerCase().includes("invalid")) {
                     return NextResponse.json({ message: `The bank details provided seem invalid. Please check your ${payoutMethodForRecord === 'mobile_money' ? 'M-Pesa number' : 'bank code and account number'}. Paystack: ${errorMsg}` }, { status: 400 });
                }
                return NextResponse.json({ message: errorMsg }, { status: 502 }); // Bad Gateway if Paystack error
            }
            recipientCode = recipientResult.data.recipient_code;

            // Store/update recipient_code and verified details on user profile
            const userProfileUpdate: Partial<UserProfile> = {
                paystackRecipientCode: recipientCode,
                updatedAt: FieldValue.serverTimestamp() as any // Cast for FieldValue
            };
            if (payoutMethodForRecord === 'mobile_money') {
                userProfileUpdate.lastVerifiedMpesa = recipientAccountNumber;
                userProfileUpdate.lastVerifiedBankAcc = FieldValue.delete() as any;
                userProfileUpdate.lastVerifiedBankCode = FieldValue.delete() as any;
            } else if (payoutMethodForRecord === 'bank_account') {
                userProfileUpdate.lastVerifiedBankAcc = recipientAccountNumber;
                userProfileUpdate.lastVerifiedBankCode = determinedBankCodeForPaystack;
                userProfileUpdate.lastVerifiedMpesa = FieldValue.delete() as any;
            }
            await userRef.update(userProfileUpdate);
            console.log(`Payout Initiate: Paystack Transfer Recipient ${recipientCode} created/updated for ${userId}.`);
        } else {
            console.log(`Payout Initiate: Using existing Paystack Recipient Code ${recipientCode} for ${userId}.`);
        }

        // --- Step 2: Initiate Transfer ---
        const paystackTransferReference = `wdrl_${withdrawalId}`; // Unique reference for THIS transfer

        await adminDb.runTransaction(async (transaction) => {
             transaction.update(userRef, {
                 availableBalance: FieldValue.increment(-withdrawalAmount)
             });
             const withdrawalData: Withdrawal = {
                 id: withdrawalId,
                 userId: userId,
                 amount: withdrawalAmount,
                 status: 'pending_gateway',
                 payoutMethod: payoutMethodForRecord,
                 payoutDetailsMasked: payoutMethodForRecord === 'mobile_money'
                    ? `${recipientAccountNumber.substring(0, 6)}****${recipientAccountNumber.substring(recipientAccountNumber.length - 2)}` // Show more for Mpesa for better ID
                    : `${determinedBankCodeForPaystack}-${recipientAccountNumber.length > 4 ? `****${recipientAccountNumber.substring(recipientAccountNumber.length - 4)}` : recipientAccountNumber}`,
                paymentGateway: 'paystack',
                paystackRecipientCode: recipientCode,
                paystackTransferReference: paystackTransferReference,
                requestedAt: FieldValue.serverTimestamp() as any, // Cast for FieldValue
                updatedAt: FieldValue.serverTimestamp() as any,
             };
             transaction.set(withdrawalRef, withdrawalData);
             // TODO: Mark Earning documents as 'withdrawal_pending' linking to this withdrawalId
        });
        console.log(`Payout Initiate: Firestore transaction committed for withdrawal ${withdrawalId}. Balance updated.`);

        const transferPayload = {
            source: "balance", // Payout from your Paystack balance
            amount: amountInKobo,
            recipient: recipientCode, // The RCP_ code obtained above
            currency: 'KES',
            reason: `Uza Bidhaa Payout - ${withdrawalId.substring(0,8)}`, // Keep reason concise
            reference: paystackTransferReference // Your unique reference for this specific transfer
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

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            console.error("Paystack Initiate Transfer Error/Failure:", transferResult);
            const failureMsg = transferResult.message || (transferResult.data ? `${transferResult.data.status}: ${transferResult.data.message || transferResult.data.gateway_response}` : 'Unknown Paystack transfer initiation error.');
            console.warn(`Payout Initiate: Paystack transfer initiation failed for ${withdrawalId}. Attempting to revert balance...`);
            await adminDb.runTransaction(async (revertTransaction) => {
                 revertTransaction.update(userRef, {
                     availableBalance: FieldValue.increment(withdrawalAmount)
                 });
                 revertTransaction.update(withdrawalRef, {
                     status: 'failed',
                     failureReason: `Paystack API Error: ${failureMsg}`,
                     updatedAt: FieldValue.serverTimestamp()
                 });
                 // TODO: Revert Earning statuses
            });
            console.warn(`Payout Initiate: Firestore balance reverted for failed withdrawal ${withdrawalId}.`);
            // Return a more specific error if Paystack provided one
            return NextResponse.json({ message: failureMsg || 'Failed to initiate transfer with Paystack.' }, { status: 502 });
        }

        // Successful initiation, but transfer might still be pending or require OTP
        console.log(`Payout Initiate: Paystack Transfer initiated for ${withdrawalId}. Paystack Status: ${transferResult.data.status}, Transfer Code: ${transferResult.data.transfer_code}`);
         await withdrawalRef.update({
             status: transferResult.data.status === 'otp' ? 'pending_gateway' : 'processing', // Map Paystack status
             paystackTransferCode: transferResult.data.transfer_code,
             updatedAt: FieldValue.serverTimestamp()
         });

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

        console.log("--- API POST /api/payouts/initiate (Paystack) SUCCESS ---");
        return NextResponse.json({ 
            message: `Withdrawal initiated. Status: ${transferResult.data.status}.`, 
            withdrawalId: withdrawalId, 
            paystackStatus: transferResult.data.status 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate (Paystack) FAILED --- Catch Block Error:", error);
        // Attempt to update the withdrawal record to 'failed' if an unexpected error occurs.
        try {
            await withdrawalRef.update({
                status: 'failed',
                failureReason: `Internal server error: ${error.message || 'Unknown error'}`,
                updatedAt: FieldValue.serverTimestamp()
            });
            // No balance reversion here as we don't know at what stage it failed in the try block
        } catch (dbError) {
            console.error("Failed to update withdrawal record to 'failed' in main catch block:", dbError);
        }
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}