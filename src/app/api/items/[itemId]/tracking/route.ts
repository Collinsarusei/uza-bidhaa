import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const trackingSchema = z.object({
  trackingNumber: z.string().min(1, "Tracking number is required"),
  carrier: z.string().min(1, "Carrier is required"),
  estimatedDeliveryDays: z.number().min(1, "Estimated delivery days must be at least 1"),
  notes: z.string().optional(),
  status: z.enum(['IN_TRANSIT', 'DELAYED', 'DELIVERED']),
});

// POST /api/items/[itemId]/tracking - Add or update tracking information
export async function POST(
  request: Request,
  { params }: { params: { itemId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id: params.itemId },
      include: { 
        seller: true,
        payments: {
          where: {
            status: 'SUCCESSFUL_ESCROW'
          },
          include: {
            buyer: true
          }
        }
      }
    });

    if (!item) {
      return NextResponse.json({ message: 'Item not found' }, { status: 404 });
    }

    if (item.sellerId !== session.user.id) {
      return NextResponse.json({ message: 'Only the seller can update tracking information' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = trackingSchema.parse(body);

    const tracking = await prisma.itemTracking.upsert({
      where: { itemId: params.itemId },
      update: {
        ...validatedData,
        lastUpdated: new Date(),
      },
      create: {
        itemId: params.itemId,
        ...validatedData,
        lastUpdated: new Date(),
      },
    });

    // Create notification for the buyer
    const successfulPayment = item.payments[0];
    if (successfulPayment?.buyer) {
      let notificationMessage = '';
      switch (validatedData.status) {
        case 'IN_TRANSIT':
          notificationMessage = `Your item "${item.title}" has been shipped and is in transit. Tracking number: ${validatedData.trackingNumber}`;
          break;
        case 'DELAYED':
          notificationMessage = `There's a delay in the delivery of your item "${item.title}". ${validatedData.notes ? `Reason: ${validatedData.notes}` : ''}`;
          break;
        case 'DELIVERED':
          notificationMessage = `Your item "${item.title}" has been delivered!`;
          break;
        default:
          notificationMessage = `Tracking information has been updated for your item "${item.title}"`;
      }

      await prisma.notification.create({
        data: {
          userId: successfulPayment.buyer.id,
          type: 'tracking_updated',
          message: notificationMessage,
          relatedItemId: item.id,
        },
      });
    }

    return NextResponse.json(tracking);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating tracking:', error);
    return NextResponse.json(
      { message: 'Failed to update tracking information' },
      { status: 500 }
    );
  }
}

// GET /api/items/[itemId]/tracking - Get tracking information
export async function GET(
  request: Request,
  { params }: { params: { itemId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = await prisma.item.findUnique({
      where: { id: params.itemId },
      include: { 
        seller: true,
        payments: {
          where: {
            status: 'SUCCESSFUL_ESCROW'
          },
          include: {
            buyer: true
          }
        }
      }
    });

    if (!item) {
      return NextResponse.json({ message: 'Item not found' }, { status: 404 });
    }

    // Only seller and buyer can view tracking information
    const successfulPayment = item.payments[0];
    if (item.sellerId !== session.user.id && successfulPayment?.buyer?.id !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized to view tracking information' }, { status: 403 });
    }

    const tracking = await prisma.itemTracking.findUnique({
      where: { itemId: params.itemId },
    });

    return NextResponse.json(tracking);
  } catch (error) {
    console.error('Error fetching tracking:', error);
    return NextResponse.json(
      { message: 'Failed to fetch tracking information' },
      { status: 500 }
    );
  }
} 