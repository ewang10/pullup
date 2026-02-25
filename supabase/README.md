# PullUp Database and Backend

Supabase backend including Postgres schema, Row Level Security policies, Edge Functions, and scheduled jobs.

## Schema Overview

The database has 7 core tables:

| Table             | Description                                      |
| ----------------- | ------------------------------------------------ |
| `users`           | All app users (riders, drivers, venue admins) synced from Supabase Auth |
| `driver_profiles` | Extended profile for drivers (vehicle info, payout details) |
| `venues`          | Venue records owned by venue admins              |
| `deals`           | Deals created by venues (discount, terms, expiration) |
| `deal_claims`     | Claims made by riders against deals              |
| `transactions`    | Payment and payout records (Stripe)              |
| `referrals`       | Driver-to-rider referral links and kickback tracking |

## Key Relationships

```
users (role: venue_admin)
  └── venues (owner_id -> users.id)
       └── deals (venue_id -> venues.id)
            └── deal_claims (deal_id -> deals.id)
                 ├── rider: user_id -> users.id
                 └── referrals (claim_id -> deal_claims.id)
                      └── driver: driver_id -> users.id

users (role: driver)
  └── driver_profiles (user_id -> users.id)
  └── referrals (driver_id -> users.id)

users (role: rider)
  └── deal_claims (user_id -> users.id)

transactions
  ├── user_id -> users.id
  └── claim_id -> deal_claims.id (nullable)
```

## RLS Policy Summary

Row Level Security is enabled on all tables. Policies follow the principle of least privilege:

| Table             | SELECT                          | INSERT                     | UPDATE                     | DELETE          |
| ----------------- | ------------------------------- | -------------------------- | -------------------------- | --------------- |
| `users`           | Own row only                    | Via auth trigger only      | Own row only               | None            |
| `driver_profiles` | Own row only                    | Drivers only (own row)     | Own row only               | None            |
| `venues`          | Public (active venues)          | Venue admins only          | Own venues only            | Own venues only |
| `deals`           | Public (active deals)           | Venue admin (own venue)    | Venue admin (own venue)    | Venue admin (own venue) |
| `deal_claims`     | Own claims or venue admin's deals | Riders only              | Service role / edge functions | None          |
| `transactions`    | Own transactions                | Service role only          | Service role only          | None            |
| `referrals`       | Own referrals (driver or rider) | Service role only          | Service role only          | None            |

## Edge Functions

Located in `supabase/functions/`. Each function runs on Deno Deploy.

| Function           | Trigger       | Description                                              |
| ------------------ | ------------- | -------------------------------------------------------- |
| `claim-deal`       | HTTP (POST)   | Creates a deal claim for a rider, validates deal availability and claim limits |
| `complete-claim`   | HTTP (POST)   | Marks a claim as completed after QR scan and optional receipt verification |
| `expire-claims`    | pg_cron / HTTP| Expires claims that exceeded their time window           |
| `process-payment`  | HTTP (POST)   | Handles Stripe payment events and records transactions   |
| `verify-receipt`   | HTTP (POST)   | Validates uploaded receipt images against claim requirements |

## Migrations

Migrations live in `supabase/migrations/` and are applied in order:

| File                                     | Contents                                          |
| ---------------------------------------- | ------------------------------------------------- |
| `00001_initial_schema.sql`               | Table definitions, RLS policies, indexes          |
| `00002_auth_trigger_and_functions.sql`   | Auth trigger to sync new users to `users` table, RPC functions |

Apply migrations with:

```bash
supabase db push
```

Or run them manually in the Supabase SQL Editor.

## Scheduled Jobs

The `expire-claims` function is invoked on a schedule via `pg_cron` to automatically expire deal claims that have passed their redemption window. This prevents riders from holding claims indefinitely and frees up deal capacity for other users.
