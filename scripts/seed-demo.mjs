#!/usr/bin/env node
/**
 * Reset and seed the public portfolio demo venue.
 *
 * Idempotent: wipes the demo venue's deals (claims and transactions cascade)
 * and the fake demo riders, then recreates 30 days of sample activity.
 * Touches only the venue owned by DEMO_EMAIL, users with DEMO_RIDER_DOMAIN
 * emails, and (when they exist) the demo rider/driver app accounts: the
 * driver's referrals and verification, and both accounts' claims.
 *
 * Usage (from repo root):
 *   node --env-file=apps/web/.env.local scripts/seed-demo.mjs
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (required)
 *   DEMO_EMAIL  (default: pullup.demo.app@gmail.com)
 *   DEMO_RIDER_EMAIL   (default: pullup.demo.app+rider@gmail.com)
 *   DEMO_DRIVER_EMAIL  (default: pullup.demo.app+driver@gmail.com)
 */

import { CLAIM_COST_MIN, calculateClaimCosts } from "../packages/shared/src/constants.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'pullup.demo.app@gmail.com';
const DEMO_RIDER_DOMAIN = 'demo.pullup.example.com';
const DEMO_RIDER_EMAIL = process.env.DEMO_RIDER_EMAIL || 'pullup.demo.app+rider@gmail.com';
const DEMO_DRIVER_EMAIL = process.env.DEMO_DRIVER_EMAIL || 'pullup.demo.app+driver@gmail.com';
// Sample riders referred by the demo driver (the demo rider is always referred).
const REFERRED_SAMPLE_RIDERS = 5;
// Driver bonuses newer than this stay unpaid, so the driver has a balance.
const UNPAID_BONUS_DAYS = 7;

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Deterministic PRNG so every reset produces the same-looking data.
let seed = 20260927;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const RIDER_NAMES = [
  'Maya Chen', 'Jordan Rivera', 'Priya Patel', 'Marcus Johnson', 'Sofia Alvarez',
  'Ethan Nguyen', 'Aaliyah Brooks', 'Noah Kim', 'Isabella Rossi', 'Liam O\'Connor',
  'Zara Ahmed', 'Caleb Turner',
];

const DEALS = [
  { title: 'Free appetizer with any entrée', description: 'Show your PullUp pass to your server to get a free starter.', discount_type: 'fixed_amount', discount_value: 12, cost_per_claim: 12, daily_cap: 20, requires_ride_receipt: true, weight: 4 },
  { title: '20% off your bill', description: 'Valid for dine-in parties of up to 4.', discount_type: 'percentage', discount_value: 20, cost_per_claim: 15, daily_cap: 30, requires_ride_receipt: true, weight: 5 },
  { title: 'Happy hour: $5 off drinks', description: 'Weekdays 4–7pm. Must be 21+.', discount_type: 'fixed_amount', discount_value: 5, cost_per_claim: 10, daily_cap: 25, requires_ride_receipt: false, weight: 3 },
  { title: 'Weekend brunch: 15% off', description: 'Saturdays and Sundays, 9am–2pm.', discount_type: 'percentage', discount_value: 15, cost_per_claim: 12, daily_cap: 15, requires_ride_receipt: true, weight: 2, weekendOnly: true },
  { title: 'Late-night bites (paused)', description: 'Seasonal deal, currently paused.', discount_type: 'percentage', discount_value: 10, cost_per_claim: 10, daily_cap: 10, requires_ride_receipt: false, weight: 0, inactive: true },
];

