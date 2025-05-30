'use client';

import { useRouter } from 'next/navigation';
import { Session } from 'next-auth';
import { TrackingForm } from './tracking-form';
import { TrackingDisplay } from './tracking-display';
import { Item } from '@/lib/types';

interface ItemDetailsProps {
  item: Item & {
    tracking?: {
      trackingNumber: string;
      carrier: string;
      estimatedDeliveryDays: number;
      notes?: string;
      status: 'IN_TRANSIT' | 'DELAYED' | 'DELIVERED';
    };
  };
  session: Session | null;
}

export function ItemDetails({ item, session }: ItemDetailsProps) {
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