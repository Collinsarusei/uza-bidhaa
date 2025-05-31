// src/app/api/payment/confirm-receipt/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import * as z from 'zod';
import { createNotification } from '@/lib/notifications';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const confirmSchema = z.object({
    paymentId: z.string().min(1, "Payment ID is required"),
});

async function calculateTieredPlatformFee(amount: Decimal): Promise<{
    fee: Decimal;
    netAmount: Decimal;
    appliedFeePercentage: Decimal;
    appliedFeeRuleId: string | null;
}> {
    const activeFeeRules = await prisma.feeRule.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' },
    });
    let feePercentage: Decimal | null = null;
    let ruleId: string | null = null;
    for (const feeRule of activeFeeRules) {
        if (feeRule.minAmount !== null && amount.gte(feeRule.minAmount) && (feeRule.maxAmount === null || amount.lte(feeRule.maxAmount))) {
            feePercentage = feeRule.feePercentage;
            ruleId = feeRule.id;
            break;
        }
    }
    if (feePercentage === null) {
        const platformSettings = await prisma.platformSetting.findUnique({ where: { id: 'global_settings' } });
        feePercentage = platformSettings?.defaultFeePercentage ?? new Decimal(0);
        console.log(`No specific fee rule for amount ${amount}. Using default: ${feePercentage}%`);
    }
    const feeRate = feePercentage!.div(100);
    const calculatedFee = amount.mul(feeRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const netAmountForSeller = amount.sub(calculatedFee);
    return {
        fee: calculatedFee,
        netAmount: netAmountForSeller,
        appliedFeePercentage: feePercentage!,
        appliedFeeRuleId: ruleId,
    };
}

export async function POST(req: Request) {
    console.log("--- API POST /api/payment/confirm-receipt (Prisma V3 - Create Earning) START ---");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const buyerId = session.user.id;

    try {
        let body; 
        try { body = await req.json(); } catch { return NextResponse.json({ message: 'Invalid JSON body.'}, { status: 400}); }
        
        const validation = confirmSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ message: 'Invalid input.', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { paymentId } = validation.data;

        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: { item: { select: { id: true, title: true, quantity: true, status: true } } }
            });

            if (!payment) throw new Error('Payment record not found.');
            if (payment.buyerId !== buyerId) throw new Error('Forbidden: You are not the buyer.');
            if (payment.status !== 'SUCCESSFUL_ESCROW') {
                throw new Error(`Cannot confirm receipt. Payment status: ${payment.status}. Expected SUCCESSFUL_ESCROW.`);
            }
            if (!payment.item) throw new Error('Item associated with payment not found.');

            const { fee, netAmount, appliedFeePercentage, appliedFeeRuleId } = await calculateTieredPlatformFee(payment.amount);
            console.log(`Confirm Receipt: Payment ${paymentId}, Fee=${fee}, Net=${netAmount}`);

            const currentItem = await tx.item.findUnique({ where: {id: payment.itemId }});
            if (!currentItem) throw new Error("Item not found for quantity update.");
            const newQuantity = currentItem.quantity - 1;
            let newItemStatus = currentItem.status;
            if (newQuantity <= 0) {
                newItemStatus = 'SOLD';
            } else {
                newItemStatus = 'AVAILABLE';
            }
            await tx.item.update({
                where: { id: payment.itemId },
                data: { quantity: newQuantity < 0 ? 0 : newQuantity, status: newItemStatus },
            });
            console.log(`Confirm Receipt: Item ${payment.itemId} quantity updated to ${newQuantity}. Status to ${newItemStatus}.`);

            await tx.platformFee.create({
                data: {
                    relatedPaymentId: paymentId,
                    relatedItemId: payment.itemId,
                    sellerId: payment.sellerId,
                    amount: fee,
                    appliedFeePercentage: appliedFeePercentage,
                    appliedFeeRuleId: appliedFeeRuleId,
                }
            });

            await tx.payment.update({
                where: { id: paymentId },
                data: {
                    status: 'RELEASED_TO_SELLER',
                    platformFeeCharged: fee,
                }
            });
            
            await tx.user.update({
                where: { id: payment.sellerId },
                data: { availableBalance: { increment: netAmount } }
            });

            // Create Earning record for the seller
            await tx.earning.create({
                data: {
                    userId: payment.sellerId,
                    amount: netAmount,
                    relatedPaymentId: payment.id,
                    relatedItemId: payment.itemId,
                    itemTitleSnapshot: payment.item?.title || payment.itemTitle || 'N/A',
                    status: 'AVAILABLE',
                }
            });
            console.log(`Confirm Receipt: Earning record created for seller ${payment.sellerId}, payment ${payment.id}`);

            await tx.platformSetting.update({
                where: { id: 'global_settings' },
                data: { totalPlatformFees: { increment: fee } }
            });
            
            return { 
                success: true, 
                sellerId: payment.sellerId, 
                netAmount: netAmount, 
                itemId: payment.itemId, 
                itemTitle: payment.item.title 
            };
        });

        if (result?.success) {
            await createNotification({
                userId: result.sellerId,
                type: 'funds_released',
                message: `Funds (KES ${result.netAmount.toDecimalPlaces(2).toString()}) for "${result.itemTitle}" are now in your available balance.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            await createNotification({
                userId: buyerId,
                type: 'receipt_confirmed', 
                message: `You successfully confirmed receipt for "${result.itemTitle}".`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            return NextResponse.json({ message: 'Receipt confirmed, funds released, item updated, earning recorded.' }, { status: 200 });
        }
        return NextResponse.json({ message: 'Confirmation processed with unexpected outcome.'}, { status: 500 });

    } catch (error: any) {
        console.error("--- API POST /api/payment/confirm-receipt (Prisma) FAILED ---", error.message);
        const isKnownError = error.message.startsWith('Forbidden') || error.message.includes('not found') || error.message.includes('status:');
        const statusCode = isKnownError ? (error.message.startsWith('Forbidden') ? 403 : error.message.includes('not found') ? 404 : 400) : 500;
        return NextResponse.json({ message: error.message || 'Failed to confirm receipt.' }, { status: statusCode });
    }
}
