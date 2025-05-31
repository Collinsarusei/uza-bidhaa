// src/app/api/payouts/initiate/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid'; 
import * as z from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_MPESA_BANK_CODE_KENYA = 'MPESA'; 
const MINIMUM_WITHDRAWAL_AMOUNT = 100; 

if (!PAYSTACK_SECRET_KEY) {
    console.error("FATAL: Missing Paystack Secret Key.");
}

const PayoutRequestSchema = z.object({
    amount: z.number().positive("Amount must be positive.").min(MINIMUM_WITHDRAWAL_AMOUNT, `Minimum withdrawal: KES ${MINIMUM_WITHDRAWAL_AMOUNT}.`)
});

export async function POST(req: Request) {
    console.log("--- API POST /api/payouts/initiate (Prisma V2 - Bank Fields) START ---"); 

    if (!PAYSTACK_SECRET_KEY) { 
        return NextResponse.json({ message: 'Server payment configuration error.' }, { status: 500 });
     }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.name) { 
        return NextResponse.json({ message: 'Unauthorized or user name missing.' }, { status: 401 });
     }
    const userId = session.user.id;
    const userName = session.user.name;
    console.log(`Payout Initiate: User ${userId}`);

    let userWithdrawalIdForErrorHandling: string | null = null;
    let amountToRevertOnError: Decimal | null = null;

    try {
        const body = await req.json();
        const validation = PayoutRequestSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid amount.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const requestedAmount = new Decimal(validation.data.amount); 

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) { 
            return NextResponse.json({ message: 'User profile not found.'}, { status: 404 });
        }
        const availableBalance = user.availableBalance ?? new Decimal(0);

        if (requestedAmount.gt(availableBalance)) {
            return NextResponse.json({ message: `Amount (KES ${requestedAmount}) exceeds balance (KES ${availableBalance}).` }, { status: 400 });
        }
        if (requestedAmount.lt(MINIMUM_WITHDRAWAL_AMOUNT)) {
             return NextResponse.json({ message: `Minimum withdrawal: KES ${MINIMUM_WITHDRAWAL_AMOUNT}.` }, { status: 400 });
        }

        const rawMpesaPhoneNumber = user.mpesaPhoneNumber;
        // These fields are now correctly defined in the Prisma User model (as optional)
        const userBankName = user.bankName; 
        const userBankAccountNumber = user.bankAccountNumber;
        const userBankCode = user.bankCode;

        let determinedPayoutTypeForPaystack: 'mobile_money' | 'nuban' = 'mobile_money'; // Default to mobile_money
        let determinedBankCodeForPaystack: string = '';
        let recipientAccountNumber: string = '';
        let payoutMethodForRecord: string = 'mobile_money'; // For UserWithdrawal record

        if (rawMpesaPhoneNumber && /^(?:254|\+254|0)?([17]\d{8})$/.test(rawMpesaPhoneNumber.replace(/\s+/g, ''))) {
            determinedPayoutTypeForPaystack = 'mobile_money';
            determinedBankCodeForPaystack = PAYSTACK_MPESA_BANK_CODE_KENYA;
            const cleanedMpesa = rawMpesaPhoneNumber.replace(/\s+/g, '');
            // Normalize M-Pesa to start with 07 or 01
            if (cleanedMpesa.startsWith('254')) recipientAccountNumber = `0${cleanedMpesa.substring(3)}`;
            else if (cleanedMpesa.startsWith('+254')) recipientAccountNumber = `0${cleanedMpesa.substring(4)}`;
            else if (cleanedMpesa.startsWith('7') || cleanedMpesa.startsWith('1')) recipientAccountNumber = `0${cleanedMpesa}`;
            else recipientAccountNumber = cleanedMpesa; // Assume it might already be in 07... format
            payoutMethodForRecord = 'mobile_money';
            console.log(`Payout Initiate: Selected M-Pesa. Raw: ${rawMpesaPhoneNumber}, Cleaned for Paystack: ${recipientAccountNumber}`);
        } 
        else if (userBankCode && userBankAccountNumber && userBankName) {
            determinedPayoutTypeForPaystack = 'nuban'; 
            determinedBankCodeForPaystack = userBankCode;
            recipientAccountNumber = userBankAccountNumber;
            payoutMethodForRecord = 'bank_account';
            console.log(`Payout Initiate: Selected Bank Account. Account: ${recipientAccountNumber}, Bank Code: ${userBankCode}`);
        } 
        else {
            return NextResponse.json({ message: 'Valid M-Pesa or Bank Account details not set in profile.' }, { status: 400 });
        }

        const withdrawalAmount = requestedAmount;
        const amountInKobo = Math.round(withdrawalAmount.toNumber() * 100);
        let paystackRecipientCode = user.paystackRecipientCode;
        
        const recipientNeedsUpdate = !paystackRecipientCode || 
                                   (payoutMethodForRecord === 'mobile_money' && user.lastVerifiedMpesa !== recipientAccountNumber) ||
                                   (payoutMethodForRecord === 'bank_account' && (user.lastVerifiedBankAcc !== recipientAccountNumber || user.lastVerifiedBankCode !== determinedBankCodeForPaystack)) ||
                                   user.lastVerifiedPayoutMethod !== payoutMethodForRecord;

        if (recipientNeedsUpdate) {
            console.log(`Payout Initiate: Creating/updating Paystack Transfer Recipient for ${userId}... Method: ${payoutMethodForRecord}`);
            const recipientPayload = {
                type: determinedPayoutTypeForPaystack, 
                name: userName,
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
                return NextResponse.json({ message: `Paystack recipient error: ${recipientResult.message || 'Failed to create recipient.'}` }, { status: 502 });
            }
            paystackRecipientCode = recipientResult.data.recipient_code;
            await prisma.user.update({
                where: { id: userId },
                data: {
                    paystackRecipientCode: paystackRecipientCode,
                    lastVerifiedPayoutMethod: payoutMethodForRecord,
                    lastVerifiedMpesa: payoutMethodForRecord === 'mobile_money' ? recipientAccountNumber : user.lastVerifiedMpesa, // Preserve if not current method
                    lastVerifiedBankAcc: payoutMethodForRecord === 'bank_account' ? recipientAccountNumber : user.lastVerifiedBankAcc,
                    lastVerifiedBankCode: payoutMethodForRecord === 'bank_account' ? determinedBankCodeForPaystack : user.lastVerifiedBankCode,
                }
            });
            console.log(`Payout Initiate: Paystack Recipient ${paystackRecipientCode} created/updated.`);
        }
         if (!paystackRecipientCode) { 
            return NextResponse.json({ message: 'User payout recipient code missing and could not be created.' }, { status: 500 });
        }

        const paystackTransferReference = `wdrl_${uuidv4().replace(/-/g, '')}`;
        let createdWithdrawal: any;

        await prisma.$transaction(async (tx) => {
             await tx.user.update({
                 where: { id: userId },
                 data: { availableBalance: { decrement: withdrawalAmount } }
             });
             amountToRevertOnError = withdrawalAmount;

             createdWithdrawal = await tx.userWithdrawal.create({
                 data: {
                     userId: userId,
                     amount: withdrawalAmount,
                     status: 'PENDING', 
                     payoutMethod: payoutMethodForRecord, 
                     payoutDetailsMasked: `${recipientAccountNumber.substring(0, (payoutMethodForRecord === 'mobile_money' ? 4 : 3))}****${recipientAccountNumber.substring(recipientAccountNumber.length - (payoutMethodForRecord === 'mobile_money' ? 2 : 4))}`,
                     paymentGateway: 'paystack',
                     paystackRecipientCode: paystackRecipientCode,
                     paystackTransferReference: paystackTransferReference,
                 }
             });
             userWithdrawalIdForErrorHandling = createdWithdrawal.id;
        });

        const transferPayload = {
            source: "balance", amount: amountInKobo, recipient: paystackRecipientCode, 
            currency: 'KES', reason: `Uza Bidhaa Payout - ${createdWithdrawal.id.substring(0,8)}`, 
            reference: paystackTransferReference,
            metadata: { user_withdrawal_id: createdWithdrawal.id, user_id: userId }
        };
        const transferResponse = await fetch('https://api.paystack.co/transfer', {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
             body: JSON.stringify(transferPayload)
        });
        const transferResult = await transferResponse.json();

        if (!transferResponse.ok || !transferResult.status || transferResult.data?.status === 'failed' || transferResult.data?.status === 'abandoned') {
            const failureMsg = transferResult.message || (transferResult.data ? `${transferResult.data.status}: ${transferResult.data.gateway_response || 'Unknown Paystack Error'}` : 'Transfer error.');
            await prisma.$transaction(async (tx) => {
                 await tx.user.update({ 
                     where: { id: userId }, data: { availableBalance: { increment: withdrawalAmount } }
                 });
                 await tx.userWithdrawal.update({ 
                     where: { id: createdWithdrawal.id }, 
                     data: { status: 'FAILED', failureReason: `Paystack API Error: ${failureMsg}` }
                 });
            });
            amountToRevertOnError = null; 
            userWithdrawalIdForErrorHandling = null; 
            return NextResponse.json({ message: failureMsg }, { status: 502 });
        }

        let finalPaystackStatus = transferResult.data.status;
        let withdrawalPrismaStatus: 'PENDING' | 'PROCESSING' = 'PENDING';
        if (finalPaystackStatus === 'success' || finalPaystackStatus === 'pending') {
             withdrawalPrismaStatus = 'PROCESSING'; 
        }

         await prisma.userWithdrawal.update({
             where: { id: createdWithdrawal.id },
             data: {
                 status: withdrawalPrismaStatus, 
                 paystackTransferCode: transferResult.data.transfer_code,
             }
         });

        await createNotification({
            userId: userId, type: 'withdrawal_initiated', 
            message: `Your ${payoutMethodForRecord} withdrawal of KES ${withdrawalAmount.toFixed(2)} initiated. Status: ${finalPaystackStatus}.`,
            relatedWithdrawalId: createdWithdrawal.id 
        });

        return NextResponse.json({
            message: `Withdrawal initiated. Status: ${finalPaystackStatus}.`, withdrawalId: createdWithdrawal.id,
            paystackStatus: finalPaystackStatus
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API POST /api/payouts/initiate (Prisma) FAILED --- Catch Block Error:", error);
        if (userWithdrawalIdForErrorHandling && amountToRevertOnError && userId) {
            try {
                await prisma.$transaction(async (tx) => {
                    await tx.user.update({ where: { id: userId! }, data: { availableBalance: { increment: amountToRevertOnError! } } });
                    await tx.userWithdrawal.update({ 
                        where: { id: userWithdrawalIdForErrorHandling! }, 
                        data: { status: 'FAILED', failureReason: error.message || 'System error during initiation.' }
                     });
                });
            } catch (revertError) { console.error("Failed to revert balance/status on error:", revertError); }
        }
        return NextResponse.json({ message: error.message || 'Failed to initiate withdrawal.' }, { status: 500 });
    }
}
