/**
 * Staff: review driver applications.
 *
 * New drivers start as pending. Staff check the rideshare platform and driver
 * ID they signed up with, then approve or reject with a reason the driver sees
 * in the app. Rejected drivers can be approved later (e.g. after they send
 * corrected details), and approved drivers can be revoked.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

type Status = 'pending' | 'rejected' | 'approved';

interface DriverApplication {
  driver_profile_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  rideshare_platform: string | null;
  rideshare_driver_id: string | null;
  verification_status: Status;
  verification_note: string | null;
  applied_at: string;
  reviewed_at: string | null;
}

const TABS: { status: Status; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'approved', label: 'Approved' },
];

const PLATFORM_LABELS: Record<string, string> = {
  uber: 'Uber',
  lyft: 'Lyft',
  both: 'Uber and Lyft',
  other: 'Other',
};

const REJECTION_REASONS = [
  "We couldn't verify your rideshare driver ID.",
  'The driver ID does not match the name on your account.',
  'Your rideshare account is not active.',
];

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

export default function StaffDriversPage() {
  const supabase = createSupabaseBrowserClient();
  const [status, setStatus] = useState<Status>('pending');
  const [drivers, setDrivers] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_drivers_for_review', { p_status: status });
    if (err) setError(err.message);
    else setDrivers((data || []) as DriverApplication[]);
    setLoading(false);
  }, [supabase, status]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (driver: DriverApplication, approved: boolean) => {
    if (!approved && !reason.trim()) {
      setError('Add a reason so the driver knows what to fix.');
      return;
    }
    setBusyId(driver.driver_profile_id);
    setError(null);
    const { error: err } = await supabase.rpc('set_driver_verified', {
      p_driver_profile_id: driver.driver_profile_id,
      p_verified: approved,
      p_note: approved ? null : reason.trim(),
    });
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice(`${driver.full_name || 'Driver'} ${approved ? 'approved' : 'rejected'}.`);
    setRejecting(null);
    setReason('');
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver applications</h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Check each driver&apos;s rideshare platform and driver ID before approving. Drivers can&apos;t use the app
            until they&apos;re approved, and they see your reason if you reject them.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-200 rounded-lg p-1" role="group" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              aria-pressed={status === t.status}
              onClick={() => {
                setStatus(t.status);
                setNotice(null);
                setRejecting(null);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                status === t.status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">
        {notice && (
          <p className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">{notice}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
          <span className="sr-only">Loading drivers…</span>
        </div>
      ) : drivers.length === 0 ? (
        <p className="card text-center text-gray-600">
          {status === 'pending' ? 'No drivers waiting for review.' : `No ${status} drivers.`}
        </p>
      ) : (
        <ul className="space-y-4">
          {drivers.map((d) => {
            const busy = busyId === d.driver_profile_id;
            return (
              <li key={d.driver_profile_id} className="card">
                <div className="flex flex-wrap justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{d.full_name || 'Unnamed driver'}</h2>
                    <p className="text-sm text-gray-700 break-all">{d.email}</p>
                    {d.phone && (
                      <p className="text-sm text-gray-700">
                        <a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a>
                      </p>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <dt className="text-gray-600">Platform</dt>
                    <dd className="text-gray-900 font-medium">
                      {d.rideshare_platform ? PLATFORM_LABELS[d.rideshare_platform] ?? d.rideshare_platform : 'Not provided'}
                    </dd>
                    <dt className="text-gray-600">Driver ID</dt>
                    <dd className="text-gray-900 font-mono">{d.rideshare_driver_id || 'Not provided'}</dd>
                    <dt className="text-gray-600">Applied</dt>
                    <dd className="text-gray-900">{formatDate(d.applied_at)}</dd>
                    {d.reviewed_at && (
                      <>
                        <dt className="text-gray-600">Reviewed</dt>
                        <dd className="text-gray-900">{formatDate(d.reviewed_at)}</dd>
                      </>
                    )}
                  </dl>
                </div>

                {d.verification_status === 'rejected' && d.verification_note && (
                  <p className="mt-3 text-sm text-gray-800">
                    <span className="font-medium">Reason sent to driver:</span> {d.verification_note}
                  </p>
                )}

                {rejecting === d.driver_profile_id ? (
                  <fieldset className="mt-4 border-t border-gray-200 pt-4">
                    <legend className="text-sm font-medium text-gray-900">
                      Why are you {d.verification_status === 'approved' ? 'revoking' : 'rejecting'} this driver?
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {REJECTION_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(r)}
                          aria-pressed={reason === r}
                          className={`text-left text-sm px-3 py-1.5 rounded-full border ${
                            reason === r ? 'border-primary bg-primary-50 text-gray-900' : 'border-gray-400 text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <label htmlFor={`reason-${d.driver_profile_id}`} className="sr-only">
                      Reason shown to the driver
                    </label>
                    <textarea
                      id={`reason-${d.driver_profile_id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="input-field mt-3 min-h-[72px]"
                      placeholder="Or write your own reason. The driver will see this."
                    />
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => review(d, false)}
                        className="px-4 py-2 rounded-lg font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : d.verification_status === 'approved' ? 'Revoke approval' : 'Reject driver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejecting(null);
                          setReason('');
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {d.verification_status !== 'approved' && (
                      <button type="button" disabled={busy} onClick={() => review(d, true)} className="btn-primary">
                        {busy ? 'Saving…' : 'Approve driver'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(d.driver_profile_id);
                        setReason(d.verification_note ?? '');
                        setError(null);
                      }}
                      className="btn-secondary"
                    >
                      {d.verification_status === 'pending'
                        ? 'Reject…'
                        : d.verification_status === 'approved'
                        ? 'Revoke approval…'
                        : 'Change reason…'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
