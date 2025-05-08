// src/app/api/admin/withdraw-fees/route.ts
'use server';

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import * as z from 'zod';
import { AdminPlatformFeeWithdrawal, PlatformSettings } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MIN_PLATFORM_WITHDRAWAL = 100; // Minimum KES 100 for withdrawal

// Correct Paystack bank code for M-Pesa Kenya
const PAYSTACK_MPESA_BANK_CODE_KENYA = 'MPESA';

// Schema for input validation
const withdrawalRequestSchema = z.object({
    amount: z.number().positive("Amount must be positive").min(MIN_PLATFORM_WITHDRAWAL),
    payoutMethod: z.enum(['mpesa', 'bank_account']),
    mpesaPhoneNumber: z.string().optional(), // Required if payoutMethod is mpesa
    bankCode: z.string().optional(),          // Required if payoutMethod is bank_account
    accountNumber: z.string().optional(),   // Required if payoutMethod is bank_account
    accountName: z.string().optional(),     // Optional for bank, Paystack can verify
    bankName: z.string().optional(),       // Added to pass bank name from UI for record
}).refine(data => {
    if (data.payoutMethod === 'mpesa') {
        // Validate original format before conversion attempt
        return !!data.mpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(data.mpesaPhoneNumber.replace(/\s+/g, ''));
    }
    if (data.payoutMethod === 'bank_account') {
        return !!data.bankCode && !!data.accountNumber;
    }
    return false;
}, {
    message: "Invalid payout details for the selected method.",
    path: ["payoutDetails"], // Custom path for error
});

// Role-based admin check
async function isAdmin(userId: string | undefined): Promise<boolean> {
    if (!userId || !adminDb) { 
        console.error("isAdmin check failed: Missing userId or adminDb is null.");
        return false;
    }
    try {
        const userDoc = await adminDb!.collection('users').doc(userId).get(); 
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Error checking admin role:", error);
        return false;
    }
}

