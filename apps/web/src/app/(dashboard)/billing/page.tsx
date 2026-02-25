/**
 * Billing page for venue administrators.
 *
 * Displays transaction history from the transactions table, current balance,
 * and payment method management. Uses correct column names from the DB schema
 * (owner_user_id, ride_credit_amount, etc.).
 */
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

interface Transaction {
  id: string;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
  stripe_payment_intent_id: string | null;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

export default function BillingPage() {
  const supabase = createSupabaseBrowserClient();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

  useEffect(() => {
    async function fetchBillingData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();

      if (!venue) return;

      // Fetch transactions for this venue
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('venue_id', venue.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const txnList = (txns || []) as Transaction[];
      setTransactions(txnList);

      // Calculate totals from completed transactions
      const completed = txnList.filter((t) => t.status === 'completed');
      const total = completed.reduce((sum, t) => {
        return sum + (t.ride_credit_amount || 0) + (t.driver_kickback_amount || 0) + (t.platform_fee_amount || 0);
      }, 0);
      setTotalRevenue(total);

      const pending = txnList
        .filter((t) => t.status === 'pending')
        .reduce((sum, t) => {
          return sum + (t.ride_credit_amount || 0) + (t.driver_kickback_amount || 0) + (t.platform_fee_amount || 0);
        }, 0);
      setPendingAmount(pending);

      setLoading(false);
    }

    fetchBillingData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading billing">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="sr-only">Loading billing data...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card" role="group" aria-label="Total revenue">
          <p className="text-sm font-medium text-gray-500">Total Revenue</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            ${totalRevenue.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">From completed transactions</p>
        </div>
        <div className="card" role="group" aria-label="Pending amount">
          <p className="text-sm font-medium text-gray-500">Pending</p>
          <p className="text-3xl font-bold text-yellow-600 mt-1">
            ${pendingAmount.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">Processing</p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h2>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No transactions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Transaction history with amounts and status</caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Date</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Ride Credit</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Driver</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Platform</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Total</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => {
                  const total = (txn.ride_credit_amount || 0) + (txn.driver_kickback_amount || 0) + (txn.platform_fee_amount || 0);
                  return (
                    <tr key={txn.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(txn.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900">${(txn.ride_credit_amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">${(txn.driver_kickback_amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right text-gray-900">${(txn.platform_fee_amount || 0).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-medium text-gray-900">${total.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[txn.status]}`}>
                          {txn.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
