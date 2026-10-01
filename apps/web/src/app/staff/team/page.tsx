/**
 * Admins: manage the PullUp team (admins and support staff).
 *
 * Admin-only on every layer: middleware and this page's layout check the
 * role, the user list is readable by admins only (RLS), and the
 * invite-team-member / remove-team-member functions verify the caller is an
 * admin. Admins can't remove themselves.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';
import StatusMessage from '@/components/StatusMessage';

type TeamRole = 'platform_admin' | 'platform_support';

interface Member {
  id: string;
  email: string;
  full_name: string;
  role: TeamRole;
  created_at: string;
}

const ROLE_LABEL: Record<TeamRole, string> = { platform_admin: 'Admin', platform_support: 'Support' };

async function functionError(err: unknown): Promise<string> {
  const body = await (err as { context?: Response }).context?.json?.().catch(() => null);
  return body?.error ?? (err instanceof Error ? err.message : 'Something went wrong');
}

export default function TeamPage() {
  const supabase = createSupabaseBrowserClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', role: 'platform_support' as TeamRole });
  const [inviting, setInviting] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setMe(user?.id ?? null);
    const { data, error: err } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .in('role', ['platform_admin', 'platform_support'])
      .order('role')
      .order('full_name');
    if (err) setError(err.message);
    else setMembers((data || []) as Member[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setInviting(true);
    const { error: fnError } = await supabase.functions.invoke('invite-team-member', {
      body: { email: form.email.trim(), full_name: form.full_name.trim(), role: form.role },
    });
    setInviting(false);
    if (fnError) {
      setError(await functionError(fnError));
      return;
    }
    setNotice(`Invitation sent to ${form.email.trim()}. They can set a password with "Forgot password?" on the sign-in page.`);
    setForm({ full_name: '', email: '', role: 'platform_support' });
    load();
  };

  const remove = async (m: Member) => {
    setRemovingId(m.id);
    setError(null);
    const { error: fnError } = await supabase.functions.invoke('remove-team-member', { body: { target_user_id: m.id } });
    setRemovingId(null);
    setConfirmId(null);
    if (fnError) {
      setError(await functionError(fnError));
      return;
    }
    setNotice(`${m.full_name || m.email} was removed from the team.`);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Team</h1>
      <p className="text-gray-600 mt-1 mb-6 max-w-2xl">
        People who can review drivers and receipts. Support staff handle day-to-day reviews; admins can also suspend
        drivers, extend receipt deadlines and manage this team.
      </p>

      <StatusMessage notice={notice} error={error} />

      <section className="card mb-8" aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-lg font-semibold text-gray-900 mb-3">Members</h2>
        {loading ? (
          <div className="flex justify-center py-8" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
            <span className="sr-only">Loading team…</span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {members.map((m) => (
              <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {m.full_name || 'Unnamed'} {m.id === me && <span className="text-sm text-gray-600">(you)</span>}
                  </p>
                  <p className="text-sm text-gray-700 break-all">
                    {m.email} · {ROLE_LABEL[m.role]}
                  </p>
                </div>
                {m.id !== me &&
                  (confirmId === m.id ? (
                    <div className="flex gap-2" role="group" aria-label={`Confirm removing ${m.full_name || m.email}`}>
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        disabled={removingId === m.id}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50"
                      >
                        {removingId === m.id ? 'Removing…' : 'Yes, remove'}
                      </button>
                      {/* Focus the safe choice so Enter doesn't remove by accident. */}
                      <button type="button" onClick={() => setConfirmId(null)} className="btn-secondary text-sm" autoFocus>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(m.id)}
                      className="btn-secondary text-sm"
                      aria-label={`Remove ${m.full_name || m.email} from the team`}
                    >
                      Remove…
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card max-w-2xl" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="text-lg font-semibold text-gray-900">Invite someone</h2>
        <p className="text-sm text-gray-600 mt-1">They&apos;ll get an email invitation to join the PullUp team.</p>
        <form onSubmit={invite} className="mt-4 space-y-4">
          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              id="invite-name"
              required
              autoComplete="off"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">Work email</label>
            <input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input-field"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-1">Role</legend>
            <div className="flex flex-wrap gap-4">
              {(['platform_support', 'platform_admin'] as TeamRole[]).map((r) => (
                <label key={r} className="flex items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="invite-role"
                    value={r}
                    checked={form.role === r}
                    onChange={() => setForm((f) => ({ ...f, role: r }))}
                    className="h-4 w-4"
                  />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={inviting} className="btn-primary">
            {inviting ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      </section>
    </div>
  );
}