export async function POST(req: Request) {
    console.log("--- API POST /api/admin/withdraw-fees START ---");

    if (!adminDb) {
        console.error("Admin Fee Withdrawal Error: Firebase Admin DB not initialized.");
        return NextResponse.json({ message: 'Server configuration error (DB)' }, { status: 500 });
    }
    if (!PAYSTACK_SECRET_KEY) {
        console.error("Admin Fee Withdrawal Error: Paystack Secret Key not configured.");
        return NextResponse.json({ message: 'Server payment configuration error (Paystack Key)' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !(await isAdmin(session.user.id))) {
        console.warn("Admin Fee Withdrawal: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = session.user.id;

    let adminWithdrawalId: string | null = null; 

    try {
        adminWithdrawalId = uuidv4(); 

        const body = await req.json();
        const validation = withdrawalRequestSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { amount, payoutMethod, mpesaPhoneNumber, bankCode, accountNumber, accountName, bankName } = validation.data;
        const amountInKobo = Math.round(amount * 100);

        const platformFeeSettingsRef = adminDb!.collection('settings').doc('platformFee');
        const adminWithdrawalRef = adminDb!.collection('adminFeeWithdrawals').doc(adminWithdrawalId);

        let paystackRecipientCode: string | null = null;
        let recipientPayload: any;
        let transferReason = `Platform Fee Withdrawal - ${adminWithdrawalId.substring(0,8)}`;
        let destinationAccountNumberForPayload: string;

        // Prepare Paystack recipient and transfer details
        if (payoutMethod === 'mpesa') {
            const cleanedMpesa = mpesaPhoneNumber!.replace(/\s+/g, '');
            destinationAccountNumberForPayload = cleanedMpesa.startsWith('254') 
                ? `0${cleanedMpesa.substring(3)}` 
                : cleanedMpesa.startsWith('+') 
                ? `0${cleanedMpesa.substring(4)}` 
                : cleanedMpesa; 
             if (!destinationAccountNumberForPayload.startsWith('07') && !destinationAccountNumberForPayload.startsWith('7')) {
                 if (destinationAccountNumberForPayload.startsWith('1')) { 
                    destinationAccountNumberForPayload = `0${destinationAccountNumberForPayload}`;
                 } else {
                    throw new Error("Could not format M-Pesa number to expected local format (07...). Original: " + mpesaPhoneNumber);
                 }
             }
            console.log(`Admin Fee Withdrawal: Using M-Pesa number ${destinationAccountNumberForPayload} for Paystack.`);
            
            recipientPayload = {
                type: 'mobile_money',
                name: accountName || `Admin Mpesa ${destinationAccountNumberForPayload.slice(-4)}`, 
                account_number: destinationAccountNumberForPayload, 
                bank_code: PAYSTACK_MPESA_BANK_CODE_KENYA, 
                currency: 'KES',
                metadata: { admin_withdrawal_id: adminWithdrawalId, admin_user_id: adminUserId } 
            };
        } else { // bank_account
            destinationAccountNumberForPayload = accountNumber!;
            console.log(`Admin Fee Withdrawal: Using bank account ${destinationAccountNumberForPayload} for Paystack.`);
            recipientPayload = {
                type: 'nuban', 
                name: accountName || `Admin Bank ${destinationAccountNumberForPayload.slice(-4)}`,
                account_number: destinationAccountNumberForPayload,
                bank_code: bankCode!,
                currency: 'KES',
                metadata: { admin_withdrawal_id: adminWithdrawalId, admin_user_id: adminUserId }
            };
        }

        // Transaction to ensure atomicity of checking balance and creating withdrawal record
        await adminDb!.runTransaction(async (transaction) => {
            const settingsDoc = await transaction.get(platformFeeSettingsRef);
            if (!settingsDoc.exists) {
                throw new Error("Platform fee settings document not found. Cannot verify balance.");
            }
            const platformSettings = settingsDoc.data() as PlatformSettings;
            const currentTotalFees = platformSettings.totalPlatformFees ?? 0;

            if (amount > currentTotalFees) {
                throw new Error(`Insufficient platform fees. Available: KES ${currentTotalFees.toLocaleString()}, Requested: KES ${amount.toLocaleString()}`);
            }

            // Create initial withdrawal record
            const withdrawalData: AdminPlatformFeeWithdrawal = {
                id: adminWithdrawalId!, 
                adminUserId: adminUserId,
                amount: amount,
                currency: 'KES',
                status: 'pending_gateway',
                payoutMethod: payoutMethod,
                destinationDetails: {
                    accountName: accountName ?? null, 
                    accountNumber: destinationAccountNumberForPayload, 
                    bankCode: payoutMethod === 'bank_account' ? bankCode : null, // Corrected: Use null instead of undefined
                    bankName: bankName ?? null, 
                },
                paymentGateway: 'paystack',
                initiatedAt: FieldValue.serverTimestamp() as any,
                updatedAt: FieldValue.serverTimestamp() as any,
            };
            transaction.set(adminWithdrawalRef, withdrawalData);
            transaction.update(platformFeeSettingsRef, { 
                totalPlatformFees: FieldValue.increment(-amount) 
            });
        });
        
        console.log(`Admin Fee Withdrawal: Record ${adminWithdrawalId} created, totalPlatformFees debited.`);

        // Create Paystack Transfer Recipient
        console.log("Creating Paystack Transfer Recipient with payload:", recipientPayload);
        const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(recipientPayload)
        });
        const recipientResult = await recipientResponse.json();

        if (!recipientResponse.ok || !recipientResult.status || !recipientResult.data?.recipient_code) {
            console.error("Paystack Create Recipient Error:", recipientResult);
            await adminDb!.runTransaction(async (transaction) => {
                transaction.update(platformFeeSettingsRef, { totalPlatformFees: FieldValue.increment(amount) });
                transaction.update(adminWithdrawalRef, { status: 'failed', failureReason: `Recipient Creation Failed: ${recipientResult.message || 'Unknown error'}` });
            });
            console.warn(`Admin Fee Withdrawal: Reverted balance increment for failed recipient creation ${adminWithdrawalId}.`);
            return NextResponse.json({ message: `Failed to create Paystack recipient: ${recipientResult.message || 'Unknown error'}` }, { status: 502 });
        }
        paystackRecipientCode = recipientResult.data.recipient_code;
        await adminWithdrawalRef.update({ paystackRecipientCode }); 
        console.log(`Admin Fee Withdrawal: Paystack recipient ${paystackRecipientCode} created.`);

        // Initiate Paystack Transfer
        const transferReference = `adm_wdrl_${adminWithdrawalId}`;
        const transferPayload = {
            source: "balance",
            amount: amountInKobo,
            recipient: paystackRecipientCode,
            currency: 'KES',
            reason: transferReason,
            reference: transferReference,
            metadata: {
                 admin_withdrawal_id: adminWithdrawalId,
                 admin_user_id: adminUserId
            }
        };
        
        console.log("Initiating Paystack Transfer with payload:", transferPayload);
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(transferPayload)
        });
        const transferResult = await transferResponse.json();

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            console.error("Paystack Initiate Transfer Error:", transferResult);
            await adminDb!.runTransaction(async (transaction) => {
                transaction.update(platformFeeSettingsRef, { totalPlatformFees: FieldValue.increment(amount) });
                transaction.update(adminWithdrawalRef, { 
                    status: 'failed', 
                    failureReason: `Transfer Failed: ${transferResult.message || transferResult.data?.gateway_response || 'Unknown error'}`,
                    paystackTransferReference: transferReference 
                });
            });
             console.warn(`Admin Fee Withdrawal: Reverted balance increment for failed transfer ${adminWithdrawalId}.`);
            return NextResponse.json({ message: `Paystack transfer failed: ${transferResult.message || transferResult.data?.gateway_response || 'Unknown error'}` }, { status: 502 });
        }

        // Success - update withdrawal record
        await adminWithdrawalRef.update({
            status: transferResult.data.status === 'otp' ? 'pending_gateway' : 'processing', 
            paystackTransferCode: transferResult.data.transfer_code,
            paystackTransferReference: transferReference,
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log("--- API POST /api/admin/withdraw-fees SUCCESS ---");
        return NextResponse.json({ 
            message: 'Platform fee withdrawal initiated successfully.', 
            withdrawalId: adminWithdrawalId,
            paystackStatus: transferResult.data.status 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/admin/withdraw-fees FAILED --- Catch Block Error:", error);
        // Check if withdrawal record was potentially created before error occurred
        if (adminWithdrawalId) { 
             try {
                 // If the error happened AFTER the balance was debited in the transaction,
                 // but BEFORE Paystack calls succeeded, we should ideally revert the balance.
                 // However, simply marking as failed here is safer if unsure where the error occurred.
                 await adminDb?.collection('adminFeeWithdrawals').doc(adminWithdrawalId).update({ 
                     status: 'failed', 
                     failureReason: `System Error: ${error.message}`,
                     updatedAt: FieldValue.serverTimestamp()
                 });
             } catch (dbError) {
                  console.error(`Admin Fee Withdrawal: FAILED to update withdrawal ${adminWithdrawalId} to failed status after catch:`, dbError);
             }
        }
        // If the error was the insufficient funds error, return 400
        if (error.message?.includes('Insufficient platform fees')) {
             return NextResponse.json({ message: error.message }, { status: 400 });
        }
        return NextResponse.json({ message: error.message || 'Failed to process admin fee withdrawal.' }, { status: 500 });
    }
}
