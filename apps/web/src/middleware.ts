/**
 * Next.js middleware for route protection and access control.
 *
 * Venue pages (`/dashboard`, `/deals`, `/analytics`, `/billing`, `/qr-code`,
 * `/settings`) need the `venue_admin` role; `/staff` needs a staff role and
 * `/staff/team` an admin. Signed-out visitors go to `/login`. Signed-in users
 * who open another role's page go to their own home with `?denied=<area>`,
 * which AccessNotice explains. Riders and drivers (no web home) go to
 * `/login?error=unauthorized`. Signed-in users visiting `/login` or `/signup`
 * go to their home.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { fetchRole, homeForRole, isStaffRole } from '@/lib/roles';

/** Route prefixes that require authentication and the venue_admin role. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/deals',
  '/analytics',
  '/billing',
  '/qr-code',
  '/settings',
];

/**
 * Returns `true` when the given pathname starts with any of the
 * protected route prefixes.
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Sends a signed-in user who opened another role's page to their own home,
 * with ?denied=<area> so the page can explain why (see AccessNotice).
 */
function deniedRedirect(request: NextRequest, home: string, area: 'staff' | 'venue' | 'admin') {
  const url = request.nextUrl.clone();
  url.pathname = home;
  url.search = '';
  url.searchParams.set('denied', area);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Role from public.users, not user_metadata (which users can edit).
  const role = user ? await fetchRole(supabase, user.id) : null;

  // --- Staff area: platform admins and support only ---
  if (pathname === '/staff' || pathname.startsWith('/staff/')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    // The team page is for admins only.
    const adminOnly = pathname === '/staff/team' || pathname.startsWith('/staff/team/');
    if (isStaffRole(role) && adminOnly && role !== 'platform_admin') {
      return deniedRedirect(request, '/staff/drivers', 'admin');
    }
    const home = homeForRole(role);
    if (!isStaffRole(role) && home) {
      return deniedRedirect(request, home, 'staff');
    }
    if (!isStaffRole(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // --- Protected route checks ---
  if (isProtectedRoute(pathname)) {
    // Not signed in at all — redirect to login
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Signed in but not a venue admin — redirect with error flag
    const home = homeForRole(role);
    if (role !== 'venue_admin' && home) {
      return deniedRedirect(request, home, 'venue');
    }
    if (role !== 'venue_admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // --- Auth page redirect for already-authenticated venue admins / staff ---
  const home = user ? homeForRole(role) : null;
  if (home && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
