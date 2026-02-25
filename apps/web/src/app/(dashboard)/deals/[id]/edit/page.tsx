/**
 * Edit deal page for venue administrators.
 *
 * Fetches an existing deal by ID and renders the DealForm in edit mode.
 * Uses correct column names (ride_credit_amount, fixed_amount, is_active).
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import DealForm from '@/components/DealForm';

interface DealData {
  id: string;
  venue_id: string;
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  ride_credit_amount: number;
  driver_kickback_amount: number;
  platform_fee_amount: number;
  daily_cap: number;
  hold_duration_minutes: number;
  is_active: boolean;
}

export default function EditDealPage() {
  const params = useParams();
  const dealId = params?.id as string;
  const supabase = createSupabaseBrowserClient();
  const [deal, setDeal] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeal() {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (data) setDeal(data as DealData);
      setLoading(false);
    }

    fetchDeal();
  }, [dealId, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading deal">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="sr-only">Loading deal data...</span>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">Deal not found.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Deal</h1>
      <div className="card">
        <DealForm
          venueId={deal.venue_id}
          mode="edit"
          initialData={deal}
        />
      </div>
    </div>
  );
}
