/**
 * Staff area layout: platform admins and support only (also enforced by
 * middleware). Review pages for driver applications and receipts.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import StaffNav from '@/components/StaffNav';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchRole, isStaffRole } from '@/lib/roles';

export const metadata: Metadata = {
  title: { template: '%s | PullUp Staff', default: 'PullUp Staff' },
};

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user ? await fetchRole(supabase, user.id) : null;
  if (!user || !isStaffRole(role)) {
    redirect('/login?error=unauthorized');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StaffNav name={user.user_metadata?.full_name || user.email || 'Staff'} isAdmin={role === 'platform_admin'} />
      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
