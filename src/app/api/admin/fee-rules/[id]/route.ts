import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// PUT /api/admin/fee-rules/[id]
export async function PUT(
    req: Request,
    context: any
) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session?.user || session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { name, description, minAmount, maxAmount, feePercentage, priority } = body;

        // Validate required fields
        if (!name || minAmount === undefined || feePercentage === undefined) {
            return new NextResponse('Missing required fields', { status: 400 });
        }

        // Validate numeric values
        if (minAmount < 0 || feePercentage < 0 || feePercentage > 100) {
            return new NextResponse('Invalid numeric values', { status: 400 });
        }

        // Update the fee rule
        const rule = await prisma.feeRule.update({
            where: { id: context.params.id },
            data: {
                name,
                description,
                minAmount,
                maxAmount,
                feePercentage,
                isActive: true,
                priority: priority ?? 0
            }
        });

        return NextResponse.json(rule);
    } catch (error) {
        console.error('Error updating fee rule:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// DELETE /api/admin/fee-rules/[id]
export async function DELETE(
    req: Request,
    context: any
) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session?.user || session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await prisma.feeRule.delete({
            where: { id: context.params.id }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting fee rule:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 