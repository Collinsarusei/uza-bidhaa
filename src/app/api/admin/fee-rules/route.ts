import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/admin/fee-rules
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session?.user || session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const [rules, globalSettings] = await Promise.all([
            prisma.feeRule.findMany({
                orderBy: { priority: 'desc' }
            }),
            // Assuming the model name is 'GlobalSetting' based on common naming conventions
            // If the actual model name is different, this will need to be adjusted.
            // The lint error 'Property 'globalSettings' does not exist' suggests the model name is incorrect.
            prisma.platformSetting.findFirst()
        ]);

        return NextResponse.json({
            rules,
            globalSettings: globalSettings || { defaultFeePercentage: 5 } // Default to 5% if not set
        });
    } catch (error) {
        console.error('Error fetching fee rules:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// POST /api/admin/fee-rules
export async function POST(req: Request) {
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

        // Create the fee rule
        const rule = await prisma.feeRule.create({
            data: {
                name,
                description,
                minAmount,
                maxAmount,
                feePercentage,
                priority: priority || 0,
                isActive: true
            }
        });

        return NextResponse.json(rule);
    } catch (error) {
        console.error('Error creating fee rule:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 