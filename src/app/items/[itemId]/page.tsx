import React, { Suspense } from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { ItemDetails } from '@/components/items/item-details';
import { Skeleton } from '@/components/ui/skeleton';

// Properly typed props for dynamic route
interface ItemPageProps {
  params: {
    itemId: string;
  };
}

export default async function ItemPage({ params }: ItemPageProps): Promise<JSX.Element> {
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
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl text-center text-muted-foreground">
        <p>Item not found.</p>
      </div>
    );
  }

  // Transform the data to match expected types
  const transformedItem = {
    ...item,
    price: item.price.toString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    tracking: item.tracking
      ? {
          trackingNumber: item.tracking.trackingNumber,
          carrier: item.tracking.carrier,
          estimatedDeliveryDays: item.tracking.estimatedDeliveryDays,
          notes: item.tracking.notes || undefined,
          status: item.tracking.status as 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED',
        }
      : undefined,
  };

  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <ItemDetails item={transformedItem} session={session} />
    </Suspense>
  );
}