async function main() {
  const [owner] = await rest(`users?select=id&email=eq.${encodeURIComponent(DEMO_EMAIL)}`);
  if (!owner) throw new Error(`No user with email ${DEMO_EMAIL}. Sign up on the web dashboard first.`);
  const [venue] = await rest(`venues?select=id,name&owner_user_id=eq.${owner.id}`);
  if (!venue) throw new Error(`User ${DEMO_EMAIL} has no venue.`);
  console.log(`Seeding "${venue.name}" (${venue.id})`);

  // Venue profile. The payment method is a placeholder so the deal-creation RLS
  // gate (stripe_payment_method_id IS NOT NULL) lets demo visitors add deals.
  await rest(`venues?id=eq.${venue.id}`, {
    method: 'PATCH',
    body: {
      description: 'A cozy neighborhood café in downtown Sacramento. (Demo venue for the PullUp portfolio project.)',
      address: '1 Demo Plaza',
      city: 'Sacramento',
      state: 'CA',
      category: 'restaurant',
      latitude: 38.5767,
      longitude: -121.4934,
      is_active: true,
      payment_suspended: false,
      stripe_payment_method_id: 'pm_demo_placeholder',
      stripe_bank_last4: '6789',
      stripe_bank_institution: 'Demo Bank (test data)',
      avg_check_amount: 32,
    },
  });

  // Wipe previous demo data. Deleting deals cascades to claims and transactions.
  await rest(`deals?venue_id=eq.${venue.id}`, { method: 'DELETE' });
  await rest(`users?email=like.*%40${DEMO_RIDER_DOMAIN}`, { method: 'DELETE' });

  const riders = await rest('users', {
    method: 'POST',
    prefer: 'return=representation',
    body: RIDER_NAMES.map((full_name, i) => ({
      email: `rider${i + 1}@${DEMO_RIDER_DOMAIN}`,
      full_name,
      role: 'rider',
    })),
  });

  const deals = await rest('deals', {
    method: 'POST',
    prefer: 'return=representation',
    body: DEALS.map(({ weight, weekendOnly, inactive, cost_per_claim, ...d }) => ({
      ...d,
      // Same pricing model as the deal form: min cost per claim, 50/20/30 split.
      ...calculateClaimCosts(Math.max(cost_per_claim, CLAIM_COST_MIN)),
      venue_id: venue.id,
      hold_duration_minutes: 120,
      is_active: !inactive,
      requires_venue_receipt: false,
    })),
  });
  const weighted = deals.flatMap((d, i) => Array(DEALS[i].weight).fill({ deal: d, spec: DEALS[i] }));

  // Demo app accounts (created by signing up in the mobile app). Optional.
  const [appRider] = await rest(`users?select=id,full_name&email=eq.${encodeURIComponent(DEMO_RIDER_EMAIL)}`);
  const [appDriver] = await rest(`users?select=id,full_name&email=eq.${encodeURIComponent(DEMO_DRIVER_EMAIL)}`);
  const [driverProfile] = appDriver
    ? await rest(`driver_profiles?select=id,referral_code&user_id=eq.${appDriver.id}`)
    : [];
  const referredIds = new Set(
    driverProfile ? [...riders.slice(0, REFERRED_SAMPLE_RIDERS).map((r) => r.id), ...(appRider ? [appRider.id] : [])] : []
  );

  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  if (driverProfile) {
    await rest(`referrals?driver_id=eq.${driverProfile.id}`, { method: 'DELETE' });
    await rest('referrals', {
      method: 'POST',
      body: [...referredIds].map((riderId, i) => ({
        driver_id: driverProfile.id,
        rider_user_id: riderId,
        referral_code_used: driverProfile.referral_code,
        created_at: new Date(now.getTime() - (28 - i * 2) * DAY).toISOString(),
      })),
    });
    // Present the demo driver as verified so the earnings screens are unlocked.
    await rest(`driver_profiles?id=eq.${driverProfile.id}`, {
      method: 'PATCH',
      body: { is_verified: true, verification_status: 'approved' },
    });
  }

  // 30 days of claims, busier on Fri/Sat, a couple still "reserved" today.
  const claims = [];
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    const dow = day.getDay();
    const count = dow === 5 || dow === 6 ? between(4, 7) : between(1, 4);
    for (let n = 0; n < count; n++) {
      let choice = pick(weighted);
      if (choice.spec.weekendOnly && dow !== 0 && dow !== 6) choice = pick(weighted.filter((w) => !w.spec.weekendOnly));
      const reserved = new Date(day);
      reserved.setHours(between(11, 21), between(0, 59), between(0, 59), 0);
      if (reserved > now) reserved.setTime(now.getTime() - between(5, 90) * 60_000);

      const r = rand();
      let status = r < 0.72 ? 'completed' : r < 0.87 ? 'expired' : 'cancelled';
      if (daysAgo === 0 && n < 2) status = 'reserved';

      const expires = new Date(reserved.getTime() + 120 * 60_000);
      const completed = status === 'completed' ? new Date(reserved.getTime() + between(15, 90) * 60_000) : null;
      const rider = pick(riders);
      const referredBy = referredIds.has(rider.id) ? driverProfile.id : null;
      claims.push({
        deal_id: choice.deal.id,
        rider_user_id: rider.id,
        referring_driver_id: referredBy,
        status,
        reserved_at: reserved.toISOString(),
        expires_at: (status === 'reserved' ? new Date(now.getTime() + 90 * 60_000) : expires).toISOString(),
        completed_at: completed?.toISOString() ?? null,
        ride_receipt_verified: status === 'completed' && choice.spec.requires_ride_receipt,
        ride_credit_paid: status === 'completed',
        driver_kickback_paid: status === 'completed' && !(referredBy && daysAgo < UNPAID_BONUS_DAYS),
        venue_charged: status === 'completed',
        created_at: reserved.toISOString(),
      });
    }
  }

  // The demo rider's own history: a handful of visits over the last three weeks.
  if (appRider) {
    const history = [
      [20, 'completed'], [17, 'completed'], [13, 'expired'], [10, 'completed'],
      [6, 'cancelled'], [4, 'completed'], [2, 'completed'], [1, 'completed'],
    ];
    const activeDeals = weighted.filter((w) => !w.spec.weekendOnly);
    for (const [daysAgo, status] of history) {
      const choice = activeDeals[daysAgo % activeDeals.length];
      const reserved = new Date(now.getTime() - daysAgo * DAY);
      reserved.setHours(18, 30, 0, 0);
      const completed = status === 'completed' ? new Date(reserved.getTime() + 40 * 60_000) : null;
      claims.push({
        deal_id: choice.deal.id,
        rider_user_id: appRider.id,
        referring_driver_id: driverProfile?.id ?? null,
        status,
        reserved_at: reserved.toISOString(),
        expires_at: new Date(reserved.getTime() + 120 * 60_000).toISOString(),
        completed_at: completed?.toISOString() ?? null,
        ride_receipt_verified: status === 'completed' && choice.spec.requires_ride_receipt,
        ride_credit_paid: status === 'completed',
        driver_kickback_paid: status === 'completed' && daysAgo >= UNPAID_BONUS_DAYS,
        venue_charged: status === 'completed',
        created_at: reserved.toISOString(),
      });
    }
  }

  const inserted = await rest('deal_claims', { method: 'POST', prefer: 'return=representation', body: claims });

  const dealById = new Map(deals.map((d) => [d.id, d]));
  const txns = inserted
    .filter((c) => c.status === 'completed')
    .flatMap((c) => {
      const d = dealById.get(c.deal_id);
      const rows = [{
        deal_claim_id: c.id,
        type: 'venue_charge',
        amount: Number(d.ride_credit_amount) + Number(d.driver_kickback_amount) + Number(d.platform_fee_amount),
        status: 'completed',
        created_at: c.completed_at,
      }];
      if (c.referring_driver_id) {
        rows.push({
          deal_claim_id: c.id,
          type: 'driver_kickback',
          amount: Number(d.driver_kickback_amount),
          status: 'completed',
          created_at: c.completed_at,
        });
      }
      return rows;
    });
  if (txns.length) await rest('transactions', { method: 'POST', body: txns });

  const byStatus = inserted.reduce((acc, c) => ((acc[c.status] = (acc[c.status] || 0) + 1), acc), {});
  console.log(`Created ${riders.length} demo riders, ${deals.length} deals, ${inserted.length} claims`, byStatus, `${txns.length} transactions`);

  if (driverProfile) {
    const bonuses = inserted.filter((c) => c.status === 'completed' && c.referring_driver_id);
    const earned = bonuses.reduce((s, c) => s + Number(dealById.get(c.deal_id).driver_kickback_amount), 0);
    const unpaid = bonuses
      .filter((c) => !c.driver_kickback_paid)
      .reduce((s, c) => s + Number(dealById.get(c.deal_id).driver_kickback_amount), 0);
    await rest(`driver_profiles?id=eq.${driverProfile.id}`, {
      method: 'PATCH',
      body: { total_earnings: Number(earned.toFixed(2)), payout_balance: Number(unpaid.toFixed(2)) },
    });
    console.log(`Demo driver: ${referredIds.size} referrals, ${bonuses.length} bonuses, ${earned.toFixed(2)} earned, ${unpaid.toFixed(2)} unpaid`);
  } else {
    console.log(`No demo driver (${DEMO_DRIVER_EMAIL}) yet; skipped driver data.`);
  }
  if (appRider) {
    console.log(`Demo rider: ${inserted.filter((c) => c.rider_user_id === appRider.id).length} claims`);
  } else {
    console.log(`No demo rider (${DEMO_RIDER_EMAIL}) yet; skipped rider data.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
