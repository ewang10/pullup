/**
 * Dashboard layout with server-side role verification.
 *
 * Wraps all dashboard routes with the sidebar navigation and enforces that
 * the current user is authenticated and holds the `venue_admin` role.
 * Unauthenticated or unauthorized users are redirected to `/login`.
 */

import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'venue_admin') {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main id="main-content" role="main" className="flex-1 bg-gray-50">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
