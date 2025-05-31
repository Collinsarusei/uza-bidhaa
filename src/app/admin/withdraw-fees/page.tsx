'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface WithdrawFee {
  id: string;
  amount: number;
  fee: number;
}

export default function WithdrawFeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [withdrawFees, setWithdrawFees] = useState<WithdrawFee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      fetchWithdrawFees();
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

  const handleFeeUpdate = async (feeId: string, updates: any) => {
    try {
      const response = await fetch(`/api/admin/withdraw-fees/${feeId}`, {
        method: 'PUT',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Failed to update fee');
      }
      await fetchWithdrawFees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fee');
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Withdraw Fees</h1>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {withdrawFees.map((fee) => (
              <tr key={fee.id}>
                <td className="px-6 py-4 whitespace-nowrap">${fee.amount}</td>
                <td className="px-6 py-4 whitespace-nowrap">${fee.fee}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleFeeUpdate(fee.id, { fee: fee.fee + 1 })}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 