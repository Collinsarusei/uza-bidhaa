'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  estimatedDeliveryDays: number;
  notes?: string;
  status: string;
  lastUpdated: string;
}

interface TrackingDisplayProps {
  itemId: string;
}

export function TrackingDisplay({ itemId }: TrackingDisplayProps) {
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrackingInfo = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/items/${itemId}/tracking`);
        if (!response.ok) {
          throw new Error('Failed to fetch tracking information');
        }
        const data = await response.json();
        setTrackingInfo(data);
        setError(null);
      } catch (err) {
        setError('Failed to load tracking information');
        console.error('Error fetching tracking:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrackingInfo();
  }, [itemId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!trackingInfo) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">No tracking information available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'IN_TRANSIT':
        return 'bg-blue-500';
      case 'DELAYED':
        return 'bg-yellow-500';
      case 'DELIVERED':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Tracking Information</span>
          <Badge className={getStatusColor(trackingInfo.status)}>
            {trackingInfo.status.replace('_', ' ')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Tracking Number</p>
            <p>{trackingInfo.trackingNumber}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Carrier</p>
            <p>{trackingInfo.carrier}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Estimated Delivery</p>
            <p>{trackingInfo.estimatedDeliveryDays} days</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
            <p>{format(new Date(trackingInfo.lastUpdated), 'PPp')}</p>
          </div>
        </div>
        {trackingInfo.notes && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">Notes</p>
            <p className="mt-1">{trackingInfo.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 