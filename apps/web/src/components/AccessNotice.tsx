/**
 * Explains why a signed-in user landed on their own home page after opening
 * a page their role can't use (middleware adds ?denied=<area>). Focus moves
 * to the notice so screen readers announce it, and the parameter is removed
 * so a refresh doesn't repeat it.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const MESSAGES: Record<string, string> = {
  staff: 'That page is for the PullUp team. You’re signed in as a venue owner, so we brought you to your dashboard.',
  venue: 'That page is for venue owners. You’re signed in as PullUp staff, so we brought you to driver reviews.',
  admin: 'Only admins can manage the team. Ask an admin if you need access.',
};

export default function AccessNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const denied = params?.get('denied');

  useEffect(() => {
    if (!denied) return;
    setMessage(MESSAGES[denied] ?? 'You don’t have access to that page.');
    const rest = new URLSearchParams(params?.toString());
    rest.delete('denied');
    const path = pathname ?? '/';
    router.replace(rest.size ? `${path}?${rest}` : path, { scroll: false });
  }, [denied, params, pathname, router]);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="mb-6 flex items-start justify-between gap-4 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="shrink-0 min-h-[32px] px-2 rounded font-medium text-amber-900 underline hover:bg-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}
