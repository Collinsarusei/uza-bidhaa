'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from 'next/link';

// Define types (assumed, adjust based on your actual types)
interface Payment {
    id: string;
    amount: number;
    status: string;
    // Add other relevant payment properties
}

interface Item {
    id: string;
    title: string;
    description: string;
    mediaUrls: string[];
    sellerId: string;
    // Add other relevant item properties
}

function FileDisputeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const paymentId = searchParams ? searchParams.get('paymentId') : null;
  const itemId = searchParams ? searchParams.get('itemId') : null;

  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<Payment | null>(null);
  const [itemDetails, setItemDetails] = useState<Item | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(true);
  const [userRole, setUserRole] = useState<'buyer' | 'seller' | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      setIsFetchingDetails(true);
      try {
        if (!paymentId || !itemId) {
          console.error("Missing paymentId or itemId");
          return;
        }

        // Fetch payment details
        const paymentResponse = await fetch(`/api/payments/${paymentId}`);
        if (!paymentResponse.ok) {
          console.error("Failed to fetch payment details");
          return;
        }
        const paymentData = await paymentResponse.json();
        setPaymentDetails(paymentData as Payment);

        // Fetch item details (assuming you have an API endpoint for this)
        const itemResponse = await fetch(`/api/items/${itemId}`);
        if (!itemResponse.ok) {
          console.error("Failed to fetch item details");
          return;
        }
        const itemData = await itemResponse.json();
        setItemDetails(itemData as Item);

        // Determine user role (buyer or seller)
        if (session?.user?.id === itemDetails?.sellerId) {
          setUserRole('seller');
        } else {
          setUserRole('buyer');
        }
      } finally {
        setIsFetchingDetails(false);
      }
    };

    if (paymentId && itemId && session?.user?.id) {
      fetchDetails();
    }
  }, [paymentId, itemId, session?.user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Implement your dispute submission logic here
      // Make an API request to create the dispute
      const response = await fetch('/api/disputes/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: paymentId,
          itemId: itemId,
          reason: reason,
          description: description,
          userId: session?.user?.id,
          userRole: userRole,
        }),
      });

      if (!response.ok) {
        console.error("Failed to create dispute");
        return;
      }

      // Handle success (e.g., show a success message, redirect)
      router.push('/dashboard'); // Redirect to dashboard after filing dispute
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-semibold mb-4">File a Dispute</h1>

      {isFetchingDetails ? (
        <p>Loading details...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dispute Details</CardTitle>
            <CardDescription>Provide the necessary information to file your dispute.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700">Reason for Dispute</label>
                <select
                  id="reason"
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                >
                  <option value="">Select a reason</option>
                  <option value="Damaged item">Damaged item</option>
                  <option value="Item not as described">Item not as described</option>
                  <option value="Didn't receive item">Didn't receive item</option>
                  {/* Add more reasons as needed */}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  id="description"
                  rows={4}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    "Submit Dispute"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function FileDisputePage() {
  return (
    <Suspense fallback={<p>Loading dispute form...</p>}>
      <FileDisputeContent />
    </Suspense>
  );
}