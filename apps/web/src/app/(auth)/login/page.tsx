/**
 * Login page for venue administrators.
 *
 * Handles email/password authentication via Supabase. After a successful
 * sign-in the user's `user_metadata.role` is verified to be `venue_admin`;
 * non-admin users are signed out and shown an error message. The page also
 * reads the `?error=unauthorized` query parameter (set by middleware) and
 * displays an appropriate notice on mount.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Surface the unauthorized error set by middleware redirect
  useEffect(() => {
    if (searchParams.get('error') === 'unauthorized') {
      setError('This dashboard is for venue administrators only.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // Verify the user holds the venue_admin role
      const role = data.user?.user_metadata?.role;
      if (role !== 'venue_admin') {
        await supabase.auth.signOut();
        setError('This dashboard is for venue administrators only.');
        return;
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
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign in to your account</h2>

      {error && (
        <div
          role="alert"
          id="login-error"
          className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            placeholder="you@venue.com"
            required
            aria-required="true"
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
            placeholder="Your password"
            required
            aria-required="true"
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-primary font-medium hover:text-primary-600">
          Sign up
        </Link>
      </p>
    </div>
  );
}
