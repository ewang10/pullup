/**
 * Which web area each role uses.
 *
 * Roles are read from public.users (via fetchRole), never from auth
 * user_metadata: users can edit their own metadata, so it must not be used
 * for authorization. Only the service role can change public.users.role.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const STAFF_ROLES = ['platform_admin', 'platform_support'] as const;

export function isStaffRole(role: unknown): boolean {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAdminRole(role: unknown): boolean {
  return role === 'platform_admin';
}

/** Landing page for a signed-in user, or null if the role has no web access. */
export function homeForRole(role: unknown): string | null {
  if (role === 'venue_admin') return '/dashboard';
  if (isStaffRole(role)) return '/staff/drivers';
  return null;
}

/** The signed-in user's role from public.users (RLS: users can read their own row). */
export async function fetchRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('role').eq('id', userId).single();
  return (data?.role as string | undefined) ?? null;
}
