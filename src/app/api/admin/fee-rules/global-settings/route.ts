import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET /api/admin/fee-rules/global-settings
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session?.user || session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const settings = await prisma.platformSetting.findFirst();
        return NextResponse.json(settings || { defaultFeePercentage: 5 });
    } catch (error) {
        console.error('Error fetching global settings:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// PUT /api/admin/fee-rules/global-settings
export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        if (!session?.user || session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { defaultFeePercentage } = body;

        if (defaultFeePercentage === undefined || defaultFeePercentage < 0 || defaultFeePercentage > 100) {
            return new NextResponse('Invalid fee percentage', { status: 400 });
        }

        // Update or create global settings
        const settings = await prisma.platformSetting.upsert({
            where: { id: 'global_settings' },
            update: { defaultFeePercentage },
            create: {
                id: 'global_settings',
                defaultFeePercentage
            }
        });

        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error updating global settings:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
} 