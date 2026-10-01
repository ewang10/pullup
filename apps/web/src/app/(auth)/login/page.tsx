/**
 * Login page for venue administrators.
 *
 * Handles email/password authentication via Supabase. After a successful
 * sign-in the user's role (from public.users) decides where they go;
 * non-admin users are signed out and shown an error message. The page also
 * reads the `?error=unauthorized` query parameter (set by middleware) and
 * displays an appropriate notice on mount.
 */

'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import { fetchRole, homeForRole } from '@/lib/roles';

// Public portfolio demo credentials. Set only on the demo deployment; each
// account shows only when both its email and password are set.
const DEMO_ACCOUNTS = [
  {
    key: 'venue',
    label: 'Venue owner',
    description: 'A sample café with 30 days of deals, visits and charges.',
    email: process.env.NEXT_PUBLIC_DEMO_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_PASSWORD,
  },
  {
    key: 'staff',
    label: 'PullUp staff',
    description: 'Approve new drivers and review ride and venue receipts.',
    email: process.env.NEXT_PUBLIC_DEMO_STAFF_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_STAFF_PASSWORD,
  },
  {
    key: 'admin',
    label: 'PullUp admin',
    description: 'Everything staff can do, plus suspending drivers and extending receipt deadlines.',
    email: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD,
  },
].filter((a): a is typeof a & { email: string; password: string } => Boolean(a.email && a.password));

const UNAUTHORIZED_MESSAGE =
  'This site is for venue owners and PullUp staff. Riders and drivers use the mobile app.';

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
      setError(UNAUTHORIZED_MESSAGE);
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

      // Venue admins go to the dashboard, staff to the review area.
      const home = data.user ? homeForRole(await fetchRole(supabase, data.user.id)) : null;
      if (!home) {
        await supabase.auth.signOut();
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }

      router.push(home);
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sign in to your account</h1>

      {DEMO_ACCOUNTS.length > 0 && (
        <section className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm" aria-labelledby="demo-heading">
          <h2 id="demo-heading" className="font-medium text-gray-900">Just looking around?</h2>
          <p className="mt-1 text-gray-700">Try a demo account. The password is shown so anyone can sign in.</p>
          <ul className="mt-3 space-y-3">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.key} className="rounded-md bg-white border border-indigo-100 p-3">
                <p className="font-medium text-gray-900">{a.label}</p>
                <p className="text-gray-700">{a.description}</p>
                <p className="mt-1 text-gray-700 break-all">
                  <span className="text-gray-600">Email:</span> {a.email}
                  <br />
                  <span className="text-gray-600">Password:</span> {a.password}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="mt-2 text-primary font-medium hover:text-primary-600"
                >
                  Fill in {a.label.toLowerCase()} login →
                </button>
              </li>
            ))}
          </ul>
        </section>
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

      <p className="mt-6 pt-4 border-t border-gray-200 text-center text-sm text-gray-600">
        Looking for the rider and driver app?{' '}
        <Link href="/mobile" className="text-primary font-medium hover:text-primary-600">
          Try the mobile app
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
