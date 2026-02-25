'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import DealForm from '@/components/DealForm';

export default function NewDealPage() {
  const supabase = createSupabaseBrowserClient();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    }

    getVenue();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">No venue found. Please complete your venue setup first.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Deal</h1>
      <div className="card">
        <DealForm venueId={venueId} mode="create" />
      </div>
    </div>
  );
}
