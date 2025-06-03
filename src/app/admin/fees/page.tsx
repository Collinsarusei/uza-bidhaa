// src/app/admin/fees/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

interface Fee {
  id: string;
  amount: number;
  fee: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminFeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [fees, setFees] = useState<Fee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      setIsAuthorized((session?.user as any)?.role === 'ADMIN');
    } else if (status === 'unauthenticated') {
      setIsAuthorized(false);
      router.push('/auth');
    }
  }, [status, router, session]);

  const fetchFees = async () => {
    try {
      const response = await fetch('/api/admin/fees', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch fees');
      }
      const data = await response.json();
      setFees(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fees');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized === true) {
      fetchFees();
    } else if (isAuthorized === false && status === 'authenticated') {
      setError("You are not authorized to view this page.");
      setIsLoading(false);
    }
  }, [isAuthorized, status]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'PPpp');
    } catch {
      return 'Invalid Date';
    }
  };

  if (status === 'loading' || isAuthorized === null) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Skeleton className="h-8 w-1/2 mb-2" />
        <Skeleton className="h-4 w-3/4 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Transaction Fees</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          View and manage transaction fee rates.
        </p>
      </header>

      {isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && (
        <Card>
          <CardHeader>
            <CardTitle>Fee Rates</CardTitle>
            <CardDescription>
              Total: {fees.length} fee rate(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fees.length === 0 ? (
              <p className="text-muted-foreground">No fee rates to display.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Amount</TableHead>
                        <TableHead className="whitespace-nowrap">Fee</TableHead>
                        <TableHead className="whitespace-nowrap">Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fees.map((fee) => (
                        <TableRow key={fee.id}>
                          <TableCell className="whitespace-nowrap">
                            KES {fee.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            KES {fee.fee.toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(fee.updatedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
