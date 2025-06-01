import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { handleApiError, validateAdmin, AppError } from '@/lib/error-handling';
import * as z from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

// Required Next.js configuration for dynamic API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const dynamicParams = true; // Explicitly allow all dynamic segments

// Explicitly tell Next.js not to try to statically generate this route
export async function generateStaticParams() {
  return []; // Return empty array to indicate no static paths
}

interface RouteParams {
    params: {
        id: string;
    };
}

// Schema for updating fee rule
const feeRuleUpdateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    feePercentage: z.number().min(0).max(100).optional(),
    minAmount: z.number().min(0).optional().nullable(),
    maxAmount: z.number().min(0).optional().nullable(),
    isActive: z.boolean().optional(),
});

// GET a single FeeRule by ID
export async function GET(request: Request, context: RouteParams) {
    const { id } = context.params;
    console.log(`--- API GET /api/admin/fee-rules/${id} (Prisma) START ---`);

    try {
        const adminId = validateAdmin(await getServerSession(authOptions));

        const feeRule = await prisma.feeRule.findUnique({
            where: { id }
        });

        if (!feeRule) {
            throw new AppError('Fee rule not found', 404);
        }

        console.log(`API /admin/fee-rules/${id}: Fee rule found successfully`);
        console.log("--- API GET /api/admin/fee-rules/[id] (Prisma) SUCCESS ---");
        return NextResponse.json(feeRule, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}

// PUT to update an existing FeeRule by ID
export async function PUT(request: Request, context: RouteParams) {
    const { id } = context.params;
    console.log(`--- API PUT /api/admin/fee-rules/${id} (Prisma) START ---`);

    try {
        const adminId = validateAdmin(await getServerSession(authOptions));

        const body = await request.json();
        const validation = feeRuleUpdateSchema.safeParse(body);

        if (!validation.success) {
            throw new AppError('Invalid input', 400);
        }
        
        const dataToUpdate = validation.data;
        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No fields provided for update', 400);
        }

        // If minAmount or maxAmount is updated, ensure validity if both are present
        if (dataToUpdate.minAmount !== undefined || dataToUpdate.maxAmount !== undefined) {
            const existingRule = await prisma.feeRule.findUnique({ where: { id } });
            if (!existingRule) {
                throw new AppError('Fee rule not found for validation', 404);
            }
            
            const minAmount = dataToUpdate.minAmount !== undefined && dataToUpdate.minAmount !== null
                ? new Decimal(dataToUpdate.minAmount.toString())
                : existingRule.minAmount;
            const maxAmount = dataToUpdate.maxAmount !== undefined && dataToUpdate.maxAmount !== null
                ? new Decimal(dataToUpdate.maxAmount.toString())
                : existingRule.maxAmount;

            if (maxAmount !== null && minAmount !== null && minAmount.gt(maxAmount)) {
                throw new AppError('Min amount cannot be greater than max amount', 400);
            }
        }

        const updatedFeeRule = await prisma.feeRule.update({
            where: { id },
            data: dataToUpdate
        });

        console.log(`API /admin/fee-rules/${id}: Fee rule updated successfully`);
        console.log("--- API PUT /api/admin/fee-rules/[id] (Prisma) SUCCESS ---");
        return NextResponse.json({ message: 'Fee rule updated successfully', feeRule: updatedFeeRule }, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}

// DELETE a FeeRule by ID
export async function DELETE(request: Request, context: RouteParams) {
    const { id } = context.params;
    console.log(`--- API DELETE /api/admin/fee-rules/${id} (Prisma) START ---`);

    try {
        const adminId = validateAdmin(await getServerSession(authOptions));

        const feeRule = await prisma.feeRule.findUnique({
            where: { id }
        });

        if (!feeRule) {
            throw new AppError('Fee rule not found', 404);
        }

        await prisma.feeRule.delete({
            where: { id }
        });

        console.log(`API /admin/fee-rules/${id}: Fee rule deleted successfully`);
        console.log("--- API DELETE /api/admin/fee-rules/[id] (Prisma) SUCCESS ---");
        return NextResponse.json({ message: 'Fee rule deleted successfully' }, { status: 200 });

    } catch (error) {
        return handleApiError(error);
    }
}
