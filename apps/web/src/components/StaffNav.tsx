'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-client';

const LINKS = [
  { href: '/staff/drivers', label: 'Drivers' },
  { href: '/staff/receipts', label: 'Receipts' },
];

export default function StaffNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const signOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="gradient-dark">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <p className="text-xl font-bold text-white">
          Pull<span className="text-primary-300">Up</span>{' '}
          <span className="text-sm font-medium text-gray-300">{isAdmin ? 'Admin' : 'Support'}</span>
        </p>
        <nav aria-label="Staff navigation" className="flex gap-1">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  active ? 'bg-white/15 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-300">{name}</span>
          <button
            type="button"
            onClick={signOut}
            className="px-3 py-2 rounded-lg text-gray-200 hover:text-white hover:bg-white/10 font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
