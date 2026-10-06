/**
 * Settings page for venue administrators.
 *
 * Allows editing venue profile fields that exist in the DB schema
 * (name, address, city, state, category) and account actions like
 * password reset. Uses the venue_category enum values from the DB.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { DEMO_ACCOUNT_LOCKED_TEXT, US_STATES, VENUE_CATEGORIES, isDemoAccountEmail } from '@pullup/shared';
import VenuePhotoCard from '@/components/VenuePhotoCard';

interface VenueProfile {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  category: string;
  /** Average bill per customer, kept as a string for the input */
  avg_check_amount: string;
}

export default function SettingsPage() {
  const supabase = createSupabaseBrowserClient();
  const [profile, setProfile] = useState<VenueProfile>({
    id: '',
    name: '',
    address: '',
    city: '',
    state: '',
    category: '',
    avg_check_amount: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function fetchVenue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setIsDemo(isDemoAccountEmail(user.email));

      const { data: venue } = await supabase
        .from('venues')
        .select('id, name, address, city, state, category')
        .eq('owner_user_id', user.id)
        .single();
      // Private venue fields (e.g. the average bill) are only readable by the owner via RPC.
      const { data: privateRows } = await supabase.rpc('get_my_venue_private');
      const privateInfo = (privateRows as { avg_check_amount: number | null }[] | null)?.[0];

      if (venue) {
        setProfile({
          id: venue.id,
          name: venue.name || '',
          address: venue.address || '',
          city: venue.city || '',
          state: venue.state || '',
          category: venue.category || '',
          avg_check_amount: privateInfo?.avg_check_amount != null ? String(privateInfo.avg_check_amount) : '',
        });
      }
      setLoading(false);
    }

    fetchVenue();
  }, [supabase]);

  const updateField = (field: keyof VenueProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('venues')
        .update({
          name: profile.name,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          category: profile.category,
          avg_check_amount: profile.avg_check_amount === '' ? null : Number(profile.avg_check_amount),
        })
        .eq('id', profile.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Venue profile updated successfully.' });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password?mode=recovery')}`,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
        <span className="sr-only">Loading settings...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {message && (
        <div
          role="alert"
          className={`mb-6 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {profile.id && <VenuePhotoCard venueId={profile.id} venueName={profile.name} />}

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Venue profile</h2>

        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Venue name
            </label>
            <input
              id="name"
              type="text"
              value={profile.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="input-field"
              aria-required="true"
              required
            />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <input
              id="address"
              type="text"
              value={profile.address}
              onChange={(e) => updateField('address', e.target.value)}
              className="input-field"
              aria-required="true"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                id="city"
                type="text"
                value={profile.city}
                onChange={(e) => updateField('city', e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <select
                id="state"
                value={profile.state}
                onChange={(e) => updateField('state', e.target.value)}
                className="input-field"
              >
                <option value="">Select</option>
                {US_STATES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              id="category"
              value={profile.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="input-field"
            >
              <option value="">Select a category</option>
              {VENUE_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="avg_check_amount" className="block text-sm font-medium text-gray-700 mb-1">
              Average bill per customer ($)
            </label>
            <input
              id="avg_check_amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={10000}
              step={0.01}
              value={profile.avg_check_amount}
              onChange={(e) => updateField('avg_check_amount', e.target.value)}
              className="input-field max-w-xs"
              placeholder="e.g., 35"
              aria-describedby="avg-check-help"
            />
            <p id="avg-check-help" className="text-xs text-gray-600 mt-1">
              Optional. Your point-of-sale reports usually call this &ldquo;average ticket&rdquo; or &ldquo;average
              sale&rdquo;, or divide a typical week&apos;s sales by its number of customers. Your dashboard uses it to
              estimate sales from PullUp visits until it has enough real venue receipts. Only you can see it.
            </p>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving} className="btn-primary" aria-busy={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Account Settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <div className="space-y-4 max-w-2xl">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Change password</p>
              <p className="text-sm text-gray-600">
                {isDemo ? DEMO_ACCOUNT_LOCKED_TEXT : 'Send a password reset link to your email'}
              </p>
            </div>
            {!isDemo && (
              <button type="button" onClick={handlePasswordChange} className="btn-secondary text-sm">
                Reset password
              </button>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div>
              <p className="font-medium text-red-900">Delete account</p>
              <p className="text-sm text-red-700">
                Permanently remove your venue and all associated data
              </p>
            </div>
            {/* Deletion is handled by support so billing can be settled first. */}
            <Link href="/support" className="btn-danger text-sm">
              Request deletion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
