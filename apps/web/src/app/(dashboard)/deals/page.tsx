/**
 * Deals listing page for venue administrators.
 *
 * Displays all deals for the current venue in a table with toggle
 * for active/inactive status, edit links, and delete actions.
 * Uses is_active boolean (not a status string) per the DB schema.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

interface Deal {
  id: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  daily_cap: number;
  is_active: boolean;
  created_at: string;
}

export default function DealsPage() {
  const supabase = createSupabaseBrowserClient();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: venue } = await supabase
      .from('venues')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (!venue) return;

    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('venue_id', venue.id)
      .order('created_at', { ascending: false });

    setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    await supabase.from('deals').update({ is_active: !currentlyActive }).eq('id', id);
    fetchDeals();
  };

  const deleteDeal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deal?')) return;
    await supabase.from('deals').delete().eq('id', id);
    fetchDeals();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading deals">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="sr-only">Loading deals...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
        <Link href="/deals/new" className="btn-primary">
          + New deal
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No deals yet</h3>
          <p className="text-gray-500 mb-4">Create your first deal to start attracting riders.</p>
          <Link href="/deals/new" className="btn-primary inline-block">
            Create your first deal
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Your venue deals</caption>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Deal</th>
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Discount</th>
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Daily Cap</th>
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                <th scope="col" className="text-left py-3 px-4 font-medium text-gray-500">Created</th>
                <th scope="col" className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900">{deal.title}</div>
                    <div className="text-gray-500 text-xs mt-0.5 line-clamp-1">{deal.description}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {deal.discount_type === 'percentage'
                      ? `${deal.discount_value}%`
                      : `$${deal.discount_value.toFixed(2)}`}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{deal.daily_cap}/day</td>
                  <td className="py-3 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      deal.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {deal.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {new Date(deal.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/deals/${deal.id}/edit`}
                        className="text-primary hover:text-primary-700 text-xs font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => toggleActive(deal.id, deal.is_active)}
                        className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                      >
                        {deal.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => deleteDeal(deal.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
