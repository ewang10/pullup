#!/usr/bin/env node
/**
 * Reset and seed the public portfolio demo venue.
 *
 * Idempotent: wipes the demo venue's deals (claims and transactions cascade)
 * and the fake demo riders, then recreates 30 days of sample activity.
 * Touches only the venue owned by DEMO_EMAIL, users with DEMO_RIDER_DOMAIN
 * emails, and (when they exist) the demo rider/driver app accounts: the
 * driver's linked claims and verification, and both accounts' claims.
 *
 * Usage (from repo root):
 *   node --env-file=apps/web/.env.local scripts/seed-demo.mjs
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (required)
 *   DEMO_EMAIL  (default: pullup.demo.app@gmail.com)
 *   DEMO_RIDER_EMAIL   (default: pullup.demo.app+rider@gmail.com)
 *   DEMO_DRIVER_EMAIL  (default: pullup.demo.app+driver@gmail.com)
 *   DEMO_STAFF_EMAIL   (default: pullup.demo.app+staff@gmail.com)
 *   DEMO_ADMIN_EMAIL   (default: pullup.demo.app+admin@gmail.com)
 */

import { CLAIM_COST_MIN, calculateClaimCosts } from "../packages/shared/src/constants.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'pullup.demo.app@gmail.com';
const DEMO_RIDER_DOMAIN = 'demo.pullup.example.com';
const DEMO_RIDER_EMAIL = process.env.DEMO_RIDER_EMAIL || 'pullup.demo.app+rider@gmail.com';
const DEMO_DRIVER_EMAIL = process.env.DEMO_DRIVER_EMAIL || 'pullup.demo.app+driver@gmail.com';
const DEMO_STAFF_EMAIL = process.env.DEMO_STAFF_EMAIL || 'pullup.demo.app+staff@gmail.com';
const DEMO_ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'pullup.demo.app+admin@gmail.com';
// Sample riders whose claims the demo driver is linked to (plus the demo rider).
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
  { title: '20% off your bill', description: 'Valid for dine-in parties of up to 4.', discount_type: 'percentage', discount_value: 20, cost_per_claim: 15, daily_cap: 30, requires_ride_receipt: true, requires_venue_receipt: true, weight: 5 },
  { title: 'Happy hour: $5 off drinks', description: 'Weekdays 4–7pm. Must be 21+.', discount_type: 'fixed_amount', discount_value: 5, cost_per_claim: 10, daily_cap: 25, requires_ride_receipt: false, weight: 3 },
  { title: 'Weekend brunch: 15% off', description: 'Saturdays and Sundays, 9am–2pm.', discount_type: 'percentage', discount_value: 15, cost_per_claim: 12, daily_cap: 15, requires_ride_receipt: true, weight: 2, weekendOnly: true },
  { title: 'Late-night bites (paused)', description: 'Seasonal deal, currently paused.', discount_type: 'percentage', discount_value: 10, cost_per_claim: 10, daily_cap: 10, requires_ride_receipt: false, weight: 0, inactive: true },
];

