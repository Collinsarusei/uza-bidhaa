// src/app/admin/users/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
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
import type { UserProfile } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Use Partial to allow for selected fields from API
type DisplayUser = Pick<UserProfile, 'id' | 'name' | 'email' | 'phoneNumber' | 'createdAt' | 'isSuspended' | 'location'>;

export default function AdminUsersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [users, setUsers] = useState<DisplayUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [processingUserId, setProcessingUserId] = useState<string | null>(null);

    useEffect(() => {
        if (status === 'authenticated') {
             setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth');
        }
    }, [status, router, session]);

    const fetchUsers = useCallback(async () => {
        if (!isAuthorized) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/admin/users');
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                 if (response.status === 401 || response.status === 403) {
                     setIsAuthorized(false);
                     setError("You are not authorized to view this page.");
                     return;
                 }
                throw new Error(errData.message || `Failed to fetch users: ${response.status}`);
            }
            const data = await response.json();
            setUsers(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load users.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        if (isAuthorized === true) {
            fetchUsers();
        } else if (isAuthorized === false && status === 'authenticated') {
            setError("You are not authorized to view this page.");
            setIsLoading(false);
        }
    }, [isAuthorized, status, fetchUsers]);


    const handleToggleSuspendUser = async (userId: string, currentSuspendedStatus: boolean | undefined) => {
        if (userId === session?.user?.id) {
            toast({ title: "Action Denied", description: "Admin cannot suspend their own account.", variant: "destructive" });
            return;
        }
        setProcessingUserId(userId);
        const newSuspendedStatus = !(currentSuspendedStatus ?? false);
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSuspended: newSuspendedStatus }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Failed to update user status.`);
            }
            toast({ title: "Success", description: `User ${newSuspendedStatus ? 'suspended' : 'reactivated'}.` });
            fetchUsers(); // Refresh data
        } catch (err) {
            const message = err instanceof Error ? err.message : `Could not update user status.`;
            toast({ title: "Action Error", description: message, variant: "destructive" });
        } finally {
            setProcessingUserId(null);
        }
    };
    
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'PP');
        } catch {
            return 'Invalid Date';
        }
    };

    if (status === 'loading' || isAuthorized === null) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-3/4 mb-4" />
                <Card><CardHeader><Skeleton className="h-6 w-1/3" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
            </div>
        );
    }
    
    if (!isAuthorized) {
         return (
             <Alert variant="destructive">
                 <Icons.alertTriangle className="h-4 w-4" />
                 <AlertTitle>Access Denied</AlertTitle>
                 <AlertDescription>You do not have permission to access this page.</AlertDescription>
             </Alert>
         );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">
                View and manage registered users on the platform.
            </p>

            {isLoading && (
                <Card>
                    <CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full" /></CardContent>
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
                        <CardTitle>Registered Users</CardTitle>
                        <CardDescription>
                            Total: {users.length} user(s)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {users.length === 0 ? (
                            <p className="text-muted-foreground">No users found.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>{user.phoneNumber || 'N/A'}</TableCell>
                                            <TableCell>{formatDate(user.createdAt)}</TableCell>
                                            <TableCell>
                                                <Badge variant={user.isSuspended ? 'destructive' : 'secondary'}>
                                                    {user.isSuspended ? 'Suspended' : 'Active'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                 <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            variant={user.isSuspended ? "secondary" : "destructive"}
                                                            size="sm"
                                                            disabled={processingUserId === user.id || user.id === session?.user?.id}
                                                        >
                                                            {processingUserId === user.id ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                            {user.isSuspended ? 'Reactivate' : 'Suspend'}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                {user.isSuspended ? 'Reactivate User?' : 'Suspend User?'}
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Are you sure you want to {user.isSuspended ? 'reactivate' : 'suspend'} the account for {user.name || user.email}?
                                                                {user.isSuspended ? ' They will regain access to the platform.' : ' They will lose access to their account.'}
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={processingUserId === user.id}>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction 
                                                                onClick={() => handleToggleSuspendUser(user.id, user.isSuspended)} 
                                                                disabled={processingUserId === user.id}
                                                                className={user.isSuspended ? "" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
                                                            >
                                                                {processingUserId === user.id ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                                Confirm {user.isSuspended ? 'Reactivation' : 'Suspension'}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
