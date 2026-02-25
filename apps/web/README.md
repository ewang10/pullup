# PullUp Web Dashboard

Next.js 15 admin panel for venue owners. Manage deals, view analytics, generate QR codes, and handle billing.

## Routes

| Route                  | Description                              |
| ---------------------- | ---------------------------------------- |
| `/login`               | Venue admin login                        |
| `/signup`              | Venue admin registration                 |
| `/dashboard`           | Overview with key metrics and recent activity |
| `/deals`               | List and manage active/inactive deals    |
| `/deals/new`           | Create a new deal                        |
| `/deals/[id]/edit`     | Edit an existing deal                    |
| `/analytics`           | Charts and stats (claims, redemptions, revenue) |
| `/qr-code`             | Generate and download venue QR codes     |
| `/billing`             | Payment history and subscription management |
| `/settings`            | Venue profile, hours, branding           |

## How to Run

From the monorepo root:

```bash
npm run dev:web
```

Or from the `apps/web` directory:

```bash
npm run dev
```

The dashboard runs on `http://localhost:3000` by default.

## Auth

Authentication uses Supabase Auth with server-side rendering (SSR) support:

- **Middleware** (`middleware.ts`) protects all dashboard routes. Unauthenticated requests are redirected to `/login`.
- The middleware verifies the session and checks that the user has the `venue_admin` role in their `user_metadata`.
- On login, the user's session is stored as an HTTP-only cookie managed by the Supabase SSR helpers.

## Supabase Client Patterns

The dashboard uses two Supabase client factories depending on the rendering context:

### Client Components

```ts
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const supabase = createSupabaseBrowserClient();
```

Use this in any component that runs in the browser (hooks, event handlers, client-side data fetching).

### Server Components and Middleware

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";

const supabase = await createSupabaseServerClient();
```

Use this in server components, server actions, route handlers, and middleware. The server client reads cookies from the request to maintain the user session.
