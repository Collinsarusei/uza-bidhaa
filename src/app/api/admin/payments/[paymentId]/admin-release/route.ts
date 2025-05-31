// src/app/api/admin/payments/[paymentId]/admin-release/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; 
import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

// Tiered fee calculation function (ensure this is consistent, ideally from a shared lib)
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

interface AdminReleaseParams {
    params: {
        paymentId: string;
    }
}

export async function POST(req: Request, context: any) {
    const { paymentId } = context.params;
    console.log(`--- API POST /api/admin/payments/${paymentId}/admin-release (Prisma V3 - Create Earning) START ---`);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') { 
        console.warn(`Admin Release Payment ${paymentId}: Unauthorized or not admin.`);
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const adminUserId = session.user.id;

    try {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const payment = await tx.payment.findUnique({
                where: { id: paymentId },
                include: { 
                    item: { select: { id: true, title: true, quantity: true, status: true } }, 
                    disputes: { where: { status: { notIn: ['RESOLVED_REFUND', 'RESOLVED_RELEASE_PAYMENT', 'CLOSED'] } } } 
                }
            });

            if (!payment) throw new Error('Payment record not found.');
            if (payment.status !== 'SUCCESSFUL_ESCROW' && payment.status !== 'PENDING_CONFIRMATION' && payment.status !== 'DISPUTED') {
                 throw new Error(`Admin cannot release. Payment status: ${payment.status}.`);
            }
            if (!payment.item) throw new Error('Item associated with payment not found.');

            const { fee, netAmount, appliedFeePercentage, appliedFeeRuleId } = await calculateTieredPlatformFee(payment.amount);
            console.log(`Admin Release: Payment ${paymentId}, Fee=${fee}, Net=${netAmount}`);

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
            console.log(`Admin Release: Item ${payment.itemId} quantity to ${newQuantity}. Status to ${newItemStatus}.`);

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
            console.log(`Admin Release: Earning record created for seller ${payment.sellerId}, payment ${payment.id}`);

            await tx.platformSetting.update({
                where: { id: 'global_settings' },
                data: { totalPlatformFees: { increment: fee } }
            });

            if (payment.disputes && payment.disputes.length > 0) {
                for (const dispute of payment.disputes) {
                    await tx.dispute.update({
                        where: { id: dispute.id },
                        data: { status: 'RESOLVED_RELEASE_PAYMENT', updatedAt: new Date() }
                    });
                }
            }
            
            return { 
                success: true, 
                sellerId: payment.sellerId, 
                buyerId: payment.buyerId, 
                netAmount: netAmount, 
                itemId: payment.itemId, 
                itemTitle: payment.item.title 
            };
        });

        if (result?.success) {
            await createNotification({
                userId: result.sellerId,
                type: 'funds_released_by_admin',
                message: `Admin released funds (KES ${result.netAmount.toDecimalPlaces(2).toString()}) for "${result.itemTitle}". Now in your balance.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            await createNotification({
                userId: result.buyerId,
                type: 'order_completed_by_admin', 
                message: `Admin has finalized the transaction for "${result.itemTitle}". Funds released to seller.`,
                relatedItemId: result.itemId,
                relatedPaymentId: paymentId,
            });
            return NextResponse.json({ message: 'Admin released funds to seller, item updated, earning recorded.' }, { status: 200 });
        }
        return NextResponse.json({ message: 'Admin release processed with unexpected outcome.'}, { status: 500 });

    } catch (error: any) {
        console.error(`--- API POST /api/admin/payments/${paymentId}/admin-release (Prisma) FAILED ---`, error.message);
        const statusCode = error.message?.startsWith('Forbidden') ? 403 : error.message?.includes('not found') ? 404 : error.message?.includes('status:') ? 400 : 500;
        return NextResponse.json({ message: error.message || 'Failed to release payment.' }, { status: statusCode });
    }
}
