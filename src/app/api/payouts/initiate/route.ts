// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createNotification } from '@/lib/notifications';
import { Withdrawal, UserProfile } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import * as z from 'zod'; 

// --- Environment Variables ---
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_MPESA_BANK_CODE_KENYA = 'MPESA'; 
const MINIMUM_WITHDRAWAL_AMOUNT = 100; 

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key environment variable (PAYSTACK_SECRET_KEY).");
}

const PayoutRequestSchema = z.object({
    amount: z.number().positive("Amount must be a positive number.").min(MINIMUM_WITHDRAWAL_AMOUNT, `Minimum withdrawal is KES ${MINIMUM_WITHDRAWAL_AMOUNT}.`)
});

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
        const body = await req.json();
        const validation = PayoutRequestSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid withdrawal amount.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { amount: requestedAmount } = validation.data; 

        const userDoc = await userRef.get();
        if (!userDoc.exists) { 
            console.warn(`Payout Initiate: User ${userId} not found in Firestore.`);
            return NextResponse.json({ message: 'User profile not found.'}, { status: 404 });
        }
        const userData = userDoc.data() as UserProfile;
        const availableBalance = userData?.availableBalance ?? 0;

        if (requestedAmount > availableBalance) {
            return NextResponse.json({ message: `Withdrawal amount (KES ${requestedAmount.toLocaleString()}) exceeds your available balance (KES ${availableBalance.toLocaleString()}).` }, { status: 400 });
        }
        if (requestedAmount < MINIMUM_WITHDRAWAL_AMOUNT) {
             return NextResponse.json({ message: `Minimum withdrawal amount is KES ${MINIMUM_WITHDRAWAL_AMOUNT}.` }, { status: 400 });
        }

        const rawMpesaPhoneNumber = userData?.mpesaPhoneNumber;
        const userBankName = userData?.bankName; // Renamed to avoid conflict with local bankName
        const userBankAccountNumber = userData?.bankAccountNumber;
        const userBankCode = userData?.bankCode;

        console.log(`Payout Initiate: User ${userId}, Balance=${availableBalance}, Requested=${requestedAmount}, Mpesa=${rawMpesaPhoneNumber}`);

        let determinedPayoutTypeForPaystack: 'mobile_money' | 'nuban' | 'basic' = 'mobile_money';
        let determinedBankCodeForPaystack: string = '';
        let recipientAccountNumber: string = '';
        let payoutMethodForRecord: Withdrawal['payoutMethod'] = 'mobile_money';
        let recipientNeedsUpdate = false;
        let lastVerifiedFieldToCheck = '';

        if (rawMpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(rawMpesaPhoneNumber.replace(/\s+/g, ''))) {
            determinedPayoutTypeForPaystack = 'mobile_money';
            determinedBankCodeForPaystack = PAYSTACK_MPESA_BANK_CODE_KENYA;
            const cleanedMpesa = rawMpesaPhoneNumber.replace(/\s+/g, '');
            recipientAccountNumber = cleanedMpesa.startsWith('0') ? `0${cleanedMpesa.substring(1)}` : cleanedMpesa.startsWith('+') ? `0${cleanedMpesa.substring(4)}` : cleanedMpesa;
            if (!recipientAccountNumber.startsWith('07') && !recipientAccountNumber.startsWith('7')) {
                 if (recipientAccountNumber.startsWith('1')) { 
                    recipientAccountNumber = `0${recipientAccountNumber}`;
                 } else {
                    throw new Error("Could not format M-Pesa number to expected local format (07...). Original: " + rawMpesaPhoneNumber);
                 }
            }
            payoutMethodForRecord = 'mobile_money';
            lastVerifiedFieldToCheck = userData?.lastVerifiedMpesa || '';
            console.log(`Payout Initiate: Selected M-Pesa. Account: ${recipientAccountNumber}`);
        } 
        else if (userBankCode && userBankAccountNumber && userBankName) {
            determinedPayoutTypeForPaystack = 'nuban'; 
            determinedBankCodeForPaystack = userBankCode;
            recipientAccountNumber = userBankAccountNumber;
            payoutMethodForRecord = 'bank_account';
            lastVerifiedFieldToCheck = userData?.lastVerifiedBankAcc || '';
            console.log(`Payout Initiate: Selected Bank Account. Account: ${recipientAccountNumber}`);
        } 
        else {
            return NextResponse.json({ message: 'Payout details (valid M-Pesa or Bank Account) not set in your profile.' }, { status: 400 });
        }

        const withdrawalAmount = requestedAmount;
        const amountInKobo = Math.round(withdrawalAmount * 100);
        console.log(`Payout Initiate: Attempting to withdraw KES ${withdrawalAmount} for user ${userId} via ${payoutMethodForRecord}.`);

        let recipientCode = userData?.paystackRecipientCode;
        recipientNeedsUpdate = !recipientCode || 
                               lastVerifiedFieldToCheck !== recipientAccountNumber || 
                               userData?.lastVerifiedPayoutMethod !== payoutMethodForRecord;

        if (recipientNeedsUpdate) {
            console.log(`Payout Initiate: Creating/updating Paystack Transfer Recipient for ${userId}...`);
            const recipientPayload = {
                type: determinedPayoutTypeForPaystack, 
                name: userData.name || userName,
                account_number: recipientAccountNumber, 
                bank_code: determinedBankCodeForPaystack, 
                currency: 'KES',
                metadata: { internal_user_id: userId, payout_method: payoutMethodForRecord } 
            };
            const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(recipientPayload)
            });
            const recipientResult = await recipientResponse.json();
            if (!recipientResponse.ok || !recipientResult.status || !recipientResult.data?.recipient_code) {
                console.error("Paystack Create Recipient Error:", recipientResult);
                const errorMsg = recipientResult.message || 'Failed to create Paystack recipient.';
                return NextResponse.json({ message: `Paystack recipient creation error: ${errorMsg}` }, { status: 502 });
            }
            recipientCode = recipientResult.data.recipient_code; 

            // Correctly define and populate userProfileUpdate
            const userProfileUpdate: {
                paystackRecipientCode: string | null;
                lastVerifiedPayoutMethod: Withdrawal['payoutMethod'];
                updatedAt: FieldValue;
                lastVerifiedMpesa: string | null;
                lastVerifiedBankAcc: string | null;
                lastVerifiedBankCode: string | null;
            } = {
                paystackRecipientCode: recipientCode!, 
                lastVerifiedPayoutMethod: payoutMethodForRecord,
                updatedAt: FieldValue.serverTimestamp(),
                lastVerifiedMpesa: null,
                lastVerifiedBankAcc: null,
                lastVerifiedBankCode: null,
            };

            if (payoutMethodForRecord === 'mobile_money') {
                userProfileUpdate.lastVerifiedMpesa = recipientAccountNumber;
            } else { 
                userProfileUpdate.lastVerifiedBankAcc = recipientAccountNumber;
                userProfileUpdate.lastVerifiedBankCode = determinedBankCodeForPaystack;
            }
            
            await userRef.update(userProfileUpdate); 
            console.log(`Payout Initiate: Paystack Recipient ${recipientCode} created/updated for ${userId}.`);
        } else {
             if (!recipientCode) {
                 return NextResponse.json({ message: 'User payout recipient code is missing. Please try saving payout details again.' }, { status: 500 });
             }
            console.log(`Payout Initiate: Using existing Paystack Recipient Code ${recipientCode} for ${payoutMethodForRecord} withdrawal.`);
        }

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
                 paystackRecipientCode: recipientCode,
                 paystackTransferReference: paystackTransferReference,
                 requestedAt: FieldValue.serverTimestamp() as any,
                 updatedAt: FieldValue.serverTimestamp() as any,
                 ...(payoutMethodForRecord === 'mobile_money' && { mpesaPhoneNumber: recipientAccountNumber }), 
             };
             transaction.set(withdrawalRef, withdrawalDataToSet);
        });

        const transferPayload = {
            source: "balance",
            amount: amountInKobo,
            recipient: recipientCode, 
            currency: 'KES',
            reason: `Uza Bidhaa Payout - ${withdrawalId.substring(0,8)}`,
            reference: paystackTransferReference,
            metadata: { withdrawal_id: withdrawalId, user_id: userId }
        };
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
             body: JSON.stringify(transferPayload)
        });
        const transferResult = await transferResponse.json();

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            console.error(`Paystack Initiate Transfer Error/Failure:`, transferResult);
            const failureMsg = transferResult.message || (transferResult.data ? `${transferResult.data.status}: ${transferResult.data.message || transferResult.data.gateway_response}` : 'Unknown Paystack transfer error.');
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
            return NextResponse.json({ message: failureMsg || 'Failed to initiate transfer with Paystack.' }, { status: 502 });
        }

         await withdrawalRef.update({
             status: transferResult.data.status === 'otp' ? 'pending_gateway' : 'processing',
             paystackTransferCode: transferResult.data.transfer_code,
             updatedAt: FieldValue.serverTimestamp()
         });

        try {
            await createNotification({
                userId: userId, 
                type: 'withdrawal_initiated', 
                message: `Your ${payoutMethodForRecord === 'mobile_money' ? 'M-Pesa' : 'Bank'} withdrawal of KES ${withdrawalAmount.toLocaleString()} has been initiated. Status: ${transferResult.data.status}.`,
                relatedWithdrawalId: withdrawalId 
            });
        } catch (notifyError) { /* ... */ }

        console.log("--- API POST /api/payouts/initiate (Paystack) SUCCESS ---"); 
        return NextResponse.json({
            message: `Withdrawal initiated for KES ${withdrawalAmount.toLocaleString()}. Status: ${transferResult.data.status}.`,
            withdrawalId: withdrawalId,
            paystackStatus: transferResult.data.status
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate (Paystack) FAILED --- Catch Block Error:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ message: "Invalid withdrawal request data.", errors: error.flatten().fieldErrors }, { status: 400 });
        }
        try {
            // Attempt to mark withdrawal as failed if it reached that stage
            await adminDb?.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId).update({ 
                status: 'failed',
                failureReason: error.message || 'System error during withdrawal initiation.',
                updatedAt: FieldValue.serverTimestamp()
             });
        } catch (dbError) { /* ... */ }
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}
