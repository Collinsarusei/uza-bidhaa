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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Use Partial to allow for selected fields from API
type DisplayUser = Pick<UserProfile, 'id' | 'name' | 'email' | 'phoneNumber' | 'createdAt' | 'status' | 'location'> & {
    image?: string;
    role?: 'ADMIN' | 'USER';
};

export default function AdminUsersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [users, setUsers] = useState<DisplayUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [processingUserId, setProcessingUserId] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<DisplayUser | null>(null);

    useEffect(() => {
        if (status === 'authenticated') {
             setIsAuthorized((session?.user as any)?.role === 'ADMIN');
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth');
        }
    }, [status, router, session]);

    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/admin/users', {
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data = await response.json();
        setUsers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

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

    const handleViewUser = (user: DisplayUser) => {
        setSelectedUser(user);
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
        <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
            <header>
                <h1 className="text-2xl md:text-3xl font-bold">User Management</h1>
                <p className="text-sm md:text-base text-muted-foreground">
                    View and manage registered users on the platform.
                </p>
            </header>

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
                        <CardTitle>Users</CardTitle>
                        <CardDescription>
                            Total: {users.length} user(s)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {users.length === 0 ? (
                            <p className="text-muted-foreground">No users to display.</p>
                        ) : (
                            <div className="overflow-x-auto -mx-4 md:mx-0">
                                <div className="inline-block min-w-full align-middle">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="whitespace-nowrap">Name</TableHead>
                                                <TableHead className="whitespace-nowrap">Email</TableHead>
                                                <TableHead className="hidden md:table-cell">Phone</TableHead>
                                                <TableHead className="whitespace-nowrap">Role</TableHead>
                                                <TableHead className="whitespace-nowrap">Joined</TableHead>
                                                <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {users.map((user) => (
                                                <TableRow key={user.id}>
                                                    <TableCell className="whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={user.image || undefined} alt={user.name || ''} />
                                                                <AvatarFallback>{user.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                                                            </Avatar>
                                                            <span>{user.name || 'Unnamed User'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">{user.email}</TableCell>
                                                    <TableCell className="hidden md:table-cell">{user.phoneNumber || 'Not set'}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                                            {user.role}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {formatDate(user.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="text-right whitespace-nowrap">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleViewUser(user)}
                                                        >
                                                            <Icons.eye className="h-4 w-4" />
                                                            <span className="sr-only">View</span>
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

            {/* User Dialog */}
            <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>User Details</DialogTitle>
                    </DialogHeader>
                    {selectedUser && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={selectedUser.image || undefined} alt={selectedUser.name || ''} />
                                    <AvatarFallback>{selectedUser.name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <h3 className="text-lg font-semibold">{selectedUser.name || 'Unnamed User'}</h3>
                                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                                </div>
                            </div>
                            <div>
                                <Label>Phone Number</Label>
                                <p className="text-sm">{selectedUser.phoneNumber || 'Not set'}</p>
                            </div>
                            <div>
                                <Label>Role</Label>
                                <Badge variant={selectedUser.role === 'ADMIN' ? 'default' : 'secondary'}>
                                    {selectedUser.role}
                                </Badge>
                            </div>
                            <div>
                                <Label>Joined</Label>
                                <p className="text-sm">{formatDate(selectedUser.createdAt)}</p>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setSelectedUser(null)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
