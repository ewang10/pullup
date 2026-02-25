/**
 * Next.js middleware for route protection and access control.
 *
 * Protects all dashboard-related routes (`/dashboard`, `/deals`, `/analytics`,
 * `/billing`, `/qr-code`, `/settings`) by requiring an authenticated user with
 * the `venue_admin` role. Unauthenticated users are redirected to `/login`.
 * Authenticated users without the `venue_admin` role are redirected to
 * `/login?error=unauthorized`. Authenticated users visiting `/login` or
 * `/signup` are redirected to `/dashboard`.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
        setAll(cookiesToSet) {
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

  // --- Protected route checks ---
  if (isProtectedRoute(pathname)) {
    // Not signed in at all — redirect to login
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // Signed in but not a venue admin — redirect with error flag
    const role = user.user_metadata?.role;
    if (role !== 'venue_admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // --- Auth page redirect for already-authenticated venue admins ---
  if (
    user &&
    (pathname === '/login' || pathname === '/signup')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
