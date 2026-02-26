'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<'loading' | 'request' | 'update'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function detectRecovery() {
      const url = new URL(window.location.href);

      // Check for ?mode=recovery (set by the auth callback route)
      if (url.searchParams.get('mode') === 'recovery') {
        setMode('update');
        return;
      }

      // Check for ?code=xxx (PKCE flow — Supabase appends this)
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          setMode('update');
          window.history.replaceState({}, '', '/reset-password');
          return;
        }
        // If client-side exchange fails (e.g. PKCE verifier mismatch),
        // show the error so we know what went wrong
        console.error('Code exchange failed:', error.message);
        setMessage({ type: 'error', text: `Session error: ${error.message}. Please request a new reset link.` });
        setMode('request');
        window.history.replaceState({}, '', '/reset-password');
        return;
      }

      // Check for #access_token=xxx&type=recovery (implicit flow)
      const hash = window.location.hash;
      if (hash && hash.includes('type=recovery')) {
        setMode('update');
        return;
      }

      // Listen for PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('update');
        }
      });

      // No recovery detected — show request form
      setTimeout(() => {
        setMode((prev) => prev === 'loading' ? 'request' : prev);
      }, 300);

      return () => subscription.unsubscribe();
    }

    detectRecovery();
  }, [supabase]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/reset-password?mode=recovery')}`,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Check your email for a password reset link.' });
    }
    setLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully. Redirecting...' });
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1500);
    }
    setLoading(false);
  };

  if (mode === 'loading') {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {mode === 'request' ? 'Reset your password' : 'Set a new password'}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {mode === 'request'
          ? 'Enter your email and we\'ll send you a link to reset your password.'
          : 'Enter your new password below.'}
      </p>

      {message && (
        <div
          role="alert"
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {mode === 'request' ? (
        <form onSubmit={handleRequestReset} className="space-y-4">
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
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Min 8 characters"
              required
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Confirm password"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        <Link href="/login" className="text-primary font-medium hover:text-primary-600">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
