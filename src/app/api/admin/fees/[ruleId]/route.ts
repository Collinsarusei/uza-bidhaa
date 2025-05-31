// src/app/api/admin/fees/[ruleId]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Adjust path as needed
import * as z from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

interface RouteContext {
    params: {
        ruleId: string;
    };
}

// Schema for updating a FeeRule (all fields optional)
const feeRuleUpdateSchema = z.object({
    name: z.string().min(1, "Rule name is required").optional(),
    minAmount: z.number().min(0, "Min amount must be non-negative").optional(),
    maxAmount: z.number().min(0, "Max amount must be non-negative").nullable().optional(),
    feePercentage: z.number().min(0).max(100, "Fee percentage must be between 0 and 100").optional(),
    priority: z.number().int().optional(),
    isActive: z.boolean().optional(),
    description: z.string().optional().nullable(), // Allow explicit null to clear description
}).refine(data => 
    (data.minAmount === undefined || data.maxAmount === undefined || data.maxAmount === null) ||
    data.minAmount <= data.maxAmount,
{
    message: "Min amount cannot be greater than max amount when both are provided",
    path: ["maxAmount"],
});

// GET a single FeeRule by ID
export async function GET(request: Request, context: any) {
    const { ruleId } = context.params;
    console.log(`--- API GET /api/admin/fees/${ruleId} (Prisma) START ---`);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const feeRule = await prisma.feeRule.findUnique({
            where: { id: ruleId }
        });
        if (!feeRule) {
            return NextResponse.json({ message: 'Fee rule not found' }, { status: 404 });
        }
        return NextResponse.json(feeRule, { status: 200 });
    } catch (error: any) {
        console.error(`--- API GET /api/admin/fees/${ruleId} (Prisma) FAILED ---`, error);
        return NextResponse.json({ message: 'Failed to fetch fee rule', error: error.message }, { status: 500 });
    }
}

// PUT to update an existing FeeRule by ID
export async function PUT(request: Request, context: any) {
    const { ruleId } = context.params;
    console.log(`--- API PUT /api/admin/fees/${ruleId} (Prisma) START ---`);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const validation = feeRuleUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        
        const dataToUpdate = validation.data;
        if (Object.keys(dataToUpdate).length === 0) {
            return NextResponse.json({ message: 'No fields provided for update' }, { status: 400 });
        }

        // If minAmount or maxAmount is updated, ensure validity if both are present
        if (dataToUpdate.minAmount !== undefined || dataToUpdate.maxAmount !== undefined) {
            const existingRule = await prisma.feeRule.findUnique({ where: { id: ruleId } });
            if (!existingRule) return NextResponse.json({ message: 'Fee rule not found for validation' }, { status: 404 });
            
            const minAmount = dataToUpdate.minAmount ?? existingRule.minAmount;
            const maxAmount = dataToUpdate.maxAmount === undefined ? existingRule.maxAmount : dataToUpdate.maxAmount; // handles explicit null

            if (maxAmount !== null && minAmount !== null && minAmount > maxAmount) {
                return NextResponse.json({ message: "Min amount cannot be greater than max amount" }, { status: 400 });
            }
        }

        const updatedFeeRule = await prisma.feeRule.update({
            where: { id: ruleId },
            data: dataToUpdate
        });
        return NextResponse.json({ message: 'Fee rule updated successfully', feeRule: updatedFeeRule }, { status: 200 });

    } catch (error: any) {
        console.error(`--- API PUT /api/admin/fees/${ruleId} (Prisma) FAILED ---`, error);
        if (error instanceof PrismaClientKnownRequestError) {
            if (error.code === 'P2002') { // Unique constraint (e.g. name)
                return NextResponse.json({ message: 'A fee rule with this name already exists.', fields: error.meta?.target }, { status: 409 });
            }
            if (error.code === 'P2025') { // Record to update not found
                return NextResponse.json({ message: 'Fee rule not found for update.' }, { status: 404 });
            }
        }
        return NextResponse.json({ message: 'Failed to update fee rule', error: error.message }, { status: 500 });
    }
}

// DELETE a FeeRule by ID
export async function DELETE(request: Request, context: any) {
    const { ruleId } = context.params;
    console.log(`--- API DELETE /api/admin/fees/${ruleId} (Prisma) START ---`);
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        await prisma.feeRule.delete({
            where: { id: ruleId }
        });
        return NextResponse.json({ message: 'Fee rule deleted successfully' }, { status: 200 }); // Or 204 No Content
    } catch (error: any) {
        console.error(`--- API DELETE /api/admin/fees/${ruleId} (Prisma) FAILED ---`, error);
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({ message: 'Fee rule not found for deletion.' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Failed to delete fee rule', error: error.message }, { status: 500 });
    }
}
