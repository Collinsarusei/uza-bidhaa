// src/app/api/admin/withdraw-fees/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust path as needed
import * as z from 'zod';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid'; // For Paystack reference if needed, Prisma IDs are CUIDs

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const MIN_PLATFORM_WITHDRAWAL = 100; 
const PAYSTACK_MPESA_BANK_CODE_KENYA = 'MPESA';

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key.");
}

const withdrawalRequestSchema = z.object({
    amount: z.number().positive("Amount must be positive").min(MIN_PLATFORM_WITHDRAWAL),
    payoutMethod: z.enum(['mpesa', 'bank_account']),
    mpesaPhoneNumber: z.string().optional(),
    bankCode: z.string().optional(),
    accountNumber: z.string().optional(),
    accountName: z.string().optional(), 
    bankName: z.string().optional(), 
}).refine(data => {
    if (data.payoutMethod === 'mpesa') {
        return !!data.mpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(data.mpesaPhoneNumber.replace(/\s+/g, ''));
    }
    if (data.payoutMethod === 'bank_account') {
        return !!data.bankCode && !!data.accountNumber;
    }
    return false;
}, {
    message: "Invalid payout details for the selected method.",
    path: ["payoutDetails"],
});

export async function POST(req: Request) {
    console.log("--- API POST /api/admin/withdraw-fees (Prisma) START ---");

    if (!PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ message: 'Server payment configuration error.' }, { status: 500 });
    }

    const session = await getServerSession(authOptions);
    // Explicit Admin Role Check
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        console.warn("Admin Fee Withdrawal: Unauthorized attempt or not an admin.");
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const adminUserId = session.user.id;
    const adminUserName = session.user.name || 'Admin User';

    let createdAdminWithdrawalId: string | null = null;
    let amountToRevertOnError: Decimal | null = null;

    try {
        const body = await req.json();
        const validation = withdrawalRequestSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { amount, payoutMethod, mpesaPhoneNumber, bankCode, accountNumber, accountName, bankName } = validation.data;
        const withdrawalAmount = new Decimal(amount);
        const amountInKobo = Math.round(withdrawalAmount.toNumber() * 100);

        let paystackRecipientCodeForWithdrawal: string | null = null; // To store if a new one is created
        let destinationAccountNumberForPayload: string;
        let paystackRecipientType: 'mobile_money' | 'nuban';
        let paystackBankCodeForPayload: string;

        if (payoutMethod === 'mpesa') {
            const cleanedMpesa = mpesaPhoneNumber!.replace(/\s+/g, '');
            if (cleanedMpesa.startsWith('254')) destinationAccountNumberForPayload = `0${cleanedMpesa.substring(3)}`;
            else if (cleanedMpesa.startsWith('+')) destinationAccountNumberForPayload = `0${cleanedMpesa.substring(4)}`;
            else if (cleanedMpesa.startsWith('7') || cleanedMpesa.startsWith('1')) destinationAccountNumberForPayload = `0${cleanedMpesa}`;
            else destinationAccountNumberForPayload = cleanedMpesa;
            paystackRecipientType = 'mobile_money';
            paystackBankCodeForPayload = PAYSTACK_MPESA_BANK_CODE_KENYA;
        } else { // bank_account
            destinationAccountNumberForPayload = accountNumber!;
            paystackRecipientType = 'nuban';
            paystackBankCodeForPayload = bankCode!;
        }

        // Transaction to check balance and create initial withdrawal record
        const adminWithdrawal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const platformSettings = await tx.platformSetting.findUnique({ where: { id: 'global_settings' } });
            if (!platformSettings || (platformSettings.totalPlatformFees ?? new Decimal(0)).lt(withdrawalAmount)) {
                throw new Error(`Insufficient platform fees. Available: KES ${platformSettings?.totalPlatformFees?.toFixed(2) ?? 0}, Requested: KES ${withdrawalAmount.toFixed(2)}`);
            }
            await tx.platformSetting.update({
                where: { id: 'global_settings' },
                data: { totalPlatformFees: { decrement: withdrawalAmount } }
            });
            amountToRevertOnError = withdrawalAmount; // For catch block

            const newWithdrawal = await tx.adminFeeWithdrawal.create({
                data: {
                    adminUserId: adminUserId,
                    amount: withdrawalAmount,
                    currency: 'KES',
                    status: 'PENDING',
                    payoutMethod: payoutMethod,
                    paymentGateway: 'paystack',
                }
            });
            createdAdminWithdrawalId = newWithdrawal.id;
            return newWithdrawal;
        });
        console.log(`Admin Fee Withdrawal: Record ${createdAdminWithdrawalId} created, totalPlatformFees debited.`);

        // Create Paystack Transfer Recipient (always create for admin for simplicity or use stored one if preferred)
        const recipientPayload = {
            type: paystackRecipientType,
            name: accountName || `${adminUserName} Payout ${payoutMethod}`,
            account_number: destinationAccountNumberForPayload,
            bank_code: paystackBankCodeForPayload,
            currency: 'KES',
            metadata: { admin_withdrawal_id: createdAdminWithdrawalId, admin_user_id: adminUserId }
        };
        console.log("Creating Paystack Transfer Recipient for admin payout with payload:", recipientPayload);
        const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(recipientPayload)
        });
        const recipientResult = await recipientResponse.json();

        if (!recipientResponse.ok || !recipientResult.status || !recipientResult.data?.recipient_code) {
            console.error("Paystack Create Recipient Error for admin payout:", recipientResult);
            throw new Error(`Recipient Creation Failed: ${recipientResult.message || 'Unknown Paystack error'}`); // Error will be caught by outer try-catch
        }
        paystackRecipientCodeForWithdrawal = recipientResult.data.recipient_code;
        await prisma.adminFeeWithdrawal.update({
            where: { id: createdAdminWithdrawalId! },
            data: { paystackRecipientCode: paystackRecipientCodeForWithdrawal }
        });
        console.log(`Admin Fee Withdrawal: Paystack recipient ${paystackRecipientCodeForWithdrawal} created/used.`);

        // Initiate Paystack Transfer
        const transferReference = `adm_wdrl_${createdAdminWithdrawalId!.substring(0,12)}`; // Shorter ref
        const transferPayload = {
            source: "balance", amount: amountInKobo, recipient: paystackRecipientCodeForWithdrawal,
            currency: 'KES', reason: `Platform Fee Withdrawal - ${createdAdminWithdrawalId!.substring(0,8)}`,
            reference: transferReference,
            metadata: { admin_withdrawal_id: createdAdminWithdrawalId, admin_user_id: adminUserId }
        };
        console.log("Initiating Paystack Transfer for admin payout with payload:", transferPayload);
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(transferPayload)
        });
        const transferResult = await transferResponse.json();

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            console.error("Paystack Initiate Transfer Error for admin payout:", transferResult);
            throw new Error(`Paystack Transfer Failed: ${transferResult.message || transferResult.data?.gateway_response || 'Unknown error'}`);
        }

        let finalPaystackStatus = transferResult.data.status;
        let withdrawalPrismaStatus = 'PENDING';
        if (finalPaystackStatus === 'success' || finalPaystackStatus === 'pending') {
            withdrawalPrismaStatus = 'PROCESSING';
        }

        await prisma.adminFeeWithdrawal.update({
            where: { id: createdAdminWithdrawalId! },
            data: {
                status: withdrawalPrismaStatus,
                paystackTransferCode: transferResult.data.transfer_code,
                paystackTransferReference: transferReference, // Store our generated reference
            }
        });

        // No notification needed for admin initiating their own withdrawal usually, but can be added.
        console.log("--- API POST /api/admin/withdraw-fees (Prisma) SUCCESS ---");
        return NextResponse.json({ 
            message: 'Platform fee withdrawal initiated successfully.', 
            withdrawalId: createdAdminWithdrawalId,
            paystackStatus: finalPaystackStatus 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/admin/withdraw-fees (Prisma) FAILED --- Catch Block Error:", error);
        if (createdAdminWithdrawalId && amountToRevertOnError) {
            try {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    await tx.platformSetting.update({
                        where: { id: 'global_settings' },
                        data: { totalPlatformFees: { increment: amountToRevertOnError! } }
                    });
                    await tx.adminFeeWithdrawal.update({
                        where: { id: createdAdminWithdrawalId! },
                        data: { 
                            status: 'FAILED', 
                            failureReason: error.message || 'System error during admin withdrawal initiation.'
                        }
                    });
                });
                console.log(`Admin Fee Withdrawal: Reverted totalPlatformFees and marked withdrawal ${createdAdminWithdrawalId} as FAILED.`);
            } catch (revertError) {
                console.error(`Admin Fee Withdrawal: FAILED to revert totalPlatformFees/status for ${createdAdminWithdrawalId} on error:`, revertError);
            }
        }
        if (error.message?.includes('Insufficient platform fees')) {
             return NextResponse.json({ message: error.message }, { status: 400 });
        }
        return NextResponse.json({ message: error.message || 'Failed to process admin fee withdrawal.' }, { status: 500 });
    }
}
