/**
 * Public site header. Signed-in venue owners and staff get a link back to
 * their area instead of "Venue sign in". On small screens the links collapse
 * into a native <details> menu (keyboard and screen-reader friendly).
 */
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchRole, homeForRole } from '@/lib/roles';

export const SITE_LINKS = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/faq', label: 'FAQ' },
  { href: '/mobile', label: 'Try the app' },
  { href: '/support', label: 'Support' },
];

export default async function SiteHeader() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const home = user ? homeForRole(await fetchRole(supabase, user.id)) : null;
  const account = home
    ? { href: home, label: home.startsWith('/staff') ? 'Staff area' : 'Dashboard' }
    : { href: '/login', label: 'Venue sign in' };

  return (
    <header className="gradient-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-6">
        <Link href="/" className="text-2xl font-bold text-white rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Pull<span className="text-primary-300">Up</span>
          <span className="sr-only"> home</span>
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-1 flex-1">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href={account.href}
          className="hidden md:inline-block ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100"
        >
          {account.label}
        </Link>

        <details className="md:hidden ml-auto relative">
          <summary className="list-none cursor-pointer px-3 py-2 rounded-lg text-sm font-medium text-white border border-white/40 [&::-webkit-details-marker]:hidden">
            Menu
          </summary>
          <nav aria-label="Main" className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg p-2 z-50">
            <ul>
              {[...SITE_LINKS, account].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block px-3 py-2 rounded-lg text-gray-900 hover:bg-gray-100">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
