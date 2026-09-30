'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import DealForm from '@/components/DealForm';

export default function NewDealPage() {
  const supabase = createSupabaseBrowserClient();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Deals can only be created once a bank account is linked (enforced by RLS).
  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);

  useEffect(() => {
    async function getVenue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_user_id', user.id)
        .single();

      if (venue) setVenueId(venue.id);
      const { data: privateRows } = await supabase.rpc('get_my_venue_private');
      setHasPaymentMethod(Boolean((privateRows as { has_payment_method: boolean }[] | null)?.[0]?.has_payment_method));
      setLoading(false);
    }

    getVenue();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-600">No venue found. Please complete your venue setup first.</p>
      </div>
    );
  }

  if (!hasPaymentMethod) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Create a deal</h1>
        <section className="card" aria-labelledby="no-bank-heading">
          <h2 id="no-bank-heading" className="text-lg font-semibold text-gray-900">Link a bank account first</h2>
          <p className="mt-2 text-gray-700 max-w-2xl">
            PullUp charges your venue only when a rider completes a visit, so we need a bank account on file before
            your deals can go live.
          </p>
          <Link href="/billing" className="btn-primary inline-block mt-4">
            Go to Billing
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create a deal</h1>
      <div className="card">
        <DealForm venueId={venueId} mode="create" />
      </div>
    </div>
  );
}