/** Supabase Auth admin API (service role). */
async function authAdmin(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${URL}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} auth/${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Give a demo account a platform role. public.users.role is what every
 * permission check uses; user_metadata is kept in sync for display only.
 */
async function ensurePlatformAccount(email, role, fullName) {
  const [account] = await rest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
  if (!account) {
    console.log(`No demo account ${email} yet; skipped.`);
    return null;
  }
  await rest(`users?id=eq.${account.id}`, { method: 'PATCH', body: { role, full_name: fullName } });
  const user = await authAdmin(`users/${account.id}`);
  await authAdmin(`users/${account.id}`, {
    method: 'PUT',
    body: { user_metadata: { ...(user.user_metadata || {}), role, full_name: fullName } },
  });
  console.log(`${fullName}: ${role}`);
  return { id: account.id, name: fullName, role };
}

// Driver applications for the staff review page (sample users without logins).
// Phone numbers use the reserved 555-01xx fictional range.
const APPLICANTS = [
  { name: 'Carlos Mendoza', phone: '+19165550141', platform: 'uber', driverId: 'UBR-4821-7730', status: 'pending', daysAgo: 1 },
  { name: 'Tanya Brooks', phone: '+19165550142', platform: 'lyft', driverId: 'LYFT-88213', status: 'pending', daysAgo: 2 },
  { name: 'Kevin Park', phone: '+19165550143', platform: 'both', driverId: 'UBR-5520-1184 / LYFT-60417', status: 'pending', daysAgo: 3 },
  {
    name: 'Jamal Wright', phone: '+19165550144', platform: 'uber', driverId: 'UBR-0000-0000', status: 'rejected', daysAgo: 6,
    note: "We couldn't verify your rideshare driver ID. Please send a screenshot of your driver profile.",
  },
  {
    name: 'Derek Olsen', phone: '+19165550145', platform: 'lyft', driverId: 'LYFT-51930', status: 'suspended', daysAgo: 40,
    note: 'Your driver code was used on rides you did not give.', holdPayouts: true, balance: 18.4,
  },
];

// Illustrative receipt photos for the staff queue (generic, labeled as demo data).
const SAMPLE_RECEIPTS = {
  ride: [
    { path: 'receipts/demo-samples/ride-1.svg', total: '14.82', from: 'Midtown', minutes: 11 },
    { path: 'receipts/demo-samples/ride-2.svg', total: '9.47', from: 'East Sacramento', minutes: 8 },
    { path: 'receipts/demo-samples/ride-3.svg', total: '18.30', from: 'Land Park', minutes: 15 },
  ],
  venue: [
    { path: 'receipts/demo-samples/bill-1.svg', lines: [['Avocado toast', '13.50'], ['Cold brew', '5.25'], ['Seasonal salad', '12.00']], total: '33.83' },
    { path: 'receipts/demo-samples/bill-2.svg', lines: [['Club sandwich', '14.00'], ['Iced latte', '5.75']], total: '21.64' },
  ],
};

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function rideReceiptSvg({ total, from, minutes }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
<rect width="360" height="480" fill="#fff"/><rect width="360" height="64" fill="#111827"/>
<text x="24" y="40" font-family="Helvetica,Arial" font-size="20" fill="#fff" font-weight="700">Rideshare trip receipt</text>
<text x="24" y="104" font-family="Helvetica,Arial" font-size="14" fill="#4b5563">Trip to</text>
<text x="24" y="126" font-family="Helvetica,Arial" font-size="18" fill="#111827" font-weight="700">1 Demo Plaza, Sacramento</text>
<text x="24" y="160" font-family="Helvetica,Arial" font-size="14" fill="#4b5563">From ${esc(from)} · ${minutes} min</text>
<line x1="24" y1="190" x2="336" y2="190" stroke="#e5e7eb"/>
<text x="24" y="226" font-family="Helvetica,Arial" font-size="16" fill="#111827">Trip fare</text>
<text x="336" y="226" text-anchor="end" font-family="Helvetica,Arial" font-size="16" fill="#111827">${total}</text>
<line x1="24" y1="250" x2="336" y2="250" stroke="#e5e7eb"/>
<text x="24" y="290" font-family="Helvetica,Arial" font-size="20" fill="#111827" font-weight="700">Total</text>
<text x="336" y="290" text-anchor="end" font-family="Helvetica,Arial" font-size="20" fill="#111827" font-weight="700">${total}</text>
<text x="180" y="450" text-anchor="middle" font-family="Helvetica,Arial" font-size="12" fill="#6b7280">Sample receipt · PullUp demo data</text>
</svg>`;
}

function billSvg({ lines, total }) {
  const rows = lines
    .map(([item, price], i) => `<text x="24" y="${150 + i * 30}" font-family="Courier New,monospace" font-size="16" fill="#111827">${esc(item)}</text><text x="336" y="${150 + i * 30}" text-anchor="end" font-family="Courier New,monospace" font-size="16" fill="#111827">${price}</text>`)
    .join('');
  const y = 150 + lines.length * 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
<rect width="360" height="480" fill="#fffdf7"/>
<text x="180" y="52" text-anchor="middle" font-family="Courier New,monospace" font-size="22" fill="#111827" font-weight="700">PullUp Demo Café</text>
<text x="180" y="78" text-anchor="middle" font-family="Courier New,monospace" font-size="13" fill="#4b5563">1 Demo Plaza, Sacramento CA</text>
<line x1="24" y1="110" x2="336" y2="110" stroke="#9ca3af" stroke-dasharray="4 4"/>
${rows}
<text x="24" y="${y + 10}" font-family="Courier New,monospace" font-size="14" fill="#4b5563">PullUp deal: 20% off</text>
<line x1="24" y1="${y + 30}" x2="336" y2="${y + 30}" stroke="#9ca3af" stroke-dasharray="4 4"/>
<text x="24" y="${y + 64}" font-family="Courier New,monospace" font-size="20" fill="#111827" font-weight="700">TOTAL</text>
<text x="336" y="${y + 64}" text-anchor="end" font-family="Courier New,monospace" font-size="20" fill="#111827" font-weight="700">${total}</text>
<text x="180" y="450" text-anchor="middle" font-family="Helvetica,Arial" font-size="12" fill="#6b7280">Sample receipt · PullUp demo data</text>
</svg>`;
}

async function uploadSample(path, svg) {
  // Object names include the receipts/ prefix inside the receipts bucket.
  const res = await fetch(`${URL}/storage/v1/object/receipts/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/svg+xml', 'x-upsert': 'true' },
    body: svg,
  });
  if (!res.ok) throw new Error(`upload ${path} -> ${res.status}: ${await res.text()}`);
}

async function main() {
  const staffActor = await ensurePlatformAccount(DEMO_STAFF_EMAIL, 'platform_support', 'Demo Staff');
  const adminActor = await ensurePlatformAccount(DEMO_ADMIN_EMAIL, 'platform_admin', 'Demo Admin');
  const reviewer = staffActor ?? { id: null, name: 'Demo Staff', role: 'platform_support' };
  const admin = adminActor ?? { id: null, name: 'Demo Admin', role: 'platform_admin' };

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

  // Driver applications waiting for staff (deleted with the sample riders above).
  const t0 = Date.now();
  const applicantUsers = await rest('users', {
    method: 'POST',
    prefer: 'return=representation',
    body: APPLICANTS.map((a, i) => ({
      email: `driver${i + 1}@${DEMO_RIDER_DOMAIN}`,
      full_name: a.name,
      role: 'driver',
      phone: a.phone,
    })),
  });
  await rest('driver_profiles', {
    method: 'POST',
    body: applicantUsers.map((u, i) => {
      const a = APPLICANTS[i];
      return {
        user_id: u.id,
        referral_code: `SAMPLE${'ABCD'[i]}${i + 2}`,
        rideshare_platform: a.platform,
        rideshare_driver_id: a.driverId,
        is_verified: false,
        verification_status: a.status,
        verification_note: a.note ?? null,
        payouts_on_hold: Boolean(a.holdPayouts),
        payout_balance: a.balance ?? 0,
        reviewed_at: a.status === 'pending' ? null : new Date(t0 - 2 * 86_400_000).toISOString(),
        created_at: new Date(t0 - a.daysAgo * 86_400_000).toISOString(),
      };
    }),
  });

  // Decision history for the sample drivers (deleted with them).
  const profiles = await rest(`driver_profiles?select=id,user_id&user_id=in.(${applicantUsers.map((u) => u.id).join(',')})`);
  const profileByUser = new Map(profiles.map((p) => [p.user_id, p.id]));
  const at = (days) => new Date(t0 - days * 86_400_000).toISOString();
  const events = [];
  APPLICANTS.forEach((a, i) => {
    const driver_profile_id = profileByUser.get(applicantUsers[i].id);
    // Bulk inserts need identical keys on every row.
    const by = (actor) => ({
      driver_profile_id, actor_user_id: actor.id, actor_name: actor.name, actor_role: actor.role,
      note: null, payouts_on_hold: false,
    });
    if (a.status === 'rejected') events.push({ ...by(reviewer), action: 'rejected', note: a.note, created_at: at(2) });
    if (a.status === 'suspended') {
      events.push({ ...by(reviewer), action: 'approved', note: null, created_at: at(a.daysAgo - 1) });
      events.push({ ...by(admin), action: 'suspended', note: a.note, payouts_on_hold: true, created_at: at(2) });
    }
  });
  if (events.length) await rest('driver_review_events', { method: 'POST', body: events });

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
      requires_venue_receipt: Boolean(d.requires_venue_receipt),
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
    // Drivers are credited per claim (referring_driver_id), not via sign-up
    // referrals; clear any legacy rows so the demo only reflects claims.
    await rest(`referrals?driver_id=eq.${driverProfile.id}`, { method: 'DELETE' });
    // Present the demo driver as verified so the earnings screens are unlocked.
    await rest(`driver_profiles?id=eq.${driverProfile.id}`, {
      method: 'PATCH',
      body: { is_verified: true, verification_status: 'approved', verification_note: null, payouts_on_hold: false,
              reviewed_at: new Date(now.getTime() - 29 * DAY).toISOString() },
    });
    await rest(`driver_review_events?driver_profile_id=eq.${driverProfile.id}`, { method: 'DELETE' });
    await rest('driver_review_events', {
      method: 'POST',
      body: [{
        driver_profile_id: driverProfile.id, actor_user_id: reviewer.id, actor_name: reviewer.name,
        actor_role: reviewer.role, action: 'approved', created_at: new Date(now.getTime() - 29 * DAY).toISOString(),
      }],
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
      }, {
        deal_claim_id: c.id,
        type: 'ride_reimbursement',
        amount: Number(d.ride_credit_amount),
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

  await Promise.all([
    ...SAMPLE_RECEIPTS.ride.map((r) => uploadSample(r.path, rideReceiptSvg(r))),
    ...SAMPLE_RECEIPTS.venue.map((r) => uploadSample(r.path, billSvg(r))),
  ]);

  const dealNeeds = (c) => dealById.get(c.deal_id);
  const completedNeeding = inserted
    .filter((c) => c.status === 'completed' && (dealNeeds(c).requires_ride_receipt || dealNeeds(c).requires_venue_receipt))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const demoRiderNeeding = appRider ? completedNeeding.filter((c) => c.rider_user_id === appRider.id) : [];
  const inReview = completedNeeding.filter((c) => !appRider || c.rider_user_id !== appRider.id).slice(0, 4);
  const [riderToUpload, riderRejected] = demoRiderNeeding;
  const held = [...inReview, riderToUpload, riderRejected].filter(Boolean);
  const heldIds = new Set(held.map((c) => c.id));
  const ids = (list) => list.map((c) => c.id).join(',');
  const HELD_FLAGS = { ride_credit_paid: false, driver_kickback_paid: false, venue_charged: false, ride_receipt_verified: false };

  // Approved history.
  const approved = completedNeeding.filter((c) => !heldIds.has(c.id));
  const approvedRide = approved.filter((c) => dealNeeds(c).requires_ride_receipt);
  const approvedVenue = approved.filter((c) => dealNeeds(c).requires_venue_receipt);
  if (approvedRide.length) {
    await rest(`deal_claims?id=in.(${ids(approvedRide)})`, {
      method: 'PATCH',
      body: { ride_receipt_url: SAMPLE_RECEIPTS.ride[0].path, ride_receipt_status: 'approved', ride_receipt_verified: true },
    });
  }
  if (approvedVenue.length) {
    await rest(`deal_claims?id=in.(${ids(approvedVenue)})`, {
      method: 'PATCH',
      body: { venue_receipt_url: SAMPLE_RECEIPTS.venue[0].path, venue_receipt_status: 'approved' },
    });
    // Bill totals staff recorded from those receipts ($22–48), shown to the venue as real spend.
    await Promise.all(
      approvedVenue.map((c) =>
        rest(`deal_claims?id=eq.${c.id}`, {
          method: 'PATCH',
          body: { venue_bill_amount: Number((22 + rand() * 26).toFixed(2)) },
        })
      )
    );
  }

  // Waiting for staff: the first one has its ride receipt approved and the bill still pending.
  for (const [i, c] of inReview.entries()) {
    const d = dealNeeds(c);
    const rideApproved = i === 0 && d.requires_venue_receipt;
    await rest(`deal_claims?id=eq.${c.id}`, {
      method: 'PATCH',
      body: {
        ...HELD_FLAGS,
        ...(d.requires_ride_receipt
          ? {
              ride_receipt_url: SAMPLE_RECEIPTS.ride[i % SAMPLE_RECEIPTS.ride.length].path,
              ride_receipt_status: rideApproved ? 'approved' : 'pending_review',
              ride_receipt_verified: rideApproved,
            }
          : {}),
        ...(d.requires_venue_receipt
          ? { venue_receipt_url: SAMPLE_RECEIPTS.venue[i % SAMPLE_RECEIPTS.venue.length].path, venue_receipt_status: 'pending_review' }
          : {}),
      },
    });
  }

  // Demo rider: newest visit still needs receipts; the one before had a photo rejected.
  if (riderToUpload) {
    await rest(`deal_claims?id=eq.${riderToUpload.id}`, {
      method: 'PATCH',
      body: { ...HELD_FLAGS, ride_receipt_url: null, ride_receipt_status: null, venue_receipt_url: null, venue_receipt_status: null },
    });
  }
  if (riderRejected) {
    await rest(`deal_claims?id=eq.${riderRejected.id}`, {
      method: 'PATCH',
      body: {
        ...HELD_FLAGS,
        ride_receipt_url: dealNeeds(riderRejected).requires_ride_receipt ? SAMPLE_RECEIPTS.ride[1].path : null,
        ride_receipt_status: dealNeeds(riderRejected).requires_ride_receipt ? 'rejected' : null,
      },
    });
  }

  // Older visits whose receipts never came in: closed as not verified (no charge).
  const DEADLINE_MS = 7 * 86_400_000;
  const closedCandidates = approved
    .filter((c) => now.getTime() - new Date(c.completed_at).getTime() > DEADLINE_MS + 86_400_000)
    .filter((c) => !appRider || c.rider_user_id !== appRider.id)
    .slice(0, 3);
  for (const c of closedCandidates) {
    await rest(`deal_claims?id=eq.${c.id}`, {
      method: 'PATCH',
      body: {
        ...HELD_FLAGS,
        ride_receipt_url: null, ride_receipt_status: null, venue_receipt_url: null, venue_receipt_status: null,
        venue_bill_amount: null,
        unverified_at: new Date(new Date(c.completed_at).getTime() + DEADLINE_MS).toISOString(),
      },
    });
    heldIds.add(c.id);
  }
  if (closedCandidates.length) {
    await rest(`transactions?deal_claim_id=in.(${ids(closedCandidates)})`, { method: 'PATCH', body: { status: 'voided' } });
  }

  // One visit still waiting on its rider, due in under a day.
  const nearlyDue = approved.find(
    (c) =>
      !closedCandidates.includes(c) &&
      (!appRider || c.rider_user_id !== appRider.id) &&
      now.getTime() - new Date(c.completed_at).getTime() < DEADLINE_MS
  );
  if (nearlyDue) {
    await rest(`deal_claims?id=eq.${nearlyDue.id}`, {
      method: 'PATCH',
      body: {
        ...HELD_FLAGS,
        ride_receipt_url: null, ride_receipt_status: null, venue_receipt_url: null, venue_receipt_status: null,
        venue_bill_amount: null,
        receipt_due_at: new Date(now.getTime() + 18 * 3_600_000).toISOString(),
      },
    });
    held.push(nearlyDue);
    heldIds.add(nearlyDue.id);
  }
  console.log(`Deadlines: ${closedCandidates.length} visits closed as not verified${nearlyDue ? ', 1 due within a day' : ''}`);

  // Money for held visits isn't settled until receipts are approved.
  if (held.length) {
    await rest(`transactions?deal_claim_id=in.(${ids(held)})`, { method: 'PATCH', body: { status: 'pending' } });
  }
  for (const c of inserted) {
    if (heldIds.has(c.id)) c.driver_kickback_paid = false;
  }
  console.log(`Receipts: ${inReview.length} visits waiting for staff, ${approved.length} approved (${approvedVenue.length} with bill totals)${
    riderToUpload ? ', demo rider has 1 to upload' : ''}${riderRejected ? ' and 1 rejected' : ''}`);
  console.log(`Driver applications: ${APPLICANTS.filter((a) => a.status === 'pending').length} pending, ${
    APPLICANTS.filter((a) => a.status === 'rejected').length} rejected`);

  const byStatus = inserted.reduce((acc, c) => ((acc[c.status] = (acc[c.status] || 0) + 1), acc), {});
  console.log(`Created ${riders.length} demo riders, ${deals.length} deals, ${inserted.length} claims`, byStatus, `${txns.length} transactions`);

  if (driverProfile) {
    const bonuses = inserted.filter((c) => c.status === 'completed' && c.referring_driver_id && !heldIds.has(c.id));
    const earned = bonuses.reduce((s, c) => s + Number(dealById.get(c.deal_id).driver_kickback_amount), 0);
    const unpaid = bonuses
      .filter((c) => !c.driver_kickback_paid)
      .reduce((s, c) => s + Number(dealById.get(c.deal_id).driver_kickback_amount), 0);
    await rest(`driver_profiles?id=eq.${driverProfile.id}`, {
      method: 'PATCH',
      body: { total_earnings: Number(earned.toFixed(2)), payout_balance: Number(unpaid.toFixed(2)) },
    });
    // Bonuses already paid out were sent in one earlier cash-out.
    await rest(`driver_transactions?user_id=eq.${appDriver.id}`, { method: 'DELETE' });
    const paidOut = earned - unpaid;
    if (paidOut > 0) {
      await rest('driver_transactions', {
        method: 'POST',
        body: [{ user_id: appDriver.id, type: 'cashout', amount: Number(paidOut.toFixed(2)), status: 'completed',
                 created_at: new Date(now.getTime() - 8 * DAY).toISOString() }],
      });
    }
    console.log(`Demo driver: ${referredIds.size} riders, ${bonuses.length} bonuses, ${earned.toFixed(2)} earned, ${unpaid.toFixed(2)} unpaid`);
  } else {
    console.log(`No demo driver (${DEMO_DRIVER_EMAIL}) yet; skipped driver data.`);
  }
  if (appRider) {
    // Ride credit: approved visits add to the balance; one earlier cash-out.
    const credited = inserted
      .filter((c) => c.rider_user_id === appRider.id && c.status === 'completed' && !heldIds.has(c.id))
      .reduce((sum, c) => sum + Number(dealById.get(c.deal_id).ride_credit_amount), 0);
    const cashedOut = Math.min(credited, 10);
    await rest(`rider_transactions?user_id=eq.${appRider.id}`, { method: 'DELETE' });
    if (cashedOut > 0) {
      await rest('rider_transactions', {
        method: 'POST',
        body: [{ user_id: appRider.id, type: 'cashout', amount: cashedOut, status: 'completed',
                 created_at: new Date(now.getTime() - 9 * DAY).toISOString() }],
      });
    }
    await rest(`rider_profiles?user_id=eq.${appRider.id}`, {
      method: 'PATCH',
      body: { balance: Number((credited - cashedOut).toFixed(2)) },
    });
    console.log(`Demo rider: ${inserted.filter((c) => c.rider_user_id === appRider.id).length} claims, ${(credited - cashedOut).toFixed(2)} ride credit`);
  } else {
    console.log(`No demo rider (${DEMO_RIDER_EMAIL}) yet; skipped rider data.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
