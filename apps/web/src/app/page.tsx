import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchRole, homeForRole } from '@/lib/roles';

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  redirect((user && homeForRole(await fetchRole(supabase, user.id))) || '/login');
}
