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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface WithdrawFee {
  id: string;
  amount: number;
  fee: number;
}

export default function WithdrawFeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [withdrawFees, setWithdrawFees] = useState<WithdrawFee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [selectedFee, setSelectedFee] = useState<WithdrawFee | null>(null);
  const [newFee, setNewFee] = useState<string>('');

  useEffect(() => {
    if (status === 'authenticated') {
      setIsAuthorized((session?.user as any)?.role === 'ADMIN');
    } else if (status === 'unauthenticated') {
      setIsAuthorized(false);
      router.push('/auth');
    }
  }, [status, router, session]);

  const fetchWithdrawFees = async () => {
    try {
      const response = await fetch('/api/admin/withdraw-fees', {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch withdraw fees');
      }
      const data = await response.json();
      setWithdrawFees(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load withdraw fees');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized === true) {
      fetchWithdrawFees();
    } else if (isAuthorized === false && status === 'authenticated') {
      setError("You are not authorized to view this page.");
      setIsLoading(false);
    }
  }, [isAuthorized, status]);

  const handleFeeUpdate = async () => {
    if (!selectedFee || !newFee) return;
    
    try {
      const response = await fetch(`/api/admin/withdraw-fees/${selectedFee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fee: parseFloat(newFee) }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update fee');
      }
      
      toast({
        title: "Success",
        description: "Withdraw fee updated successfully.",
      });
      
      await fetchWithdrawFees();
      setSelectedFee(null);
      setNewFee('');
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to update fee',
        variant: "destructive",
      });
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
        <h1 className="text-2xl md:text-3xl font-bold">Withdraw Fees</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage withdrawal fee rates for different amounts.
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
              Total: {withdrawFees.length} fee rate(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {withdrawFees.length === 0 ? (
              <p className="text-muted-foreground">No fee rates to display.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Amount</TableHead>
                        <TableHead className="whitespace-nowrap">Fee</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
            {withdrawFees.map((fee) => (
                        <TableRow key={fee.id}>
                          <TableCell className="whitespace-nowrap">
                            KES {fee.amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            KES {fee.fee.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedFee(fee);
                                setNewFee(fee.fee.toString());
                              }}
                            >
                              <Icons.edit className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
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

      {/* Edit Fee Dialog */}
      <Dialog open={!!selectedFee} onOpenChange={() => setSelectedFee(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Withdraw Fee</DialogTitle>
          </DialogHeader>
          {selectedFee && (
            <div className="space-y-4">
              <div>
                <Label>Amount</Label>
                <p className="text-sm">KES {selectedFee.amount.toLocaleString()}</p>
              </div>
              <div>
                <Label htmlFor="fee">New Fee</Label>
                <Input
                  id="fee"
                  type="number"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  placeholder="Enter new fee amount"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedFee(null)}>
                  Cancel
                </Button>
                <Button onClick={handleFeeUpdate}>
                  Save Changes
                </Button>
              </DialogFooter>
      </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 