# PullUp

A mobility incentive platform connecting riders, drivers, and venue admins. Riders claim deals at local venues, drivers earn kickbacks for referrals, and venues get foot traffic. PullUp creates a three-sided marketplace where everyone benefits from local commerce.

## Tech Stack

| Layer            | Technology                              |
| ---------------- | --------------------------------------- |
| Mobile App       | Expo (React Native) with Expo Router    |
| Web Dashboard    | Next.js 15 (App Router)                 |
| Backend / DB     | Supabase (Postgres, Auth, Edge Functions, Storage) |
| Language         | TypeScript                              |
| Monorepo         | Turborepo                               |
| State Management | Zustand                                 |
| Charts           | Recharts                                |
| Styling          | Tailwind CSS                            |

## Monorepo Structure

```
pullup/
├── apps/
│   ├── mobile/          # Expo/React Native mobile app (riders + drivers)
│   └── web/             # Next.js venue admin dashboard
├── packages/
│   └── shared/          # Shared TypeScript types
├── supabase/
│   ├── migrations/      # SQL schema migrations
│   └── functions/       # Deno edge functions
├── package.json         # Turborepo root
└── turbo.json
```

## Prerequisites

- Node.js 18+
- npm
- Supabase CLI (optional, for local development and running migrations)
- Expo CLI (`npx expo` works without global install)

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   Copy the example env files and fill in your values:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   See the [Environment Variables](#environment-variables) section below.

3. **Run the web dashboard**

   ```bash
   npm run dev:web
   ```

4. **Run the mobile app**

   ```bash
   cd apps/mobile
   npx expo start
   ```

## Environment Variables

| Variable               | Used By       | Description                              |
| ---------------------- | ------------- | ---------------------------------------- |
| `SUPABASE_URL`         | web, mobile   | Supabase project URL                     |
| `SUPABASE_ANON_KEY`    | web, mobile   | Supabase anonymous/public API key        |
| `SUPABASE_SERVICE_KEY` | edge functions| Supabase service role key (server only)  |
| `STRIPE_SECRET_KEY`    | web, functions| Stripe secret key for payment processing |
| `STRIPE_WEBHOOK_SECRET`| functions     | Stripe webhook signing secret            |
| `EXPO_PUBLIC_SUPABASE_URL` | mobile    | Supabase URL exposed to Expo client      |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | Supabase anon key exposed to Expo client |

## Database Setup

1. Create a new project on [Supabase](https://supabase.com).
2. Copy the project URL and anon key into your env files.
3. Run migrations against your Supabase project:

   ```bash
   supabase db push
   ```

   Or apply migrations manually in the Supabase SQL Editor from `supabase/migrations/`.

## Available Scripts

| Script           | Description                                    |
| ---------------- | ---------------------------------------------- |
| `npm run dev:web`    | Start the Next.js web dashboard in dev mode |
| `npm run dev:mobile` | Start the Expo mobile app in dev mode       |
| `npm run typecheck`  | Run TypeScript type checking across all packages |
| `npm run lint`       | Run linting across all packages             |
