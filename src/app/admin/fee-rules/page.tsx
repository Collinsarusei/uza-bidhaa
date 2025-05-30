'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from 'date-fns';

interface FeeRule {
    id: string;
    name: string;
    description?: string;
    minAmount: number;
    maxAmount?: number;
    feePercentage: number;
    isActive: boolean;
    priority: number;
    createdAt: string;
    updatedAt: string;
}

interface GlobalSettings {
    defaultFeePercentage: number;
}

export default function AdminFeeRulesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [feeRules, setFeeRules] = useState<FeeRule[]>([]);
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<FeeRule | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        minAmount: '',
        maxAmount: '',
        feePercentage: '',
        priority: '0'
    });

    useEffect(() => {
        if (status === 'authenticated') {
            setIsAuthorized(session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL);
        } else if (status === 'unauthenticated') {
            setIsAuthorized(false);
            router.push('/auth');
        }
    }, [status, router, session]);

    const fetchFeeRules = async () => {
        if (!isAuthorized) return;
        
        try {
            const response = await fetch('/api/admin/fee-rules');
            if (!response.ok) {
                throw new Error('Failed to fetch fee rules');
            }
            const data = await response.json();
            setFeeRules(data.rules);
            setGlobalSettings(data.globalSettings);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load fee rules');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthorized) {
            fetchFeeRules();
        }
    }, [isAuthorized]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            const payload = {
                ...formData,
                minAmount: parseFloat(formData.minAmount),
                maxAmount: formData.maxAmount ? parseFloat(formData.maxAmount) : null,
                feePercentage: parseFloat(formData.feePercentage),
                priority: parseInt(formData.priority)
            };

            const url = editingRule 
                ? `/api/admin/fee-rules/${editingRule.id}`
                : '/api/admin/fee-rules';
            
            const method = editingRule ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to save fee rule');
            }

            toast({
                title: "Success",
                description: `Fee rule ${editingRule ? 'updated' : 'created'} successfully.`
            });

            setIsDialogOpen(false);
            setEditingRule(null);
            resetForm();
            fetchFeeRules();
        } catch (err) {
            toast({
                title: "Error",
                description: err instanceof Error ? err.message : 'Failed to save fee rule',
                variant: "destructive"
            });
        }
    };

    const handleEdit = (rule: FeeRule) => {
        setEditingRule(rule);
        setFormData({
            name: rule.name,
            description: rule.description || '',
            minAmount: rule.minAmount.toString(),
            maxAmount: rule.maxAmount?.toString() || '',
            feePercentage: rule.feePercentage.toString(),
            priority: rule.priority.toString()
        });
        setIsDialogOpen(true);
    };

    const handleDelete = async (ruleId: string) => {
        if (!confirm('Are you sure you want to delete this fee rule?')) return;

        try {
            const response = await fetch(`/api/admin/fee-rules/${ruleId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete fee rule');
            }

            toast({
                title: "Success",
                description: "Fee rule deleted successfully."
            });

            fetchFeeRules();
        } catch (err) {
            toast({
                title: "Error",
                description: err instanceof Error ? err.message : 'Failed to delete fee rule',
                variant: "destructive"
            });
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            minAmount: '',
            maxAmount: '',
            feePercentage: '',
            priority: '0'
        });
    };

    const handleDialogClose = () => {
        setIsDialogOpen(false);
        setEditingRule(null);
        resetForm();
    };

    if (status === 'loading' || isAuthorized === null) {
        return <div className="container mx-auto p-4">Loading...</div>;
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
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Fee Rules Management</h1>
                    <p className="text-muted-foreground">
                        Manage platform fee rules for different price ranges
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => {
                            setEditingRule(null);
                            resetForm();
                        }}>
                            <Icons.plus className="mr-2 h-4 w-4" />
                            Add New Rule
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingRule ? 'Edit Fee Rule' : 'Add New Fee Rule'}</DialogTitle>
                            <DialogDescription>
                                Configure fee rules for different price ranges. The global default fee percentage is {globalSettings?.defaultFeePercentage}%.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Rule Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description (Optional)</Label>
                                <Input
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="minAmount">Minimum Amount (KES)</Label>
                                    <Input
                                        id="minAmount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.minAmount}
                                        onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="maxAmount">Maximum Amount (KES) (Optional)</Label>
                                    <Input
                                        id="maxAmount"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.maxAmount}
                                        onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="feePercentage">Fee Percentage (%)</Label>
                                    <Input
                                        id="feePercentage"
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={formData.feePercentage}
                                        onChange={(e) => setFormData({ ...formData, feePercentage: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="priority">Priority (Higher = Applied First)</Label>
                                    <Input
                                        id="priority"
                                        type="number"
                                        min="0"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={handleDialogClose}>
                                    Cancel
                                </Button>
                                <Button type="submit">
                                    {editingRule ? 'Update Rule' : 'Create Rule'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {error && (
                <Alert variant="destructive">
                    <Icons.alertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Global Settings</CardTitle>
                    <CardDescription>Default fee percentage for items not matching any rules</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-4">
                        <div className="text-2xl font-bold">
                            {globalSettings?.defaultFeePercentage}%
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const newPercentage = prompt('Enter new default fee percentage:', globalSettings?.defaultFeePercentage.toString());
                                if (newPercentage && !isNaN(parseFloat(newPercentage))) {
                                    fetch('/api/admin/fee-rules/global-settings', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ defaultFeePercentage: parseFloat(newPercentage) })
                                    })
                                    .then(response => {
                                        if (!response.ok) throw new Error('Failed to update global settings');
                                        return response.json();
                                    })
                                    .then(() => {
                                        toast({
                                            title: "Success",
                                            description: "Global fee percentage updated successfully."
                                        });
                                        fetchFeeRules();
                                    })
                                    .catch(err => {
                                        toast({
                                            title: "Error",
                                            description: err.message,
                                            variant: "destructive"
                                        });
                                    });
                                }
                            }}
                        >
                            Update
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Fee Rules</CardTitle>
                    <CardDescription>Rules are applied in order of priority (highest first)</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Price Range</TableHead>
                                <TableHead>Fee %</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {feeRules.map((rule) => (
                                <TableRow key={rule.id}>
                                    <TableCell>{rule.name}</TableCell>
                                    <TableCell>
                                        KES {rule.minAmount.toLocaleString()}
                                        {rule.maxAmount ? ` - ${rule.maxAmount.toLocaleString()}` : '+'}
                                    </TableCell>
                                    <TableCell>{rule.feePercentage}%</TableCell>
                                    <TableCell>{rule.priority}</TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                            rule.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {rule.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex space-x-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(rule)}
                                            >
                                                Edit
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleDelete(rule.id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
} 