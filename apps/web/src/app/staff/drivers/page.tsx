/**
 * Staff: review driver applications and manage driver standing.
 *
 * Support and admins approve or reject pending applications (and re-approve
 * rejected drivers). Only admins can suspend an approved driver or reinstate
 * a suspended one; the database enforces this in review_driver(). Every
 * decision is recorded with who made it and why, shown on each driver.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import StatusMessage from '@/components/StatusMessage';
import { fetchRole, isAdminRole } from '@/lib/roles';
import { formatCurrency } from '@/lib/claims';

type Status = 'pending' | 'rejected' | 'approved' | 'suspended';
type Action = 'approve' | 'reject' | 'suspend' | 'reinstate';

interface ReviewEvent {
  action: 'approved' | 'rejected' | 'suspended' | 'reinstated';
  note: string | null;
  actor_name: string;
  actor_role: string;
  payouts_on_hold: boolean;
  created_at: string;
}

interface DriverApplication {
  driver_profile_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  rideshare_platform: string | null;
  rideshare_driver_id: string | null;
  verification_status: Status;
  verification_note: string | null;
  payouts_on_hold: boolean;
  payout_balance: number;
  applied_at: string;
  reviewed_at: string | null;
  history: ReviewEvent[];
}

const TABS: { status: Status; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'suspended', label: 'Suspended' },
];

const PLATFORM_LABELS: Record<string, string> = { uber: 'Uber', lyft: 'Lyft', both: 'Uber and Lyft', other: 'Other' };

const REASONS: Record<'reject' | 'suspend', string[]> = {
  reject: [
    "We couldn't verify your rideshare driver ID.",
    'The driver ID does not match the name on your account.',
    'Your rideshare account is not active.',
  ],
  suspend: [
    'Your rideshare account is no longer active.',
    'Your driver code was used on rides you did not give.',
    'We received a report we need to look into.',
  ],
};

const EVENT_TEXT: Record<ReviewEvent['action'], string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
  reinstated: 'Reinstated',
};

function formatDate(iso: string | null, withTime = false) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export default function StaffDriversPage() {
  const supabase = createSupabaseBrowserClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<Status>('pending');
  const [drivers, setDrivers] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ id: string; action: 'reject' | 'suspend' } | null>(null);
  const [reason, setReason] = useState('');
  const [holdPayouts, setHoldPayouts] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) setIsAdmin(isAdminRole(await fetchRole(supabase, user.id)));
    });
  }, [supabase]);

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

  const openForm = (id: string, action: 'reject' | 'suspend', current: string | null, currentHold = false) => {
    setForm({ id, action });
    setReason(current ?? '');
    // Editing a suspension keeps its current payout hold unless changed.
    setHoldPayouts(currentHold);
    setError(null);
  };

  const review = async (driver: DriverApplication, action: Action) => {
    if ((action === 'reject' || action === 'suspend') && !reason.trim()) {
      setError('Add a reason. The driver will see it in the app.');
      return;
    }
    setBusyId(driver.driver_profile_id);
    setError(null);
    const { error: err } = await supabase.rpc('review_driver', {
      p_driver_profile_id: driver.driver_profile_id,
      p_action: action,
      p_note: action === 'reject' || action === 'suspend' ? reason.trim() : null,
      p_hold_payouts: action === 'suspend' ? holdPayouts : false,
    });
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    const verb = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reinstate: 'reinstated' }[action];
    setNotice(`${driver.full_name || 'Driver'} ${verb}.`);
    setForm(null);
    setReason('');
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Check each driver&apos;s rideshare platform and driver ID before approving. Drivers can&apos;t use the app
            until they&apos;re approved, and they see your reason if you reject or suspend them.
            {!isAdmin && ' Only admins can suspend an approved driver.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-gray-200 rounded-lg p-1" role="group" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              aria-pressed={status === t.status}
              onClick={() => {
                setStatus(t.status);
                setNotice(null);
                setForm(null);
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

      <StatusMessage notice={notice} error={error} />

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
            const formOpen = form?.id === d.driver_profile_id ? form.action : null;
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
                    {(d.verification_status === 'approved' || d.verification_status === 'suspended') && (
                      <>
                        <dt className="text-gray-600">Unpaid bonuses</dt>
                        <dd className="text-gray-900">
                          {formatCurrency(Number(d.payout_balance))}
                          {d.payouts_on_hold && <span className="ml-1 font-medium text-red-800">(on hold)</span>}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>

                {d.history.length > 0 && (
                  <details className="mt-4 border-t border-gray-200 pt-3" open={d.verification_status !== 'approved'}>
                    <summary className="cursor-pointer text-sm font-medium text-gray-900">
                      Decision history ({d.history.length})
                    </summary>
                    <ol className="mt-2 space-y-2 text-sm">
                      {d.history.map((e, i) => (
                        <li key={i} className="text-gray-800">
                          <span className="font-medium">{EVENT_TEXT[e.action]}</span> by {e.actor_name}{' '}
                          <span className="text-gray-600">
                            ({e.actor_role === 'platform_admin' ? 'admin' : 'support'}) · {formatDate(e.created_at, true)}
                          </span>
                          {e.note && <span className="block text-gray-700">Reason: {e.note}</span>}
                          {e.payouts_on_hold && <span className="block text-red-800">Unpaid bonuses put on hold</span>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}

                {formOpen ? (
                  <fieldset className="mt-4 border-t border-gray-200 pt-4">
                    <legend className="text-sm font-medium text-gray-900">
                      {formOpen === 'suspend'
                        ? 'Why are you suspending this driver? They will see this.'
                        : 'Why are you rejecting this driver? They will see this.'}
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {REASONS[formOpen].map((r) => (
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
                      placeholder="Or write your own reason."
                      // Move focus into the form that just opened.
                      autoFocus
                    />
                    {formOpen === 'suspend' && (
                      <div className="mt-3 text-sm">
                        <label className="flex items-start gap-2 text-gray-900">
                          <input
                            type="checkbox"
                            checked={holdPayouts}
                            onChange={(e) => setHoldPayouts(e.target.checked)}
                            className="mt-1 h-4 w-4"
                          />
                          <span>
                            Hold unpaid bonuses ({formatCurrency(Number(d.payout_balance))}) for suspected fraud
                            <span className="block text-gray-700">
                              Otherwise the driver keeps what they&apos;ve already earned and can still cash it out. New
                              claims can&apos;t use their code either way.
                            </span>
                          </span>
                        </label>
                      </div>
                    )}
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => review(d, formOpen)}
                        className="px-4 py-2 rounded-lg font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : formOpen === 'suspend' ? 'Suspend driver' : 'Reject driver'}
                      </button>
                      <button type="button" onClick={() => setForm(null)} className="btn-secondary">
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {(d.verification_status === 'pending' || d.verification_status === 'rejected') && (
                      <>
                        <button type="button" disabled={busy} onClick={() => review(d, 'approve')} className="btn-primary">
                          {busy ? 'Saving…' : 'Approve driver'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openForm(d.driver_profile_id, 'reject', d.verification_note)}
                          className="btn-secondary"
                        >
                          {d.verification_status === 'pending' ? 'Reject…' : 'Change reason…'}
                        </button>
                      </>
                    )}
                    {d.verification_status === 'approved' && isAdmin && (
                      <button
                        type="button"
                        onClick={() => openForm(d.driver_profile_id, 'suspend', null)}
                        className="btn-secondary"
                      >
                        Suspend…
                      </button>
                    )}
                    {d.verification_status === 'suspended' && isAdmin && (
                      <>
                        <button type="button" disabled={busy} onClick={() => review(d, 'reinstate')} className="btn-primary">
                          {busy ? 'Saving…' : 'Reinstate driver'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openForm(d.driver_profile_id, 'suspend', d.verification_note, d.payouts_on_hold)}
                          className="btn-secondary"
                        >
                          Change reason…
                        </button>
                      </>
                    )}
                    {(d.verification_status === 'approved' || d.verification_status === 'suspended') && !isAdmin && (
                      <p className="text-sm text-gray-700">Only admins can change an approved or suspended driver.</p>
                    )}
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
