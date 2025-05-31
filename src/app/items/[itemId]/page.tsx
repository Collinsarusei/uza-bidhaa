import { Suspense } from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { ItemDetails } from '@/components/items/item-details';
import { Skeleton } from '@/components/ui/skeleton';
import { Prisma, ItemStatus } from '@prisma/client';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';

interface PageProps {
  params: {
    itemId: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
}

interface TransformedItem {
  id: string;
  title: string;
  description: string;
  price: string;
  quantity: number;
  status: ItemStatus;
  mediaUrls: string[];
  category: string;
  condition?: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  offersDelivery: boolean;
  acceptsInstallments: boolean;
  seller: {
    id: string;
    name: string | null;
    image: string | null;
    email: string | null;
  };
  tracking?: {
    trackingNumber: string;
    carrier: string;
    estimatedDeliveryDays: number;
    notes?: string;
    status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED';
  };
}

export default async function Page({ params }: PageProps) {
  if (!params.itemId) {
    notFound();
  }

  try {
    const session = await getServerSession(authOptions);

    const item = await prisma.item.findUnique({
      where: { id: params.itemId },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
        tracking: true,
      },
    });

    if (!item) {
      notFound();
    }

    const transformedItem: TransformedItem = {
      ...item,
      price: item.price.toString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      status: item.status as ItemStatus,
      tracking: item.tracking
        ? {
            trackingNumber: item.tracking.trackingNumber,
            carrier: item.tracking.carrier,
            estimatedDeliveryDays: item.tracking.estimatedDeliveryDays,
            notes: item.tracking.notes || undefined,
            status: item.tracking.status as 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED',
          }
        : undefined,
      offersDelivery: item.offersDelivery,
      acceptsInstallments: item.acceptsInstallments,
    };

    return (
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <ItemDetails item={transformedItem} session={session} />
      </Suspense>
    );
  } catch (error) {
    console.error('Error fetching item:', error);
    notFound();
  }
}