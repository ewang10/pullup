#!/usr/bin/env node
/**
 * Create the demo accounts and venue in a fresh local Supabase (CI), so
 * scripts/seed-demo.mjs can fill in the demo data the same way it does for
 * the hosted demo. Never run this against the hosted project.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CI_DEMO_PASSWORD
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.CI_DEMO_PASSWORD;

if (!URL || !KEY || !PASSWORD) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or CI_DEMO_PASSWORD');
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  console.error(`Refusing to bootstrap ${URL}: this script is for local CI databases only.`);
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function call(path, method, body) {
  const res = await fetch(`${URL}${path}`, { method, headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Staff and admin sign up as riders; seed-demo.mjs promotes them, as it does
// for the hosted demo (sign-up can't create staff accounts).
const ACCOUNTS = [
  { email: 'pullup.demo.app@gmail.com', role: 'venue_admin', full_name: 'Demo Venue Owner' },
  { email: 'pullup.demo.app+rider@gmail.com', role: 'rider', full_name: 'Demo Rider' },
  {
    email: 'pullup.demo.app+driver@gmail.com',
    role: 'driver',
    full_name: 'Demo Driver',
    extra: { rideshare_platform: 'uber', rideshare_driver_id: 'UBR-DEMO-0001' },
  },
  { email: 'pullup.demo.app+staff@gmail.com', role: 'rider', full_name: 'Demo Staff' },
  { email: 'pullup.demo.app+admin@gmail.com', role: 'rider', full_name: 'Demo Admin' },
];

const ids = {};
for (const a of ACCOUNTS) {
  const user = await call('/auth/v1/admin/users', 'POST', {
    email: a.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: a.role, full_name: a.full_name, ...(a.extra ?? {}) },
  });
  ids[a.email] = user.id;
  console.log(`${a.email}: ${a.role}`);
}

await call('/rest/v1/venues', 'POST', {
  owner_user_id: ids['pullup.demo.app@gmail.com'],
  name: 'Demo Café',
  category: 'restaurant',
  address: '1 Demo Plaza',
  city: 'Sacramento',
  state: 'CA',
});
console.log('Venue: Demo Café');
