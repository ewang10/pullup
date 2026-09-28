/**
 * Which web area each role uses. Roles come from auth user_metadata.role,
 * which the database mirrors in public.users.role.
 */

export const STAFF_ROLES = ['platform_admin', 'platform_support'] as const;

export function isStaffRole(role: unknown): boolean {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Landing page for a signed-in user, or null if the role has no web access. */
export function homeForRole(role: unknown): string | null {
  if (role === 'venue_admin') return '/dashboard';
  if (isStaffRole(role)) return '/staff/drivers';
  return null;
}
