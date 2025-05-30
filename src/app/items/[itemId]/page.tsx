'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { TrackingForm } from '@/components/items/tracking-form';
import { TrackingDisplay } from '@/components/items/tracking-display';

interface ItemDetailsProps {
  item: {
    id: string;
    sellerId: string;
    status: string;
    tracking?: {
      trackingNumber: string;
      carrier: string;
      estimatedDeliveryDays: number;
      notes?: string;
      status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED';
    };
  };
}

export default function ItemDetails({ item }: ItemDetailsProps) {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div className="container mx-auto py-8">
      {/* ... other item details ... */}
      
      {item.status === 'PAID_ESCROW' && (
        <div className="mt-6">
          {session?.user?.id === item.sellerId ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Update Tracking Information</h3>
              <TrackingForm 
                itemId={item.id} 
                initialData={item.tracking}
                onSuccess={() => {
                  // Refresh item data
                  router.refresh();
                }}
              />
            </div>
          ) : (
            <TrackingDisplay itemId={item.id} />
          )}
        </div>
      )}
    </div>
  );
} 