import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchRole } from '@/lib/roles';

export const metadata: Metadata = { title: 'Team' };

/** Admins only (also enforced by middleware, RLS and the team functions). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await fetchRole(supabase, user.id)) !== 'platform_admin') {
    redirect('/staff/drivers?denied=admin');
  }
  return children;
}
