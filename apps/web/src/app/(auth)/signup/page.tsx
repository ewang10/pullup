'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { VENUE_CATEGORIES } from '@pullup/shared';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    venueName: '',
    address: '',
    city: '',
    state: '',
    category: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            role: 'venue_admin',
            venue_name: formData.venueName,
            full_name: formData.fullName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (authData.user) {
        // Create venue record
        const { error: venueError } = await supabase.from('venues').insert({
          owner_user_id: authData.user.id,
          name: formData.venueName,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          category: formData.category,
        });

        if (venueError) {
          setError('Account created but venue setup failed. Please contact support.');
          return;
        }
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Create your venue account</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            className="input-field"
            placeholder="you@venue.com"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="input-field"
              placeholder="Min 8 characters"
              required
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              className="input-field"
              placeholder="Confirm password"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            value={formData.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
            className="input-field"
            placeholder="Your full name"
            required
          />
        </div>

        <div>
          <label htmlFor="venueName" className="block text-sm font-medium text-gray-700 mb-1">
            Venue name
          </label>
          <input
            id="venueName"
            type="text"
            value={formData.venueName}
            onChange={(e) => updateField('venueName', e.target.value)}
            className="input-field"
            placeholder="Your venue name"
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
            value={formData.address}
            onChange={(e) => updateField('address', e.target.value)}
            className="input-field"
            placeholder="123 Main St"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => updateField('city', e.target.value)}
              className="input-field"
              placeholder="City"
              required
            />
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <input
              id="state"
              type="text"
              value={formData.state}
              onChange={(e) => updateField('state', e.target.value)}
              className="input-field"
              placeholder="State"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="input-field"
            required
          >
            <option value="">Select a category</option>
            {VENUE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-medium hover:text-primary-600">
          Sign in
        </Link>
      </p>
    </div>
  );
}
