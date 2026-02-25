/**
 * Settings page for venue administrators.
 *
 * Allows editing venue profile fields that exist in the DB schema
 * (name, address, city, state, category) and account actions like
 * password reset. Uses the venue_category enum values from the DB.
 */
'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

interface VenueProfile {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  category: string;
}

/** Must match the venue_category enum in the database */
const VENUE_CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar / Lounge' },
  { value: 'nightclub', label: 'Nightclub' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'brewery', label: 'Brewery / Winery' },
  { value: 'entertainment', label: 'Entertainment Venue' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'fitness', label: 'Gym / Fitness' },
  { value: 'salon', label: 'Salon / Spa' },
  { value: 'other', label: 'Other' },
];

export default function SettingsPage() {
  const supabase = createSupabaseBrowserClient();
  const [profile, setProfile] = useState<VenueProfile>({
    id: '',
    name: '',
    address: '',
    city: '',
    state: '',
    category: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function fetchVenue() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: venue } = await supabase
        .from('venues')
        .select('*')
        .eq('owner_user_id', user.id)
        .single();

      if (venue) {
        setProfile({
          id: venue.id,
          name: venue.name || '',
          address: venue.address || '',
          city: venue.city || '',
          state: venue.state || '',
          category: venue.category || '',
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
      redirectTo: `${window.location.origin}/settings`,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password reset email sent. Check your inbox.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading settings">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Venue Profile</h2>

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
              <input
                id="state"
                type="text"
                value={profile.state}
                onChange={(e) => updateField('state', e.target.value)}
                className="input-field"
                placeholder="CA"
                maxLength={2}
              />
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
              <p className="text-sm text-gray-500">Send a password reset link to your email</p>
            </div>
            <button onClick={handlePasswordChange} className="btn-secondary text-sm">
              Reset password
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div>
              <p className="font-medium text-red-900">Delete account</p>
              <p className="text-sm text-red-600">
                Permanently remove your venue and all associated data
              </p>
            </div>
            <button className="btn-danger text-sm">
              Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
