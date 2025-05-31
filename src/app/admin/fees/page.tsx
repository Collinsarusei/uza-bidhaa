// src/app/admin/fees/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_FEE_PERCENTAGE = 10;

export default function AdminFeesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [currentFee, setCurrentFee] = useState<number | null>(null);
    const [newFee, setNewFee] = useState<string>(''); // Input is string
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);


    useEffect(() => {
        // Rudimentary admin check - replace with proper role-based auth in a real app
        // This is just a placeholder for the UI behavior
        if (status === 'authenticated') {
            // Example: Check if user's email matches an admin email from env (NOT secure)
            // Or, better, check a custom claim if you've set one up.
            // For this example, we'll just assume authenticated user is admin if no specific check.
            setIsAuthorized(true); 
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth'); // Redirect if not logged in
        }
    }, [status, router, session]);

    useEffect(() => {
        const fetchFee = async () => {
            if (!isAuthorized) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch('/api/admin/fees', {
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                         setIsAuthorized(false);
                         setError("You are not authorized to view this page.");
                         toast({ title: "Unauthorized", description: "You do not have permission to manage fees.", variant: "destructive"});
                         // router.push('/dashboard'); // Optional: redirect non-admins
                         return;
                    }
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.message || `Failed to fetch fee: ${response.status}`);
                }
                const data = await response.json();
                setCurrentFee(data.feePercentage ?? DEFAULT_FEE_PERCENTAGE);
                setNewFee((data.feePercentage ?? DEFAULT_FEE_PERCENTAGE).toString());
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not load fee settings.';
                setError(message);
                toast({ title: "Error", description: message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        if (isAuthorized === true) { // Only fetch if authorized check passed
            fetchFee();
        } else if (isAuthorized === false) {
             setIsLoading(false); // Stop loading if not authorized
        }
    }, [isAuthorized, toast]);

    const handleUpdateFee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newFee === '' || isNaN(parseFloat(newFee))) {
            toast({ title: "Invalid Input", description: "Please enter a valid number for the fee.", variant: "destructive" });
            return;
        }
        const feeValue = parseFloat(newFee);
        if (feeValue < 0 || feeValue > 100) {
            toast({ title: "Invalid Range", description: "Fee percentage must be between 0 and 100.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/fees', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feePercentage: feeValue }),
            });
            const result = await response.json();
            if (!response.ok) {
                 if (response.status === 401 || response.status === 403) {
                     setIsAuthorized(false);
                     setError("You are not authorized to perform this action.");
                 }
                throw new Error(result.message || `Failed to update fee: ${response.status}`);
            }
            setCurrentFee(result.feePercentage);
            setNewFee(result.feePercentage.toString());
            toast({ title: "Success", description: `Platform fee updated to ${result.feePercentage}%.` });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not update fee settings.';
            setError(message);
            toast({ title: "Update Error", description: message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    if (status === 'loading' || isAuthorized === null) {
        return (
            <div className="container mx-auto p-4 md:p-8 max-w-2xl">
                <Skeleton className="h-8 w-1/2 mb-2" />
                <Skeleton className="h-4 w-3/4 mb-6" />
                <Card>
                    <CardHeader><Skeleton className="h-6 w-1/3 mb-1" /><Skeleton className="h-4 w-2/3" /></CardHeader>
                    <CardContent className="space-y-4">
                        <div><Skeleton className="h-5 w-1/4 mb-1" /><Skeleton className="h-10 w-full" /></div>
                        <div><Skeleton className="h-5 w-1/4 mb-1" /><Skeleton className="h-10 w-full" /></div>
                    </CardContent>
                    <CardFooter><Skeleton className="h-10 w-28" /></CardFooter>
                </Card>
            </div>
        );
    }
    
    if (!isAuthorized) {
         return (
             <div className="container mx-auto p-4 md:p-8 max-w-lg text-center">
                 <Alert variant="destructive">
                     <Icons.alertTriangle className="h-4 w-4" />
                     <AlertTitle>Access Denied</AlertTitle>
                     <AlertDescription>
                         You do not have permission to access this page.
                     </AlertDescription>
                 </Alert>
                 <Button onClick={() => router.push('/dashboard')} variant="link" className="mt-4">Go to Dashboard</Button>
             </div>
         );
    }


    return (
        <div className="container mx-auto p-4 md:p-8 max-w-2xl">
            <h1 className="text-3xl font-bold mb-2">Admin Settings</h1>
            <p className="text-muted-foreground mb-6">Manage platform configurations.</p>

            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>Platform Fee Management</CardTitle>
                    <CardDescription>
                        Set the percentage deducted as a platform fee from each successful sale.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleUpdateFee}>
                    <CardContent className="space-y-6">
                        {isLoading && !currentFee && (
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-1/3 mb-1" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        )}
                        {!isLoading && currentFee !== null && (
                            <div>
                                <Label className="text-sm font-medium">Current Fee</Label>
                                <p className="text-2xl font-semibold">{currentFee}%</p>
                                <p className="text-xs text-muted-foreground">
                                    This is the current percentage taken from sales.
                                </p>
                            </div>
                        )}
                        
                        <div className="space-y-1.5">
                            <Label htmlFor="newFee">New Fee Percentage (%)</Label>
                            <Input
                                id="newFee"
                                type="number"
                                value={newFee}
                                onChange={(e) => setNewFee(e.target.value)}
                                placeholder="e.g., 10"
                                min="0"
                                max="100"
                                step="0.1"
                                disabled={isLoading || isSaving}
                                required
                                className="max-w-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                Enter a value between 0 and 100 (e.g., 10 for 10%).
                            </p>
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <Icons.alertTriangle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isLoading || isSaving}>
                            {isSaving && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                            {isSaving ? 'Saving...' : 'Update Fee'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
