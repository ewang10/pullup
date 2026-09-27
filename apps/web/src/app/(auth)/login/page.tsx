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

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

// Public portfolio demo credentials. Set only on the demo deployment; the
// banner is hidden when either is missing.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Surface the unauthorized error set by middleware redirect
  useEffect(() => {
    if (searchParams?.get('error') === 'unauthorized') {
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

      {DEMO_EMAIL && DEMO_PASSWORD && (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <p className="font-medium text-gray-900">Just looking around?</p>
          <p className="mt-1 text-gray-600">
            Explore a sample venue with 30 days of demo data.
          </p>
          <p className="mt-2 text-gray-700 break-all">
            <span className="text-gray-600">Email:</span> {DEMO_EMAIL}
            <br />
            <span className="text-gray-600">Password:</span> {DEMO_PASSWORD}
          </p>
          <button
            type="button"
            onClick={() => {
              setEmail(DEMO_EMAIL);
              setPassword(DEMO_PASSWORD);
            }}
            className="mt-3 text-primary font-medium hover:text-primary-600"
          >
            Fill in demo login →
          </button>
        </div>
      )}

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

      <p className="mt-4 text-center text-sm">
        <Link href="/reset-password" className="text-primary font-medium hover:text-primary-600">
          Forgot password?
        </Link>
      </p>

      <p className="mt-4 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-primary font-medium hover:text-primary-600">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
