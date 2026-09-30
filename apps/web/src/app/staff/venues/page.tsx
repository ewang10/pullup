/**
 * Staff: review venue photos riders see, and remove inappropriate ones.
 * Removal goes through remove-venue-image (support or admin only).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

interface VenueRow {
  id: string;
  name: string;
  city: string;
  state: string;
  image_url: string | null;
  hero_image_updated_at: string | null;
}

export default function StaffVenuesPage() {
  const supabase = createSupabaseBrowserClient();
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('venues')
      .select('id, name, city, state, image_url, hero_image_updated_at')
      .not('image_url', 'is', null)
      .order('hero_image_updated_at', { ascending: false, nullsFirst: false })
      .limit(100);
    if (err) setError(err.message);
    else setVenues((data || []) as VenueRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const removePhoto = async (venue: VenueRow) => {
    setBusyId(venue.id);
    setError(null);
    const { error: fnError } = await supabase.functions.invoke('remove-venue-image', { body: { venue_id: venue.id } });
    setBusyId(null);
    setConfirmId(null);
    if (fnError) {
      const body = await (fnError as { context?: Response }).context?.json?.().catch(() => null);
      setError(body?.error ?? fnError.message);
      return;
    }
    setNotice(`Removed the photo for ${venue.name}.`);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Venue photos</h1>
      <p className="text-gray-600 mt-1 mb-6 max-w-2xl">
        Photos venues uploaded for riders to see, newest first. Remove any that are inappropriate or misleading; the
        venue can upload a new one.
      </p>

      <div aria-live="polite">
        {notice && <p className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">{notice}</p>}
      </div>
      {error && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
          <span className="sr-only">Loading venues…</span>
        </div>
      ) : venues.length === 0 ? (
        <p className="card text-center text-gray-600">No venue photos yet.</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {venues.map((v) => (
            <li key={v.id} className="card p-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.image_url!} alt={`Photo uploaded by ${v.name}`} className="aspect-[16/9] w-full object-cover bg-gray-100" />
              <div className="p-4">
                <h2 className="font-semibold text-gray-900">{v.name}</h2>
                <p className="text-sm text-gray-700">
                  {v.city}, {v.state}
                  {v.hero_image_updated_at &&
                    ` · uploaded ${new Date(v.hero_image_updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
                {confirmId === v.id ? (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Confirm removing ${v.name}'s photo`}>
                    <button
                      type="button"
                      onClick={() => removePhoto(v)}
                      disabled={busyId === v.id}
                      className="px-4 py-2 rounded-lg font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
                    >
                      {busyId === v.id ? 'Removing…' : 'Yes, remove photo'}
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmId(v.id)} className="btn-secondary mt-3">
                    Remove photo…
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
