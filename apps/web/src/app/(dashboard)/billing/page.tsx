/**
 * Billing page for venue administrators.
 *
 * Lists what the venue has been charged: one charge per completed visit,
 * split into the rider's ride credit, the driver's referral bonus and
 * PullUp's fee. Transactions link to a venue through deal_claims -> deals.
 */
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { formatCurrency } from '@/lib/claims';
import { SPLIT_DRIVER_KICKBACK, SPLIT_PLATFORM_FEE, SPLIT_RIDE_CREDIT } from '@pullup/shared';

interface Charge {
  id: string;
  deal_title: string;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

const STATUS: Record<Charge['status'], { label: string; className: string }> = {
  completed: { label: 'Paid', className: 'bg-green-100 text-green-900' },
  pending: { label: 'Processing', className: 'bg-yellow-100 text-yellow-900' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-900' },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const total = (c: Charge) => c.ride_credit_amount + c.driver_kickback_amount + c.platform_fee_amount;

export default function BillingPage() {
  const supabase = createSupabaseBrowserClient();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBillingData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: venue } = await supabase
          .from('venues')
          .select('id')
          .eq('owner_user_id', user.id)
          .single();
        if (!venue) return;

        // The per-party breakdown lives on the deal. RLS limits results to
        // this admin's venue; the venue filter keeps the query explicit.
        const { data: txns } = await supabase
          .from('transactions')
          .select(
            'id, status, created_at, deal_claim:deal_claims!inner(deal:deals!inner(venue_id, title, ride_credit_amount, driver_kickback_amount, platform_fee_amount))'
          )
          .eq('type', 'venue_charge')
          .eq('deal_claim.deal.venue_id', venue.id)
          .order('created_at', { ascending: false })
          .limit(100);

        setCharges(
          (txns || []).map((t) => {
            const deal = (t.deal_claim as unknown as { deal: Record<string, string | number> }).deal;
            return {
              id: t.id,
              status: t.status,
              created_at: t.created_at,
              deal_title: String(deal.title ?? 'Deleted deal'),
              ride_credit_amount: Number(deal.ride_credit_amount) || 0,
              driver_kickback_amount: Number(deal.driver_kickback_amount) || 0,
              platform_fee_amount: Number(deal.platform_fee_amount) || 0,
            };
          })
        );
      } finally {
        setLoading(false);
      }
    }

    fetchBillingData();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading billing data...</span>
      </div>
    );
  }

  const paid = charges.filter((c) => c.status === 'completed');
  const totalPaid = paid.reduce((s, c) => s + total(c), 0);
  const processing = charges.filter((c) => c.status === 'pending').reduce((s, c) => s + total(c), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      <p className="text-gray-600 mt-1 mb-6 max-w-3xl">
        You pay PullUp only when a rider completes a visit. The discount you offer is given at your
        register and isn&apos;t charged here, and you keep everything the customer spends.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <section className="card" aria-labelledby="total-paid-label">
          <h2 id="total-paid-label" className="text-sm font-medium text-gray-600">Total paid</h2>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(totalPaid)}</p>
          <p className="text-sm text-gray-600 mt-1">
            {paid.length} completed visit{paid.length === 1 ? '' : 's'} (last {charges.length} charges)
          </p>
        </section>
        <section className="card" aria-labelledby="processing-label">
          <h2 id="processing-label" className="text-sm font-medium text-gray-600">Processing</h2>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCurrency(processing)}</p>
          <p className="text-sm text-gray-600 mt-1">Charges not yet settled</p>
        </section>
        <section className="card" aria-labelledby="split-label">
          <h2 id="split-label" className="text-sm font-medium text-gray-600">Where each charge goes</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-700">Rider&apos;s ride credit</dt>
              <dd className="font-medium text-gray-900">{pct(SPLIT_RIDE_CREDIT)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-700">Driver&apos;s referral bonus</dt>
              <dd className="font-medium text-gray-900">{pct(SPLIT_DRIVER_KICKBACK)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-700">PullUp fee</dt>
              <dd className="font-medium text-gray-900">{pct(SPLIT_PLATFORM_FEE)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="card" aria-labelledby="charges-heading">
        <h2 id="charges-heading" className="text-lg font-semibold text-gray-900 mb-4">Charges</h2>

        {charges.length === 0 ? (
          <p className="text-center py-8 text-gray-600">
            No charges yet. You&apos;ll see one here each time a rider completes a visit.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Charges for completed visits, with how each charge is split
              </caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Deal</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Rider&apos;s ride credit</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">Driver bonus</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">PullUp fee</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-gray-600">You paid</th>
                  <th scope="col" className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <th scope="row" className="text-left py-3 px-4 font-medium text-gray-900">{c.deal_title}</th>
                    <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(c.ride_credit_amount)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(c.driver_kickback_amount)}</td>
                    <td className="py-3 px-4 text-right text-gray-700">{formatCurrency(c.platform_fee_amount)}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900">{formatCurrency(total(c))}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[c.status].className}`}>
                        {STATUS[c.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
