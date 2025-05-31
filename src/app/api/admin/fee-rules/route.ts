import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import * as z from 'zod';
import { Prisma } from '@prisma/client';
import { Decimal, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

// Schema for creating/updating a FeeRule
const feeRuleSchema = z.object({
    name: z.string().min(1, "Rule name is required"),
    minAmount: z.preprocess((val) => new Decimal(val as any), z.instanceof(Decimal).refine(d => d.gte(0), "Min amount must be non-negative")),
    maxAmount: z.preprocess((val) => val === null || val === undefined ? null : new Decimal(val as any), z.instanceof(Decimal).nullable().refine(d => d === null || d.gte(0), "Max amount must be non-negative if provided")),
    feePercentage: z.preprocess((val) => new Decimal(val as any), z.instanceof(Decimal).refine(d => d.gte(0) && d.lte(100), "Fee percentage must be between 0 and 100")),
    priority: z.number().int().optional().default(0),
    isActive: z.boolean().optional().default(true),
    description: z.string().optional(),
}).refine(data => data.maxAmount === null || data.minAmount.lte(data.maxAmount), {
    message: "Min amount cannot be greater than max amount",
    path: ["maxAmount"],
});

// Schema for updating the default platform fee percentage
const defaultFeeUpdateSchema = z.object({
    defaultFeePercentage: z.preprocess((val) => new Decimal(val as any), z.instanceof(Decimal).refine(d => d.gte(0) && d.lte(100), "Default fee percentage must be between 0 and 100")),
});

export async function GET(request: Request) {
    console.log("--- API GET /api/admin/fee-rules (Prisma) START ---");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const feeRules = await prisma.feeRule.findMany({
            orderBy: [{ priority: 'desc' }, { minAmount: 'asc' }]
        });
        const platformSettings = await prisma.platformSetting.findUnique({
            where: { id: 'global_settings' }
        });

        return NextResponse.json({
            feeRules: feeRules,
            defaultFeePercentage: platformSettings?.defaultFeePercentage ?? new Decimal(0) 
        }, { status: 200 });

    } catch (error: any) {
        console.error("--- API GET /api/admin/fee-rules (Prisma) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to fetch fee settings', error: error.message }, { status: 500 });
    }
}

// POST to create a new FeeRule
export async function POST(req: Request) {
    console.log("--- API POST /api/admin/fee-rules (Prisma Create FeeRule) START ---");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const validation = feeRuleSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const data = validation.data;

        const newFeeRule = await prisma.feeRule.create({
            data: {
                name: data.name,
                minAmount: data.minAmount,
                maxAmount: data.maxAmount,
                feePercentage: data.feePercentage,
                priority: data.priority,
                isActive: data.isActive,
                description: data.description,
            }
        });
        return NextResponse.json({ message: 'Fee rule created successfully', feeRule: newFeeRule }, { status: 201 });

    } catch (error: any) {
        console.error("--- API POST /api/admin/fee-rules (Prisma Create FeeRule) FAILED ---", error);
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ message: 'A fee rule with this name already exists.', fields: error.meta?.target }, { status: 409 });
        }
        return NextResponse.json({ message: 'Failed to create fee rule', error: error.message }, { status: 500 });
    }
}

// PUT to update PlatformSetting.defaultFeePercentage
export async function PUT(req: Request) {
    console.log("--- API PUT /api/admin/fee-rules (Prisma Update Default Fee) START ---");
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await req.json();
        const validation = defaultFeeUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ message: 'Invalid input for default fee percentage', errors: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        const { defaultFeePercentage } = validation.data;

        const updatedSettings = await prisma.platformSetting.upsert({
            where: { id: 'global_settings' },
            update: { defaultFeePercentage: defaultFeePercentage },
            create: { id: 'global_settings', defaultFeePercentage: defaultFeePercentage, totalPlatformFees: 0 } // Create if doesn't exist
        });
        return NextResponse.json({ message: 'Default platform fee updated successfully', platformSettings: updatedSettings }, { status: 200 });

    } catch (error: any) {
        console.error("--- API PUT /api/admin/fee-rules (Prisma Update Default Fee) FAILED ---", error);
        return NextResponse.json({ message: 'Failed to update default fee settings', error: error.message }, { status: 500 });
    }
} 