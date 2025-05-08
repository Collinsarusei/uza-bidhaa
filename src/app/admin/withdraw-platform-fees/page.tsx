// src/app/admin/withdraw-platform-fees/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlatformSettings } from '@/lib/types';

interface Bank {
    name: string;
    code: string;
}

const MIN_PLATFORM_WITHDRAWAL = 100;

export default function AdminWithdrawPlatformFeesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { toast } = useToast();

    const [totalPlatformFees, setTotalPlatformFees] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [banks, setBanks] = useState<Bank[]>([]);

    const [amount, setAmount] = useState<string>('');
    const [payoutMethod, setPayoutMethod] = useState<'mpesa' | 'bank_account'>('mpesa');
    const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState('');
    const [selectedBankCode, setSelectedBankCode] = useState<string>('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState(''); // Optional, Paystack can verify

    // Fetch current platform fees and banks on load
    useEffect(() => {
        async function fetchData() {
            setIsLoading(true);
            try {
                // Fetch platform fees
                const feesResponse = await fetch('/api/admin/platform-fees');
                if (!feesResponse.ok) throw new Error('Failed to fetch platform fees');
                const feesData = await feesResponse.json();
                setTotalPlatformFees(feesData.totalBalance || 0);

                // Fetch banks (Paystack)
                const banksResponse = await fetch('https://api.paystack.co/bank?currency=KES', {
                    headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY}` }
                });
                if (!banksResponse.ok) {
                    console.warn("Could not fetch Paystack banks. Bank selection might be limited.");
                    // You might want to set a default or allow manual bank code input as fallback
                } else {
                    const banksData = await banksResponse.json();
                    if (banksData.status && banksData.data) {
                        setBanks(banksData.data.map((b: any) => ({ name: b.name, code: b.code })));
                    }
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load initial data');
            }
            setIsLoading(false);
        }
        if (status === 'authenticated') {
            fetchData();
        }
         if (status === 'unauthenticated') router.push('/auth');

    }, [status, router]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setError("Please enter a valid positive amount.");
            setIsSubmitting(false);
            return;
        }
        if (parsedAmount < MIN_PLATFORM_WITHDRAWAL) {
            setError(`Minimum withdrawal amount is KES ${MIN_PLATFORM_WITHDRAWAL}.`);
            setIsSubmitting(false);
            return;
        }
        if (parsedAmount > totalPlatformFees) {
            setError("Withdrawal amount cannot exceed total available platform fees.");
            setIsSubmitting(false);
            return;
        }

        const payload: any = {
            amount: parsedAmount,
            payoutMethod,
        };

        if (payoutMethod === 'mpesa') {
            if (!mpesaPhoneNumber || !/^(?:254|\+254|0)?([17]\d{8})$/.test(mpesaPhoneNumber)) {
                setError("Invalid M-Pesa phone number format.");
                setIsSubmitting(false);
                return;
            }
            payload.mpesaPhoneNumber = mpesaPhoneNumber;
        } else { // bank_account
            if (!selectedBankCode) {
                setError("Please select a bank.");
                setIsSubmitting(false);
                return;
            }
            if (!accountNumber) {
                setError("Please enter bank account number.");
                setIsSubmitting(false);
                return;
            }
            payload.bankCode = selectedBankCode;
            payload.accountNumber = accountNumber;
            if (accountName) payload.accountName = accountName; // Optional
             const selectedBank = banks.find(b => b.code === selectedBankCode);
             if (selectedBank) payload.bankName = selectedBank.name; // For record keeping
        }

        try {
            const response = await fetch('/api/admin/withdraw-fees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Withdrawal request failed');
            }

            toast({
                title: "Withdrawal Initiated",
                description: result.message || `Withdrawal of KES ${parsedAmount} is being processed.`,
            });
            // Reset form and refetch fees
            setAmount('');
            setMpesaPhoneNumber('');
            setSelectedBankCode('');
            setAccountNumber('');
            setAccountName('');
            // Refetch total fees to show updated balance
            const feesResponse = await fetch('/api/admin/platform-fees');
            if (feesResponse.ok) {
                 const feesData = await feesResponse.json();
                 setTotalPlatformFees(feesData.totalBalance || 0);
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
            setError(errorMessage);
            toast({
                title: "Withdrawal Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (status === 'loading' || isLoading) {
        return <div className="flex h-screen items-center justify-center"><Icons.spinner className="h-10 w-10 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto p-4 md:p-6 max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Withdraw Platform Fees</CardTitle>
                    <CardDescription>
                        Initiate a withdrawal of accumulated platform fees. Current total available: KES {totalPlatformFees.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <Icons.alertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount to Withdraw (KES)</Label>
                            <Input 
                                id="amount" 
                                type="number" 
                                value={amount} 
                                onChange={(e) => setAmount(e.target.value)} 
                                placeholder={`Min ${MIN_PLATFORM_WITHDRAWAL}, Max ${totalPlatformFees}`} 
                                min={MIN_PLATFORM_WITHDRAWAL.toString()}
                                max={totalPlatformFees.toString()}
                                step="0.01"
                                required 
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Payout Method</Label>
                            <RadioGroup defaultValue="mpesa" onValueChange={(value: 'mpesa' | 'bank_account') => setPayoutMethod(value)} value={payoutMethod}>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="mpesa" id="mpesa" />
                                    <Label htmlFor="mpesa">M-Pesa</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="bank_account" id="bank_account" />
                                    <Label htmlFor="bank_account">Bank Account</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {payoutMethod === 'mpesa' && (
                            <div className="space-y-2">
                                <Label htmlFor="mpesaPhoneNumber">M-Pesa Phone Number (e.g., 2547XXXXXXXX)</Label>
                                <Input 
                                    id="mpesaPhoneNumber" 
                                    value={mpesaPhoneNumber} 
                                    onChange={(e) => setMpesaPhoneNumber(e.target.value)} 
                                    placeholder="Format: 254712345678 or 0712345678" 
                                    required={payoutMethod === 'mpesa'}
                                />
                            </div>
                        )}

                        {payoutMethod === 'bank_account' && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="bankCode">Bank</Label>
                                    <Select onValueChange={setSelectedBankCode} value={selectedBankCode} required={payoutMethod === 'bank_account'}>
                                        <SelectTrigger id="bankCode">
                                            <SelectValue placeholder="Select Bank" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {banks.length > 0 ? banks.map(bank => (
                                                <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                                            )) : <SelectItem value="" disabled>No banks loaded</SelectItem>}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="accountNumber">Bank Account Number</Label>
                                    <Input 
                                        id="accountNumber" 
                                        value={accountNumber} 
                                        onChange={(e) => setAccountNumber(e.target.value)} 
                                        placeholder="Enter account number" 
                                        required={payoutMethod === 'bank_account'}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="accountName">Account Name (Optional)</Label>
                                    <Input 
                                        id="accountName" 
                                        value={accountName} 
                                        onChange={(e) => setAccountName(e.target.value)} 
                                        placeholder="Beneficiary name (auto-verified by Paystack if blank)" 
                                    />
                                </div>
                            </>
                        )}
                        
                        <Button type="submit" disabled={isSubmitting || isLoading} className="w-full">
                            {isSubmitting ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : <Icons.send className="mr-2 h-4 w-4" />} 
                            Initiate Withdrawal
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
