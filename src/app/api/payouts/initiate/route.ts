// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Earning, Withdrawal, UserProfile } from '@/lib/types'; // Ensure UserProfile is imported
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
    console.log(`Payout Initiate: Authenticated as user ${userId}`);

    try {
        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             console.error(`Payout Initiate: User profile not found for ${userId}.`);
             return NextResponse.json({ message: 'User profile not found.' }, { status: 404 });
        }
        const userData = userDoc.data() as UserProfile; // Cast to UserProfile
        const availableBalance = userData?.availableBalance ?? 0;
        const mpesaPhoneNumber = userData?.mpesaPhoneNumber; // Assuming this is still used for Paystack MM
        const bankAccountNumber = userData?.bankAccountNumber; // For bank transfers
        const bankCode = userData?.bankCode; // For bank transfers (Paystack bank code)
        const accountName = userData?.name || session.user.name || 'User Payout'; // Account name

        console.log(`Payout Initiate: User ${userId}, Balance=${availableBalance}, Mpesa=${mpesaPhoneNumber}, BankAcc=${bankAccountNumber}, BankCode=${bankCode}`);

        // Determine payout method and details
        let payoutType = '';
        let payoutAccountDetails = '';

        if (mpesaPhoneNumber) { // Prioritize M-Pesa if available
            if (!/^\+?254\d{9}$/.test(mpesaPhoneNumber.replace(/\s+/g, '')) && !/^0[17]\d{8}$/.test(mpesaPhoneNumber.replace(/\s+/g, ''))) {
                return NextResponse.json({ message: 'Invalid M-Pesa number format in profile.' }, { status: 400 });
            }
            payoutType = 'mobile_money'; // Paystack uses this type for M-Pesa Kenya
            payoutAccountDetails = mpesaPhoneNumber.replace(/\s+/g, '');
        } else if (bankAccountNumber && bankCode) {
            payoutType = 'nuban'; // Or 'bank_account' depending on Paystack's exact requirement for the region
            payoutAccountDetails = bankAccountNumber;
        } else {
            console.warn(`Payout Initiate: User ${userId} missing M-Pesa number or bank details.`);
            return NextResponse.json({ message: 'Payout details (M-Pesa or Bank Account) not set in your profile.' }, { status: 400 });
        }

        if (availableBalance < MINIMUM_WITHDRAWAL_AMOUNT) {
            return NextResponse.json({ message: `Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT}.` }, { status: 400 });
        }
        const withdrawalAmount = availableBalance; // Withdraw full available balance
        const amountInKobo = Math.round(withdrawalAmount * 100);
        console.log(`Payout Initiate: Attempting to withdraw KES ${withdrawalAmount} (Kobo ${amountInKobo}) for user ${userId} via ${payoutType}.`);

        // --- Step 1: Create Transfer Recipient with Paystack ---
        // This is usually done once per seller, or if their details change.
        // For simplicity, we might do it here, or you could have a separate "update payout details" flow.
        // Let's assume we fetch or create the recipient_code.

        let recipientCode = userData?.paystackRecipientCode;
        const recipientNeedsUpdate = !recipientCode || 
                                     (payoutType === 'mobile_money' && userData?.lastVerifiedMpesa !== mpesaPhoneNumber) ||
                                     (payoutType === 'nuban' && (userData?.lastVerifiedBankAcc !== bankAccountNumber || userData?.lastVerifiedBankCode !== bankCode));


        if (recipientNeedsUpdate) {
            console.log(`Payout Initiate: Creating/updating Paystack Transfer Recipient for ${userId}...`);
            const recipientPayload: any = {
                type: payoutType, // 'mobile_money' for M-Pesa Kenya, or 'nuban' for Nigerian banks
                name: accountName,
                currency: 'KES', // Or NGN for Nigeria etc.
                metadata: { internal_user_id: userId }
            };
            if (payoutType === 'mobile_money') {
                recipientPayload.account_number = payoutAccountDetails; // M-Pesa number
                recipientPayload.bank_code = 'MTN'; // Paystack uses specific codes for mobile money providers, e.g., 'MTN' for Safaricom M-Pesa in KE usually, or check Paystack docs
            } else if (payoutType === 'nuban') { // Assuming Bank Transfer
                recipientPayload.account_number = bankAccountNumber;
                recipientPayload.bank_code = bankCode; // e.g., '058' for GTBank Nigeria
            }

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
                throw new Error(recipientResult.message || 'Failed to create Paystack transfer recipient.');
            }
            recipientCode = recipientResult.data.recipient_code;
            // Store/update recipient_code and verified details on user profile
            await userRef.update({
                paystackRecipientCode: recipientCode,
                lastVerifiedMpesa: payoutType === 'mobile_money' ? mpesaPhoneNumber : FieldValue.delete(),
                lastVerifiedBankAcc: payoutType === 'nuban' ? bankAccountNumber : FieldValue.delete(),
                lastVerifiedBankCode: payoutType === 'nuban' ? bankCode : FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`Payout Initiate: Paystack Transfer Recipient ${recipientCode} created/updated for ${userId}.`);
        } else {
            console.log(`Payout Initiate: Using existing Paystack Recipient Code ${recipientCode} for ${userId}.`);
        }


        // --- Step 2: Initiate Transfer ---
        const withdrawalId = uuidv4();
        const withdrawalRef = adminDb.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId);
        // This reference will be sent to Paystack and received back in webhook
        const paystackTransferReference = `wdrl_${withdrawalId}`;


        await adminDb.runTransaction(async (transaction) => {
             transaction.update(userRef, {
                 availableBalance: FieldValue.increment(-withdrawalAmount)
             });
             transaction.set(withdrawalRef, {
                 id: withdrawalId,
                 userId: userId,
                 amount: withdrawalAmount, // KES
                 status: 'pending_gateway', // Status before Paystack initiation
                 payoutMethod: payoutType,
                 payoutDetailsMasked: payoutType === 'mobile_money'
                     ? `${payoutAccountDetails.substring(0, 3)}****${payoutAccountDetails.substring(payoutAccountDetails.length - 2)}`
                     : `${bankCode}-****${bankAccountNumber?.substring(bankAccountNumber.length - 4)}`,
                 paystackRecipientCode: recipientCode,
                 paystackTransferReference: paystackTransferReference, // Our ref for Paystack
                 requestedAt: FieldValue.serverTimestamp(),
             } as unknown as Withdrawal); // Cast to ensure all fields are set
             // TODO: Update related Earning documents status to 'withdrawal_pending'
        });
        console.log(`Payout Initiate: Firestore transaction committed for withdrawal ${withdrawalId}. Balance updated.`);

        const transferPayload = {
            source: "balance", // Payout from your Paystack balance
            amount: amountInKobo,
            recipient: recipientCode,
            currency: 'KES',
            reason: `Marketplace Payout - ${userId}`,
            reference: paystackTransferReference // Crucial for matching webhook
        };

        console.log("Payout Initiate: Calling Paystack Initiate Transfer API...");
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transferPayload)
        });

        const transferResult = await transferResponse.json();

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed') { // Paystack might return 200 OK but with internal failure
            console.error("Paystack Initiate Transfer Error:", transferResult);
            const failureMsg = transferResult.message || (transferResult.data ? transferResult.data.message : 'Unknown Paystack transfer initiation error.');
            console.warn(`Payout Initiate: Paystack transfer initiation failed for ${withdrawalId}. Attempting to revert balance...`);
            await adminDb.runTransaction(async (revertTransaction) => {
                 revertTransaction.update(userRef, {
                     availableBalance: FieldValue.increment(withdrawalAmount)
                 });
                 revertTransaction.update(withdrawalRef, {
                     status: 'failed',
                     failureReason: `Paystack API Error: ${failureMsg}`
                 });
                 // TODO: Revert Earning statuses
            });
            console.warn(`Payout Initiate: Firestore balance reverted for failed withdrawal ${withdrawalId}.`);
            throw new Error(failureMsg);
        }

        console.log(`Payout Initiate: Paystack Transfer initiated successfully for ${withdrawalId}. Paystack Status: ${transferResult.data.status}, Transfer Code: ${transferResult.data.transfer_code}`);
         await withdrawalRef.update({
             status: 'processing', // Update status based on Paystack's initial response (e.g., 'pending' or 'otp' if OTP is required)
             paystackTransferCode: transferResult.data.transfer_code,
             updatedAt: FieldValue.serverTimestamp()
         });

        try {
             await createNotification({
                 userId: userId,
                 type: 'withdrawal_initiated',
                 message: `Your withdrawal request of KES ${withdrawalAmount.toLocaleString()} is being processed by Paystack.`,
                 relatedWithdrawalId: withdrawalId
             });
        } catch (notifyError) {
            console.error(`Payout Initiate: Failed to send notification for ${withdrawalId}:`, notifyError);
        }

        console.log("--- API POST /api/payouts/initiate (Paystack) SUCCESS ---");
        return NextResponse.json({ message: 'Withdrawal initiated successfully with Paystack.', withdrawalId: withdrawalId, paystackStatus: transferResult.data.status }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate (Paystack) FAILED --- Error:", error);
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}